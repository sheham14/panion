import { prisma } from "@/lib/prisma";
import { ingestObservations } from "@/lib/pricing/ingest";
import {
  fetchPcExpressProducts,
  toObservations,
  PC_EXPRESS_BANNERS,
  type NormalizedPcProduct,
  type PcExpressBanner,
} from "@/lib/pricing/adapters/pcexpress";
import {
  matchProductByBarcodeOrName,
  normalizeBarcode,
  parseSize,
  sizesCompatible,
  type CanonicalProduct,
} from "@/lib/pricing/match";
import type { IngestResult } from "@/lib/pricing/types";

/**
 * One PC Express cycle: fetch → match → ingest, with a ScrapeRun per banner.
 *
 * Unlike the Flipp run this yields **regular shelf prices**, so it is the
 * source that actually fills the catalogue rather than overlaying sales.
 */

/** Terms spanning the seeded catalogue's categories. */
export const DEFAULT_SEARCH_TERMS = [
  "milk", "butter", "cheese", "yogurt", "eggs", "cream",
  "chicken breast", "ground beef", "pork chops", "bacon", "salmon",
  "apples", "bananas", "potatoes", "onions", "carrots", "tomatoes", "lettuce",
  "broccoli", "garlic",
  "bread", "bagels", "pasta", "rice", "cereal", "flour", "sugar",
  "coffee", "tea", "orange juice", "soft drinks", "water",
  "frozen pizza", "ice cream", "chips", "cookies", "crackers",
  "olive oil", "tomato sauce", "peanut butter",
  "paper towels", "toilet paper", "laundry detergent", "dish soap",
];

export type PcExpressRunOptions = {
  banner?: PcExpressBanner;
  terms?: string[];
  apiKey?: string;
  fetchImpl?: typeof fetch;
  delayMs?: { min: number; max: number };
  verbose?: boolean;
  /**
   * Write real UPCs and imagery onto canonical products that lack them.
   *
   * The seeded barcodes are placeholders (Central Dairies 2% 2L was seeded as
   * 068700100012; it is really 05749801032), so barcode matching does nothing
   * until this has run once.
   */
  backfillCatalogue?: boolean;
};

export type PcExpressRunSummary = {
  fetched: number;
  matchedByBarcode: number;
  matchedByName: number;
  unmatched: number;
  barcodesBackfilled: number;
  imagesBackfilled: number;
  ingest: (IngestResult & { storeName: string }) | null;
  errors: string[];
};

