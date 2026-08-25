import { prisma } from "@/lib/prisma";
import {
  matchProductByBarcodeOrName,
  type CanonicalProduct,
} from "@/lib/pricing/match";
import { ingestObservations } from "@/lib/pricing/ingest";
import type { PriceObservation } from "@/lib/pricing/types";

/**
 * Shared core for manual price entry.
 *
 * Both the programmatic endpoint (`/api/admin/observations`) and the paste-and-
 * review import (`/api/capture/import`) resolve, preview and write through
 * this, so the two can never drift on matching rules or on what "suspicious"
 * means.
 */

export type IngestItemInput = {
  barcode?: string | null;
  /** Already includes brand and size — see `matchNameFor()`. */
  name?: string | null;
  price: number;
  isSale?: boolean;
  regularPrice?: number | null;
  saleEndDate?: Date | null;
  storeSku?: string | null;
};

export type PreviewRow = {
  index: number;
  productId: string;
  matchedName: string | null;
  matchedSize: string | null;
  capturedName: string | null;
  price: number;
  existingPrice: number | null;
  via: string;
  suspicious: boolean;
};

export type UnresolvedRow = {
  index: number;
  barcode: string | null;
  name: string | null;
  /**
   * `duplicate_product` means this row matched a product another row in the
   * same submission already claimed. It is reported rather than dropped: when
   * several *distinct* captured items collapse onto one catalogue product,
   * that is usually a matcher fault, and staying silent hides the evidence.
   * A Voilà bread capture collapsed four different Dempster's loaves onto one
   * catalogue row, and the preview showed 1 of 12 with no account of the rest.
   */
  reason: "no_match" | "duplicate_product";
  /** For `duplicate_product`: what the row it lost to matched to. */
  collidedWith?: string | null;
};

export type IngestItemsResult = {
  submitted: number;
  resolved: number;
  preview: PreviewRow[];
  unresolved: UnresolvedRow[];
  accepted: number;
  updated: number;
  rejected: { productId: string; reason: string; detail: string }[];
};

/**
 * A price this far from the one already held is probably a bad name match.
 *
 * Flagged, never blocked — the same shape is also what a genuine sale looks
 * like, so the call belongs to a human. This threshold is what surfaced a
 * $5.97 bag of chicken nuggets matched to a $16.00 pack of chicken breasts.
 */
export const SUSPICIOUS_RATIO = 1.8;

export async function resolveAndIngest(opts: {
  storeId: string;
  items: IngestItemInput[];
  submittedBy: string;
  observedAt: Date;
  now: Date;
  dryRun: boolean;
  /** Indexes the reviewer unticked; never written. */
  skipIndexes?: number[];
}): Promise<IngestItemsResult> {
  const { storeId, items, submittedBy, observedAt, now, dryRun } = opts;
  const skip = new Set(opts.skipIndexes ?? []);

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
  const unresolved: UnresolvedRow[] = [];
  const resolved: { index: number; productId: string; via: string }[] = [];

  // One product may only be observed once per submission — a duplicate would
  // append two history rows for a single sighting.
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
    if (seenProductIds.has(match.productId)) {
      unresolved.push({
        index,
        barcode: item.barcode ?? null,
        name: item.name ?? null,
        reason: "duplicate_product",
        collidedWith: match.productId,
      });
      continue;
    }
    seenProductIds.add(match.productId);

    resolved.push({ index, productId: match.productId, via: match.reason });

    if (skip.has(index)) continue;

    observations.push({
      storeId,
      productId: match.productId,
      price: item.price,
      isSale: item.isSale ?? false,
      regularPrice: item.regularPrice ?? null,
      saleEndDate: item.saleEndDate ?? null,
      source: "manual",
      observedAt,
      submittedBy,
      storeProductName: item.name ?? null,
      storeSku: item.storeSku ?? null,
    });
  }

  // Enrich with what each item matched *to* and what it already costs here.
  // "48 matched" is not reviewable; "nuggets → Chicken Breasts, $5.97 vs
  // $16.00" is.
  const matched = await prisma.product.findMany({
    where: { id: { in: resolved.map((r) => r.productId) } },
    select: {
      id: true,
      name: true,
      brand: true,
      unitSize: true,
      storeProducts: { where: { storeId }, select: { currentPrice: true } },
    },
  });
  const byId = new Map(matched.map((p) => [p.id, p]));

  // A collision names a product some earlier row resolved to, so it is always
  // present in `byId`. Swap the id for something a reviewer can read.
  for (const u of unresolved) {
    if (u.reason !== "duplicate_product" || !u.collidedWith) continue;
    const p = byId.get(u.collidedWith);
    u.collidedWith = p ? [p.brand, p.name].filter(Boolean).join(" ") : null;
  }

  const preview: PreviewRow[] = resolved.map((r) => {
    const p = byId.get(r.productId);
    const existing = p?.storeProducts[0]?.currentPrice;
    const existingPrice = existing == null ? null : Number(existing);
    const price = items[r.index].price;
    return {
      index: r.index,
      productId: r.productId,
      matchedName: p ? [p.brand, p.name].filter(Boolean).join(" ") : null,
      matchedSize: p?.unitSize ?? null,
      capturedName: items[r.index].name ?? null,
      price,
      existingPrice,
      via: r.via,
      suspicious:
        existingPrice !== null &&
        (price / existingPrice >= SUSPICIOUS_RATIO ||
          existingPrice / price >= SUSPICIOUS_RATIO),
    };
  });

  if (dryRun) {
    return {
      submitted: items.length,
      resolved: resolved.length,
      preview,
      unresolved,
      accepted: 0,
      updated: 0,
      rejected: [],
    };
  }

  // `ingestObservations()` rejects an observation whose StoreProduct row is
  // missing — and for a store being seeded for the first time, none exist.
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

  return {
    submitted: items.length,
    resolved: resolved.length,
    preview,
    unresolved,
    accepted: result.accepted,
    updated: result.updated,
    rejected: result.rejected.map((r) => ({
      productId: r.observation.productId,
      reason: r.reason,
      detail: r.detail,
    })),
  };
}
