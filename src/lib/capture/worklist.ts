import { prisma } from "@/lib/prisma";
import { CATALOGUE_TERMS } from "@/lib/pricing/catalogue-terms";

/**
 * What is worth capturing next, and where.
 *
 * Coverage is bounded by the catalogue, not by how fast anyone can type: a
 * capture only resolves against a product Panion already holds. So the queue is
 * ranked by **products this store is missing a price for**, and a category
 * whose products are all Loblaw private label is dropped rather than shown as
 * an opportunity — No Name cannot exist at Sobeys.
 */

/** Brands sold only by Loblaw banners, so unreachable at another chain. */
const LOBLAW_ONLY = [
  "no name",
  "president's choice",
  "pc ",
  "farmer's market",
  "blue menu",
];

export function isLoblawOnly(brand: string | null): boolean {
  if (!brand) return false;
  const b = brand.toLowerCase();
  return LOBLAW_ONLY.some((x) => b.startsWith(x.trim()));
}

/** Loblaw banners, where private label is reachable after all. */
const LOBLAW_CHAINS = new Set(["dominion", "no frills", "superstore", "loblaws"]);

export type WorklistRow = {
  category: string;
  /** Products this store could carry but has no price for. */
  missing: number;
  /** Products this store already has a price for. */
  covered: number;
  /** Search terms to run, best-effort from the harvest term list. */
  terms: string[];
};

export type Worklist = {
  storeId: string;
  storeName: string;
  chain: string;
  rows: WorklistRow[];
  totalMissing: number;
};

/**
 * Build the capture queue for one store, richest opportunity first.
 */
export async function buildWorklist(storeId: string): Promise<Worklist | null> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, chain: true },
  });
  if (!store) return null;

  const isLoblawBanner = LOBLAW_CHAINS.has(store.chain.toLowerCase());

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      category: true,
      brand: true,
      storeProducts: {
        where: { storeId, isActive: true, currentPrice: { not: null } },
        select: { id: true },
      },
    },
  });

  const byCategory = new Map<string, { missing: number; covered: number }>();
  for (const p of products) {
    // A private-label product is only addressable inside its own banner.
    if (!isLoblawBanner && isLoblawOnly(p.brand)) continue;
    // `category` is nullable; an unclassified product has no search terms to
    // offer, so it groups under "other" rather than being silently dropped.
    const category = p.category ?? "other";
    const row = byCategory.get(category) ?? { missing: 0, covered: 0 };
    if (p.storeProducts.length > 0) row.covered += 1;
    else row.missing += 1;
    byCategory.set(category, row);
  }

  const rows: WorklistRow[] = [...byCategory.entries()]
    .map(([category, r]) => ({
      category,
      missing: r.missing,
      covered: r.covered,
      terms: CATALOGUE_TERMS[category] ?? [],
    }))
    .filter((r) => r.missing > 0)
    .sort((a, b) => b.missing - a.missing);

  return {
    storeId: store.id,
    storeName: store.name,
    chain: store.chain,
    rows,
    totalMissing: rows.reduce((a, r) => a + r.missing, 0),
  };
}

/**
 * A search URL for a term at a store's own site.
 *
 * The link only navigates the person's browser to a page they could have typed
 * themselves — it fetches nothing, and the capture still comes from what their
 * screen renders.
 */
export function searchUrlFor(chain: string, term: string): string | null {
  const q = encodeURIComponent(term);
  switch (chain.toLowerCase()) {
    case "walmart":
      return `https://www.walmart.ca/en/search?q=${q}`;
    case "sobeys":
      return `https://voila.ca/search?q=${q}`;
    case "dominion":
      return `https://www.newfoundlandgrocerystores.ca/search?search-bar=${q}`;
    case "no frills":
      return `https://www.nofrills.ca/search?search-bar=${q}`;
    default:
      return null;
  }
}
