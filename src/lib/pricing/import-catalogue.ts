import { prisma } from "@/lib/prisma";
import { ProductCategory } from "../../../prisma/generated/enums";
import {
  fetchPcExpressProducts,
  PC_EXPRESS_BANNERS,
  type NormalizedPcProduct,
  type PcExpressBanner,
} from "@/lib/pricing/adapters/pcexpress";
import { ALL_CATALOGUE_TERMS, TERM_TO_CATEGORY } from "@/lib/pricing/catalogue-terms";
import { normalizeBarcode, parseSize } from "@/lib/pricing/match";
import { ingestObservations } from "@/lib/pricing/ingest";
import type { PriceObservation } from "@/lib/pricing/types";

/**
 * Build the canonical catalogue **from real store data**.
 *
 * This inverts the original dependency. The seeded 80 products were written by
 * hand with fabricated barcodes and an invented price matrix, and scrapers were
 * matching real products *onto* that fiction — discarding ~98% of what they
 * fetched. Now the store's data defines the catalogue and barcodes join it
 * across stores, which is exact rather than fuzzy for anything branded.
 *
 * Deliberately bounded (see `targetSize`): PRICING-PIPELINE.md §1 argues for the
 * basket that matters over the whole catalogue, and a product only one store
 * carries has no comparison value anyway.
 */

/** Map a harvest term's category group onto the Prisma enum. */
const CATEGORY_BY_GROUP: Record<string, ProductCategory> = {
  dairy: ProductCategory.dairy,
  meat_seafood: ProductCategory.meat_seafood,
  produce: ProductCategory.produce,
  bakery_bread: ProductCategory.bakery_bread,
  frozen: ProductCategory.frozen,
  pantry_dry_goods: ProductCategory.pantry_dry_goods,
  snacks_candy: ProductCategory.snacks_candy,
  beverages: ProductCategory.beverages,
  household: ProductCategory.household,
  personal_care: ProductCategory.personal_care,
  baby: ProductCategory.baby,
  pet: ProductCategory.pet,
  health_wellness: ProductCategory.health_wellness,
};

function categoryFor(term: string | undefined): ProductCategory {
  if (!term) return ProductCategory.other;
  const group = TERM_TO_CATEGORY[term];
  if (!group) return ProductCategory.other;
  return CATEGORY_BY_GROUP[group] ?? ProductCategory.other;
}

/**
 * Display name.
 *
 * PC Express splits brand from name ("Central Dairies" + "2% Milk"), which
 * reads poorly alone. Recombine, but don't duplicate a brand the name already
 * repeats.
 */
function displayName(p: NormalizedPcProduct): string {
  const name = p.name.trim();
  if (!p.brand) return name;
  const brand = p.brand.trim();
  return name.toLowerCase().startsWith(brand.toLowerCase())
    ? name
    : `${brand} ${name}`;
}

/** Split "2 l" / "454 g" into the quantity + measure columns. */
function unitFields(packageSize: string | null): {
  unitSize: string | null;
  unitQuantity: number | null;
  unitMeasure: string | null;
} {
  if (!packageSize) return { unitSize: null, unitQuantity: null, unitMeasure: null };
  const parsed = parseSize(packageSize);
  const m = packageSize.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|pk|pack|count|ct)\b/i);
  return {
    unitSize: packageSize,
    unitQuantity: m ? parseFloat(m[1]) : (parsed?.qty ?? null),
    unitMeasure: m ? m[2].toLowerCase() : (parsed?.unit ?? null),
  };
}

/**
 * Retailer private-label brands.
 *
 * These are the single worst thing to put in a price-comparison catalogue:
 * they carry a real barcode and a real image, so a naive quality score ranks
 * them highly, but **no other retailer stocks them**, so they can never be
 * compared. The first import selected 52 of 250 this way — No Name and
 * President's Choice alone were 44 — and cross-store flyer matches promptly
 * fell from 24 to 6.
 */
const PRIVATE_LABEL_PATTERNS = [
  // Loblaw
  /^president'?s choice/i, /^pc\b/i, /^pc /i, /^no name/i, /^blue menu/i,
  /^farmer'?s market/i, /^teddy'?s choice/i, /^joe fresh/i, /^life brand/i,
  // Sobeys
  /^compliments/i, /^panache/i, /^sensations/i,
  // Walmart
  /^great value/i, /^your fresh market/i, /^equate/i, /^parent'?s choice/i,
  // Metro / other
  /^selection/i, /^irresistibles/i, /^exact\b/i,
];

export const isPrivateLabel = (brand: string | null | undefined): boolean =>
  !!brand && PRIVATE_LABEL_PATTERNS.some((re) => re.test(brand.trim()));

/**
 * Score a product for inclusion in a bounded demo catalogue.
 *
 * The catalogue exists to be *compared*, so the dominant criterion is whether
 * another store could plausibly carry the same item — which means national
 * brands with a barcode, not store brands.
 */
function qualityScore(p: NormalizedPcProduct): number {
  let score = 0;
  if (p.imageUrl) score += 3; // a catalogue without pictures demos badly
  if (normalizeBarcode(p.barcode)) score += 3; // enables exact cross-store joins
  if (p.packageSize && parseSize(p.packageSize)) score += 2;
  if (p.brand) score += 1;
  if (p.price >= 0.5 && p.price <= 100) score += 1; // avoid odd bulk/edge SKUs

  // Heavily demote private label — comparable beats merely well-formed.
  if (isPrivateLabel(p.brand)) score -= 8;

  return score;
}

