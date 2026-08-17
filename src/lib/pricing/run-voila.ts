import { prisma } from "@/lib/prisma";
import { ingestObservations } from "@/lib/pricing/ingest";
import {
  fetchVoilaProducts,
  toObservations,
  looksRegionScoped,
  type NormalizedVoilaProduct,
} from "@/lib/pricing/adapters/voila";
import { matchProduct, type CanonicalProduct } from "@/lib/pricing/match";
import type { IngestResult } from "@/lib/pricing/types";
import { ALL_CATALOGUE_TERMS } from "@/lib/pricing/catalogue-terms";

/**
 * One Voilà (Sobeys) cycle: fetch → match → ingest, with a ScrapeRun.
 *
 * Structurally the PC Express run minus everything barcode-shaped, because
 * Voilà publishes no GS1 identifier at all. That has two consequences worth
 * being explicit about:
 *
 *  - Matching is name-and-size only, so it inherits every gate in `match.ts`
 *    and will legitimately discard items it cannot place. A lower match count
 *    here is correct behaviour, not a regression.
 *  - There is no catalogue backfill. Nothing in this payload can establish a
 *    product's identity, so this run only ever *prices* products that
 *    PC Express already established.
 */

export type VoilaRunOptions = {
  terms?: string[];
  sessionCookie?: string;
  fetchImpl?: typeof fetch;
  delayMs?: { min: number; max: number };
  verbose?: boolean;
  /**
   * Skip the region assertion. Only for tests — running this against a
   * de-scoped session writes another province's prices into a St. John's store.
   */
  skipRegionCheck?: boolean;
};

export type VoilaRunSummary = {
  fetched: number;
  matched: number;
  unmatched: number;
  ingest: (IngestResult & { storeName: string }) | null;
  errors: string[];
};

export async function runVoilaCycle(
  opts: VoilaRunOptions = {},
): Promise<VoilaRunSummary> {
  const log = (m: string) => {
    if (opts.verbose) console.log(m);
  };
  const observedAt = new Date();

  const sessionCookie = opts.sessionCookie ?? process.env.VOILA_SESSION_COOKIE;
  if (!sessionCookie) {
    throw new Error(
      "VOILA_SESSION_COOKIE is not set. Voilà scopes prices to the session, " +
        "not to a query parameter — without a St. John's session this returns " +
        "another province's prices. See .env.example.",
    );
  }

  const store = await prisma.store.findFirst({
    where: { chain: "sobeys", isActive: true },
    select: { id: true, name: true },
  });
  if (!store) throw new Error('No active store row with chain "sobeys"');

  const products: CanonicalProduct[] = await prisma.product
    .findMany({
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
    .then((rows) =>
      rows.map((r) => ({
        ...r,
        unitQuantity: r.unitQuantity ? Number(r.unitQuantity) : null,
      })),
    );

  /**
   * The 160-term list, not the 44-term one PC Express uses.
   *
   * The catalogue was *built* from `ALL_CATALOGUE_TERMS`, so anything narrower
   * cannot reach every product in it — the first run used the shorter list and
   * never searched most categories at all.
   */
  const terms = opts.terms ?? ALL_CATALOGUE_TERMS;
  log(`Fetching Voilà (Sobeys) — ${terms.length} terms…`);

  const { products: fetched, errors } = await fetchVoilaProducts({
    terms,
    sessionCookie,
    fetchImpl: opts.fetchImpl,
    delayMs: opts.delayMs,
  });

  log(`Fetched ${fetched.length} products (${errors.length} errors)`);

  /**
   * Refuse to write anything from a session that is no longer St. John's.
   *
   * An expired session does not fail — it returns a valid 200 for a default
   * region, which is the worst failure mode available: it looks exactly like
   * success while quoting prices no local shopper will ever see. Aborting is
   * the only safe response, since these observations would otherwise displace
   * correct ones by recency.
   */
  if (!opts.skipRegionCheck && fetched.length > 0 && !looksRegionScoped(fetched)) {
    throw new Error(
      "Voilà returned no Newfoundland dairy brands (Central Dairies / " +
        "Scotsburn), which means VOILA_SESSION_COOKIE is no longer scoped to " +
        "St. John's. Refusing to ingest another region's prices. Re-capture " +
        "the cookie from a browser with the St. John's store selected.",
    );
  }

  // ── Match ────────────────────────────────────────────────────────────────
  /**
   * Best match per canonical product — same rule as the PC Express run: a store
   * carries several SKUs that all resemble one canonical product, and matching
   * each independently lets the last one processed win.
   */
  const bestByProductId = new Map<
    string,
    { product: NormalizedVoilaProduct; confidence: number }
  >();
  let unmatched = 0;

  for (const p of fetched) {
    if (!p.inStock) continue;

    // packageSize is included for the same reason as PC Express: without it the
    // size guard is bypassed and a 2L product happily matches a 1L SKU.
    const matchName = [p.brand, p.name, p.packageSize].filter(Boolean).join(" ");
    const match = matchProduct(matchName, products);

    if (!match) {
      unmatched += 1;
      continue;
    }

    const existing = bestByProductId.get(match.productId);
    if (!existing || match.confidence > existing.confidence) {
      bestByProductId.set(match.productId, {
        product: p,
        confidence: match.confidence,
      });
    }
  }

  const matches = [...bestByProductId.entries()].map(([productId, m]) => ({
    product: m.product,
    storeId: store.id,
    productId,
  }));

  log(`Matched ${matches.length}, ${unmatched} unmatched`);

  // ── Ingest ───────────────────────────────────────────────────────────────
  const run = await prisma.scrapeRun.create({
    data: {
      storeId: store.id,
      status: "running",
      totalProducts: matches.length,
    },
  });

  for (const m of matches) {
    await prisma.storeProduct.upsert({
      where: {
        storeId_productId: { storeId: m.storeId, productId: m.productId },
      },
      update: { storeSku: m.product.retailerProductId ?? m.product.productId },
      create: {
        storeId: m.storeId,
        productId: m.productId,
        storeSku: m.product.retailerProductId ?? m.product.productId,
        isActive: true,
      },
    });
  }

  const result = await ingestObservations(toObservations(matches, observedAt), {
    now: observedAt,
  });

  await prisma.scrapeRun.update({
    where: { id: run.id },
    data: {
      status:
        matches.length > 0 && result.rejected.length === matches.length
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

  log(
    `  ${store.name}: ${result.accepted} accepted, ${result.updated} price updates, ${result.rejected.length} rejected`,
  );

  return {
    fetched: fetched.length,
    matched: matches.length,
    unmatched,
    ingest: { ...result, storeName: store.name },
    errors,
  };
}
