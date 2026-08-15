import { prisma } from "@/lib/prisma";
import { ingestObservations } from "@/lib/pricing/ingest";
import {
  fetchFlyerItems,
  toObservations,
  type NormalizedFlyerItem,
} from "@/lib/pricing/adapters/flipp";
import { matchProduct, type CanonicalProduct } from "@/lib/pricing/match";
import type { IngestResult } from "@/lib/pricing/types";

/**
 * One full Flipp cycle: fetch → match → ingest, with a ScrapeRun per store.
 *
 * Shared by the CLI script and the Inngest job so both behave identically.
 */

/**
 * Search terms.
 *
 * Flipp has no "list every item" endpoint — you search. These are chosen to
 * span the seeded catalogue's categories rather than to be exhaustive; §1's
 * framing is "the basket that matters, not the whole catalogue".
 */
export const DEFAULT_SEARCH_TERMS = [
  "milk", "bread", "eggs", "butter", "cheese", "yogurt",
  "chicken", "beef", "pork", "salmon", "bacon",
  "apple", "banana", "potato", "onion", "carrot", "tomato", "lettuce",
  "pasta", "rice", "cereal", "flour", "sugar", "coffee", "tea",
  "juice", "soda", "water",
  "frozen pizza", "ice cream", "chips", "cookies",
  "paper towel", "toilet paper", "detergent",
];

export const ST_JOHNS_POSTAL_CODE = "A1B4P1";

export type FlippRunOptions = {
  postalCode?: string;
  terms?: string[];
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  /** Set to {min:0,max:0} in tests; production wants §3's 2-10s jitter. */
  delayMs?: { min: number; max: number };
  /** Log progress to stdout. */
  verbose?: boolean;
};

export type FlippRunSummary = {
  fetched: number;
  matched: number;
  unmatched: number;
  byStore: Record<string, IngestResult & { storeName: string }>;
  flyersUpserted: number;
  imagesBackfilled: number;
  errors: string[];
};

/**
 * Ensure a StoreProduct row exists for a (store, product) pair.
 *
 * Flyer items routinely reference products a store has no mapping for yet —
 * especially the NL independents, which have no catalogue mapping at all.
 * Creating the row on demand is what lets their sale prices show up.
 */
async function ensureStoreProduct(
  storeId: string,
  productId: string,
): Promise<void> {
  await prisma.storeProduct.upsert({
    where: { storeId_productId: { storeId, productId } },
    update: {},
    create: { storeId, productId, isActive: true },
  });
}