export async function runPcExpressCycle(
  opts: PcExpressRunOptions = {},
): Promise<PcExpressRunSummary> {
  const log = (m: string) => {
    if (opts.verbose) console.log(m);
  };
  const banner = opts.banner ?? "dominion";
  const observedAt = new Date();

  const apiKey = opts.apiKey ?? process.env.PC_EXPRESS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "PC_EXPRESS_API_KEY is not set. It's the public client key from the " +
        "storefront's own JS — see .env.example.",
    );
  }

  const store = await prisma.store.findFirst({
    where: { chain: banner, isActive: true },
    select: { id: true, name: true, chain: true },
  });
  if (!store) {
    throw new Error(`No active store row with chain "${banner}"`);
  }

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

  const terms = opts.terms ?? DEFAULT_SEARCH_TERMS;
  log(`Fetching ${banner} (store ${PC_EXPRESS_BANNERS[banner].storeId}) — ${terms.length} terms…`);

  const { products: fetched, errors } = await fetchPcExpressProducts({
    banner,
    terms,
    apiKey,
    fetchImpl: opts.fetchImpl,
    delayMs: opts.delayMs,
  });

  log(`Fetched ${fetched.length} products (${errors.length} errors)`);

  // ── Match ────────────────────────────────────────────────────────────────
  /**
   * Best match per canonical product.
   *
   * A store legitimately carries several SKUs that all resemble one canonical
   * product — "Lactantia Salted Butter 454g" and "Lactantia Sea Salted Butter
   * Sticks 454g" both matched "Lactantia Butter Salted". Matching each store
   * SKU independently let all of them through, which produced duplicate
   * observations for the same (store, product) pair and let whichever happened
   * to be processed last win the barcode backfill. Keep only the strongest.
   */
  const bestByProductId = new Map<
    string,
    { product: NormalizedPcProduct; confidence: number; viaBarcode: boolean }
  >();
  let unmatched = 0;

  for (const p of fetched) {
    if (!p.inStock) continue; // don't price something the store doesn't have

    // packageSize MUST be included: without it parseSize() finds no size on the
    // item side, sizesCompatible() permits the unknown, and the size guard is
    // bypassed entirely. That silently matched a 2L canonical product to the
    // 1L Central Dairies SKU and backfilled its barcode — precisely the
    // wrong-size failure §8 warns about.
    const matchName = [p.brand, p.name, p.packageSize]
      .filter(Boolean)
      .join(" ");

    const match = matchProductByBarcodeOrName(
      { barcode: p.barcode, name: matchName },
      products,
    );
    if (!match) {
      unmatched += 1;
      continue;
    }

    const viaBarcode = match.reason.startsWith("barcode=");
    const existing = bestByProductId.get(match.productId);

    // A barcode match always beats a name match — it's an exact identity, not
    // a score. Between two name matches, the higher confidence wins.
    const beatsExisting =
      !existing ||
      (viaBarcode && !existing.viaBarcode) ||
      (viaBarcode === existing.viaBarcode &&
        match.confidence > existing.confidence);

    if (beatsExisting) {
      bestByProductId.set(match.productId, {
        product: p,
        confidence: match.confidence,
        viaBarcode,
      });
    }
  }

  const matches = [...bestByProductId.entries()].map(([productId, m]) => ({
    product: m.product,
    storeId: store.id,
    productId,
  }));
  const matchedByBarcode = [...bestByProductId.values()].filter(
    (m) => m.viaBarcode,
  ).length;
  const matchedByName = matches.length - matchedByBarcode;

  log(
    `Matched ${matches.length} (${matchedByBarcode} by barcode, ${matchedByName} by name), ${unmatched} unmatched`,
  );

  // ── Catalogue backfill ───────────────────────────────────────────────────
  // Writes the real UPC and store photography onto canonical products, which
  // is what makes barcode matching work on every subsequent run.
  let barcodesBackfilled = 0;
  let imagesBackfilled = 0;

  if (opts.backfillCatalogue !== false) {
    const byId = new Map(products.map((p) => [p.id, p]));

    for (const { product, productId } of matches) {
      const barcode = normalizeBarcode(product.barcode);

      // A barcode is a product's identity — writing the wrong one is worse than
      // writing none, because every later run then matches it with total
      // confidence. Only claim one when both sides state a size and the sizes
      // agree; an unknown size is not good enough here, even though the name
      // matcher tolerates it.
      const canonical = byId.get(productId);
      const itemSize = parseSize(product.packageSize ?? "");
      const canonicalSize =
        parseSize(canonical?.unitSize ?? "") ??
        (canonical?.unitQuantity && canonical?.unitMeasure
          ? parseSize(`${canonical.unitQuantity}${canonical.unitMeasure}`)
          : null);
      const sizeConfirmed =
        itemSize !== null &&
        canonicalSize !== null &&
        sizesCompatible(itemSize, canonicalSize);

      if (barcode && sizeConfirmed) {
        // Only claim a barcode no other product already holds, so a bad match
        // can't corrupt another product's identity.
        const taken = await prisma.product.findFirst({
          where: { barcode, NOT: { id: productId } },
          select: { id: true },
        });
        if (!taken) {
          const { count } = await prisma.product.updateMany({
            where: { id: productId, OR: [{ barcode: null }, { barcode: { not: barcode } }] },
            data: { barcode },
          });
          barcodesBackfilled += count;
        }
      }

      if (product.imageUrl) {
        const { count } = await prisma.product.updateMany({
          where: { id: productId, imageUrl: null },
          data: { imageUrl: product.imageUrl },
        });
        imagesBackfilled += count;
      }
    }
    log(`Backfilled ${barcodesBackfilled} barcodes, ${imagesBackfilled} images`);
  }

  // ── Ingest ───────────────────────────────────────────────────────────────
  const run = await prisma.scrapeRun.create({
    data: { storeId: store.id, status: "running", totalProducts: matches.length },
  });

  for (const m of matches) {
    await prisma.storeProduct.upsert({
      where: { storeId_productId: { storeId: m.storeId, productId: m.productId } },
      update: {
        storeSku: m.product.code,
        ...(m.product.productUrl ? { scrapeUrl: m.product.productUrl } : {}),
      },
      create: {
        storeId: m.storeId,
        productId: m.productId,
        storeSku: m.product.code,
        scrapeUrl: m.product.productUrl,
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
    matchedByBarcode,
    matchedByName,
    unmatched,
    barcodesBackfilled,
    imagesBackfilled,
    ingest: { ...result, storeName: store.name },
    errors,
  };
}
