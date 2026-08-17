import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateBody, idSchema } from "@/lib/validate";
import { badRequest, forbidden, notFound } from "@/lib/api-error";
import { requireElevatedRole, canWriteStore } from "@/lib/admin/require-role";
import { resolveAndIngest } from "@/lib/admin/ingest-items";
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
   * Resolve and report without writing anything.
   *
   * The import UI previews with this before committing. That review step is
   * the point: captures from Walmart and Voilà carry no barcode, so every
   * match is name-and-size and the same code path once matched a bag of
   * chicken nuggets to a pack of chicken breasts. Seeing what will be written
   * is how that gets caught before it is in the database rather than after.
   */
  dryRun: z.boolean().optional().default(false),
  /**
   * When the prices were seen. Defaults to now; entering yesterday's aisle
   * notes should not claim to be today's observation, because
   * `shouldReplaceCurrent()` resolves conflicts by recency.
   */
  observedAt: z.coerce.date().optional(),
  items: z.array(ItemSchema).min(1).max(500),
});

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

  const result = await resolveAndIngest({
    storeId,
    items: items.map((i) => ({
      barcode: i.barcode,
      name: i.name,
      price: i.price,
      isSale: i.isSale,
      regularPrice: i.regularPrice,
      saleEndDate: i.saleEndDate,
      storeSku: i.storeSku,
    })),
    submittedBy: user.id,
    observedAt,
    now,
    dryRun: data.dryRun,
  });

  return NextResponse.json({
    dryRun: data.dryRun,
    store: { id: store.id, name: store.name },
    observedAt,
    ...result,
  });
}
