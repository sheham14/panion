import { prisma } from "@/lib/prisma";

/**
 * What is worth capturing next, and where.
 *
 * Coverage is bounded by the catalogue, not by how fast anyone can type: a
 * capture only resolves against a product Panion already holds. So the queue is
 * ranked by **products this store is missing a price for**, and a category
 * whose products are all Loblaw private label is dropped rather than shown as
 * an opportunity — No Name cannot exist at Sobeys.
 *
 * **Search terms are derived from the missing products themselves**, never from
 * the harvest term list that built the catalogue. Those two diverge badly: the
 * harvest searched ten personal-care terms but kept only the best-scoring
 * comparable groups, which left a catalogue of 27 shampoos and 3 body washes.
 * Offering the harvest's "body wash" and "lotion" then sent a capture session
 * at a Walmart aisle with nothing to match — 48 products captured, 0 resolved.
 * A product's `subcategory` is its equivalence group, deliberately brand- and
 * size-agnostic ("moisturizing-shampoo"), which makes it exactly the right
 * search phrase.
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

/**
 * The search phrase for an equivalence group.
 *
 * A group id is already brand- and size-agnostic ("moisturizing-shampoo"), so
 * it only needs its separators turned back into spaces to read as something a
 * shopper would type.
 */
export function searchTermFor(
  subcategory: string | null,
  category: string | null,
): string {
  const raw = subcategory ?? category ?? "other";
  return raw.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** One equivalence group with missing prices — the unit of a capture run. */
export type WorklistGroup = {
  /** The search phrase, e.g. "moisturizing shampoo". */
  term: string;
  missing: number;
  /** A couple of real product names, so the user knows what to look for. */
  examples: string[];
};

export type WorklistRow = {
  category: string;
  /** Products this store could carry but has no price for. */
  missing: number;
  /** Products this store already has a price for. */
  covered: number;
  /** Groups to search, richest first. */
  groups: WorklistGroup[];
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
      name: true,
      category: true,
      subcategory: true,
      brand: true,
      storeProducts: {
        where: { storeId, isActive: true, currentPrice: { not: null } },
        select: { id: true },
      },
    },
  });

  type Acc = {
    missing: number;
    covered: number;
    groups: Map<string, { missing: number; examples: string[] }>;
  };
  const byCategory = new Map<string, Acc>();

  for (const p of products) {
    // A private-label product is only addressable inside its own banner.
    if (!isLoblawBanner && isLoblawOnly(p.brand)) continue;
    // `category` is nullable; an unclassified product still belongs somewhere
    // rather than being silently dropped.
    const category = p.category ?? "other";
    const acc = byCategory.get(category) ?? {
      missing: 0,
      covered: 0,
      groups: new Map(),
    };

    if (p.storeProducts.length > 0) {
      acc.covered += 1;
    } else {
      acc.missing += 1;
      // Group by equivalence group; fall back to the category itself when a
      // product was never classified.
      const term = searchTermFor(p.subcategory, category);
      const g = acc.groups.get(term) ?? { missing: 0, examples: [] };
      g.missing += 1;
      if (g.examples.length < 2) g.examples.push(p.name);
      acc.groups.set(term, g);
    }

    byCategory.set(category, acc);
  }

  const rows: WorklistRow[] = [...byCategory.entries()]
    .map(([category, a]) => ({
      category,
      missing: a.missing,
      covered: a.covered,
      groups: [...a.groups.entries()]
        .map(([term, g]) => ({ term, missing: g.missing, examples: g.examples }))
        .sort((x, y) => y.missing - x.missing),
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