export type ImportOptions = {
  banner?: PcExpressBanner;
  terms?: string[];
  apiKey?: string;
  fetchImpl?: typeof fetch;
  delayMs?: { min: number; max: number };
  verbose?: boolean;
  /** Roughly how many canonical products to keep. */
  targetSize?: number;
};

export type ImportSummary = {
  fetched: number;
  kept: number;
  created: number;
  updated: number;
  byCategory: Record<string, number>;
  pricesWritten: number;
  errors: string[];
};

export async function importCatalogue(
  opts: ImportOptions = {},
): Promise<ImportSummary> {
  const log = (m: string) => {
    if (opts.verbose) console.log(m);
  };
  const banner = opts.banner ?? "dominion";
  const targetSize = opts.targetSize ?? 250;
  const observedAt = new Date();

  const apiKey = opts.apiKey ?? process.env.PC_EXPRESS_API_KEY;
  if (!apiKey) throw new Error("PC_EXPRESS_API_KEY is not set");

  const store = await prisma.store.findFirst({
    where: { chain: banner, isActive: true },
    select: { id: true, name: true },
  });
  if (!store) throw new Error(`No active store with chain "${banner}"`);

  const terms = opts.terms ?? ALL_CATALOGUE_TERMS;
  log(`Harvesting ${banner} (store ${PC_EXPRESS_BANNERS[banner].storeId}) — ${terms.length} terms…`);

  const { products: fetched, errors } = await fetchPcExpressProducts({
    banner,
    terms,
    apiKey,
    fetchImpl: opts.fetchImpl,
    delayMs: opts.delayMs,
  });
  log(`Fetched ${fetched.length} distinct products (${errors.length} errors)`);

  // ── Select a balanced subset ─────────────────────────────────────────────
  // Round-robin across categories so every aisle is represented, rather than
  // letting whichever category returned most results dominate.
  const inStock = fetched.filter((p) => p.inStock && p.price > 0);
  const byCategory = new Map<ProductCategory, NormalizedPcProduct[]>();

  for (const p of inStock) {
    const cat = categoryFor(p.foundVia);
    const list = byCategory.get(cat) ?? [];
    list.push(p);
    byCategory.set(cat, list);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => qualityScore(b) - qualityScore(a));
  }

  const selected: { product: NormalizedPcProduct; category: ProductCategory }[] = [];
  const cursors = new Map<ProductCategory, number>();
  let exhausted = false;
  while (selected.length < targetSize && !exhausted) {
    exhausted = true;
    for (const [cat, list] of byCategory) {
      if (selected.length >= targetSize) break;
      const i = cursors.get(cat) ?? 0;
      if (i < list.length) {
        selected.push({ product: list[i], category: cat });
        cursors.set(cat, i + 1);
        exhausted = false;
      }
    }
  }

  log(`Selected ${selected.length} across ${byCategory.size} categories`);

  // ── Upsert canonical products ────────────────────────────────────────────
  let created = 0;
  let updated = 0;
  const categoryCounts: Record<string, number> = {};
  const observations: PriceObservation[] = [];

  for (const { product, category } of selected) {
    const barcode = normalizeBarcode(product.barcode);
    const units = unitFields(product.packageSize);

    // Barcode is the identity when we have one, so a re-import updates rather
    // than duplicates. Otherwise fall back to the store's own SKU.
    const existing = barcode
      ? await prisma.product.findUnique({ where: { barcode } })
      : await prisma.product.findFirst({
          where: {
            storeProducts: { some: { storeId: store.id, storeSku: product.code } },
          },
        });

    const data = {
      name: displayName(product),
      brand: product.brand,
      category,
      ...units,
      ...(barcode ? { barcode } : {}),
      ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
      isActive: true,
    };

    const canonical = existing
      ? await prisma.product.update({ where: { id: existing.id }, data })
      : await prisma.product.create({ data });

    if (existing) updated += 1;
    else created += 1;
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;

    await prisma.storeProduct.upsert({
      where: { storeId_productId: { storeId: store.id, productId: canonical.id } },
      update: {
        storeSku: product.code,
        storeProductName: product.name,
        scrapeUrl: product.productUrl,
        isActive: true,
      },
      create: {
        storeId: store.id,
        productId: canonical.id,
        storeSku: product.code,
        storeProductName: product.name,
        scrapeUrl: product.productUrl,
        isActive: true,
      },
    });

    observations.push({
      storeId: store.id,
      productId: canonical.id,
      price: product.price,
      isSale: product.isSale,
      regularPrice: product.regularPrice,
      saleEndDate: product.saleEndDate,
      source: "scraper",
      observedAt,
      storeProductName: product.name,
      storeSku: product.code,
    });
  }

  const ingest = await ingestObservations(observations, { now: observedAt });
  log(`Wrote ${ingest.accepted} prices (${ingest.rejected.length} rejected)`);

  return {
    fetched: fetched.length,
    kept: selected.length,
    created,
    updated,
    byCategory: categoryCounts,
    pricesWritten: ingest.accepted,
    errors,
  };
}
