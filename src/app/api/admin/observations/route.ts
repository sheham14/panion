import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateBody, idSchema } from "@/lib/validate";
import { badRequest, forbidden, notFound } from "@/lib/api-error";
import { requireElevatedRole, canWriteStore } from "@/lib/admin/require-role";
import {
  matchProductByBarcodeOrName,
  type CanonicalProduct,
} from "@/lib/pricing/match";
import { ingestObservations } from "@/lib/pricing/ingest";
import type { PriceObservation } from "@/lib/pricing/types";
import { MIN_PRICE, MAX_PRICE } from "@/lib/pricing/types";

/**
 * Bulk price entry — the manual ingestion path.
 *
 * This exists because every automated source is either disallowed, walled, or
 * insufficient: PC Express and Voilà disallow API access in `robots.txt`,
 * Walmart permits crawling but blocks it with PerimeterX, and Flipp only ever
 * returns flyer specials (a full run matched 9 of 250 products, none of them
 * Sobeys). Prices a person read with their own eyes carry no such asterisk.
 *
 * It is also the endpoint a browser-side capture tool posts to, and the
 * eventual backbone for crowdsourced contributions — which is why resolution
 * is barcode-first and the writer is the shared `ingestObservations()` rather
 * than a bespoke path. Everything downstream (validation bounds, sale
 * precedence, price history) therefore behaves identically to a scrape.
 */

const ItemSchema = z
  .object({
    /** Preferred — an exact GS1 join. */
    barcode: z.string().trim().max(32).optional().nullable(),
    /** Fallback when no barcode is available (store brands, produce, bakery). */
    name: z.string().trim().min(2).max(200).optional().nullable(),
    price: z
      .number()
      .finite()
      .min(MIN_PRICE, { message: `Price below ${MIN_PRICE} is a parse error` })
      .max(MAX_PRICE, { message: `Price above ${MAX_PRICE} is a parse error` })
      .refine((n) => Number.isInteger(Math.round(n * 100)), {
        message: "Price may have at most 2 decimal places",
      }),
    isSale: z.boolean().optional().default(false),
    regularPrice: z.number().finite().positive().max(MAX_PRICE).optional().nullable(),
    saleEndDate: z.coerce.date().optional().nullable(),
    storeSku: z.string().trim().max(64).optional().nullable(),
  })
  // Without one of these there is nothing to resolve against.
  .refine((i) => Boolean(i.barcode?.length || i.name?.length), {
    message: "Each item needs a barcode or a name",
  });

const BodySchema = z.object({
  storeId: idSchema,
  /**
   * When the prices were seen. Defaults to now; entering yesterday's aisle
   * notes should not claim to be today's observation, because
   * `shouldReplaceCurrent()` resolves conflicts by recency.
   */
  observedAt: z.coerce.date().optional(),
  items: z.array(ItemSchema).min(1).max(500),
});

/** Why an item could not be attached to a product. */
type Unresolved = {
  index: number;
  barcode: string | null;
  name: string | null;
  reason: "no_match" | "low_confidence";
};

export async function POST(req: NextRequest) {
  const { user, role, managedStoreId, error } = await requireElevatedRole();
  if (error) return error;

  const { data, error: invalid } = await validateBody(req, BodySchema);
  if (invalid) return invalid;

  const { storeId, items } = data;

  if (!canWriteStore(role, managedStoreId, storeId)) {
    return forbidden("You may not write prices for this store");
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, isActive: true },
  });
  if (!store) return notFound("Store not found");
  if (!store.isActive) return badRequest("Store is not active");

  const now = new Date();
  const observedAt = data.observedAt ?? now;
  // A future observation would win every recency comparison forever.
  if (observedAt.getTime() > now.getTime() + 60_000) {
    return badRequest("observedAt cannot be in the future");
  }

  // The whole active catalogue is the match space. At 250 products this is one
  // cheap query; if the catalogue grows past a few thousand this should become
  // a barcode-indexed lookup plus a narrowed name-match candidate set.
  const catalogue: CanonicalProduct[] = (
    await prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        brand: true,
        unitSize: true,
        unitQuantity: true,
        unitMeasure: true,
        barcode: true,
      },
    })
  ).map((p) => ({
    ...p,
    unitQuantity: p.unitQuantity === null ? null : Number(p.unitQuantity),
  }));

  const observations: PriceObservation[] = [];
  const unresolved: Unresolved[] = [];
  const resolved: { index: number; productId: string; via: string }[] = [];

  // One product may only be observed once per submission — a duplicated row
  // would otherwise append two history entries for the same sighting.
  const seenProductIds = new Set<string>();

  for (const [index, item] of items.entries()) {
    const match = matchProductByBarcodeOrName(
      { barcode: item.barcode, name: item.name ?? "" },
      catalogue,
    );

    if (!match) {
      unresolved.push({
        index,
        barcode: item.barcode ?? null,
        name: item.name ?? null,
        reason: "no_match",
      });
      continue;
    }

    if (seenProductIds.has(match.productId)) continue;
    seenProductIds.add(match.productId);

    resolved.push({ index, productId: match.productId, via: match.reason });

    observations.push({
      storeId,
      productId: match.productId,
      price: item.price,
      isSale: item.isSale,
      regularPrice: item.regularPrice ?? null,
      saleEndDate: item.saleEndDate ?? null,
      source: "manual",
      observedAt,
      submittedBy: user.id,
      storeProductName: item.name ?? null,
      storeSku: item.storeSku ?? null,
    });
  }

  // `ingestObservations()` rejects an observation whose StoreProduct row does
  // not exist — and for a store being seeded for the first time, none do.
  await Promise.all(
    observations.map((o) =>
      prisma.storeProduct.upsert({
        where: { storeId_productId: { storeId, productId: o.productId } },
        create: { storeId, productId: o.productId, isActive: true },
        update: { isActive: true },
      }),
    ),
  );

  const result = await ingestObservations(observations, { now });

  return NextResponse.json({
    store: { id: store.id, name: store.name },
    observedAt,
    submitted: items.length,
    resolved: resolved.length,
    accepted: result.accepted,
    updated: result.updated,
    unresolved,
    // Surfaced verbatim so the entry UI can show *why* a price bounced —
    // an implausible swing usually means a per-kg price typed as per-item.
    rejected: result.rejected.map((r) => ({
      productId: r.observation.productId,
      reason: r.reason,
      detail: r.detail,
    })),
  });
}