export async function runFlippCycle(
  opts: FlippRunOptions = {},
): Promise<FlippRunSummary> {
  const log = (msg: string) => {
    if (opts.verbose) console.log(msg);
  };
  const observedAt = new Date();

  // Only stores we actually carry — Flipp returns pharmacies, hardware and
  // restaurants for the same postal code.
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, chain: true, name: true },
  });
  const storeByChain = new Map(stores.map((s) => [s.chain.toLowerCase(), s]));

  const products: CanonicalProduct[] = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      brand: true,
      unitSize: true,
      unitQuantity: true,
      unitMeasure: true,
    },
  }).then((rows) =>
    rows.map((r) => ({
      ...r,
      unitQuantity: r.unitQuantity ? Number(r.unitQuantity) : null,
    })),
  );

  log(`Catalogue: ${products.length} products across ${stores.length} stores`);
  log(`Fetching Flipp for ${opts.terms?.length ?? DEFAULT_SEARCH_TERMS.length} terms…`);

  const { items, errors } = await fetchFlyerItems({
    postalCode: opts.postalCode ?? ST_JOHNS_POSTAL_CODE,
    terms: opts.terms ?? DEFAULT_SEARCH_TERMS,
    chains: [...storeByChain.keys()],
    fetchImpl: opts.fetchImpl,
    delayMs: opts.delayMs,
  });

  log(`Fetched ${items.length} flyer items (${errors.length} errors)`);

  // ── Match ────────────────────────────────────────────────────────────────
  const matches: {
    item: NormalizedFlyerItem;
    storeId: string;
    productId: string;
  }[] = [];
  let unmatched = 0;

  for (const item of items) {
    const store = storeByChain.get(item.chain);
    if (!store) continue; // merchant we don't carry

    const match = matchProduct(item.name, products);
    if (!match) {
      unmatched += 1;
      continue;
    }
    matches.push({ item, storeId: store.id, productId: match.productId });
  }

  log(`Matched ${matches.length}, discarded ${unmatched} unmatched`);

  // ── Flyer rows ───────────────────────────────────────────────────────────
  // So /api/flyers serves real data instead of the seeded placeholders.
  let flyersUpserted = 0;
  const seenFlyers = new Set<string>();
  for (const { item, storeId } of matches) {
    if (!item.flyerId || seenFlyers.has(item.flyerId)) continue;
    if (!item.validFrom || !item.validTo) continue;
    seenFlyers.add(item.flyerId);

    const id = `flyer_flipp_${item.flyerId}`;
    await prisma.flyer.upsert({
      where: { id },
      update: { validFrom: item.validFrom, validUntil: item.validTo },
      create: {
        id,
        storeId,
        title: `${item.merchantName} weekly flyer`,
        imageUrl: item.imageUrl ?? "",
        validFrom: item.validFrom,
        validUntil: item.validTo,
      },
    });
    flyersUpserted += 1;
  }

  // ── Product images ───────────────────────────────────────────────────────
  // Every seeded product has image_url = NULL. Flipp is currently the only
  // verified source of real product photography.
  //
  // NOTE: these are hotlinked wishabi.net URLs — fine for local development,
  // but they should be proxied to Blob storage before this ships (the URLs are
  // not guaranteed stable and hotlinking is ToS-grey).
  let imagesBackfilled = 0;
  const imageByProduct = new Map<string, string>();
  for (const { item, productId } of matches) {
    if (item.imageUrl && !imageByProduct.has(productId)) {
      imageByProduct.set(productId, item.imageUrl);
    }
  }
  for (const [productId, imageUrl] of imageByProduct) {
    const { count } = await prisma.product.updateMany({
      where: { id: productId, imageUrl: null },
      data: { imageUrl },
    });
    imagesBackfilled += count;
  }

  // ── Ingest, one ScrapeRun per store ──────────────────────────────────────
  const byStore: FlippRunSummary["byStore"] = {};
  const grouped = new Map<string, typeof matches>();
  for (const m of matches) {
    const list = grouped.get(m.storeId) ?? [];
    list.push(m);
    grouped.set(m.storeId, list);
  }

  for (const [storeId, storeMatches] of grouped) {
    const store = stores.find((s) => s.id === storeId)!;

    const run = await prisma.scrapeRun.create({
      data: { storeId, status: "running", totalProducts: storeMatches.length },
    });

    // Flyer items can reference products this store has no mapping for.
    for (const m of storeMatches) await ensureStoreProduct(storeId, m.productId);

    const { observations } = toObservations(storeMatches, observedAt);
    const result = await ingestObservations(observations, { now: observedAt });

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: result.rejected.length === storeMatches.length && storeMatches.length > 0
          ? "failed"
          : "completed",
        finishedAt: new Date(),
        successCount: result.accepted,
        errorCount: result.rejected.length,
        errorDetails: result.rejected.length
          ? JSON.parse(JSON.stringify(result.rejected.slice(0, 50)))
          : undefined,
      },
    });

    byStore[store.chain] = { ...result, storeName: store.name };
    log(
      `  ${store.name}: ${result.accepted} accepted, ${result.updated} price updates, ${result.rejected.length} rejected`,
    );
  }

  return {
    fetched: items.length,
    matched: matches.length,
    unmatched,
    byStore,
    flyersUpserted,
    imagesBackfilled,
    errors,
  };
}
