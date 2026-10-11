import { prisma } from "@/lib/prisma";

/**
 * Real catalogue products for the screens with no user data behind them: the
 * logged-out preview and onboarding's suggested watchlist.
 *
 * Named by equivalence group (`Product.subcategory`), never by product id.
 * Both screens used to hard-code ids from the fabricated seed, which was
 * deleted from production. The preview went on showing invented prices under
 * real store names, stamped "1 day ago", with emoji where photos belong; and
 * onboarding's watchlist insert hit the foreign key, so every signup that kept
 * a suggestion failed. A group outlives any one of its products.
 */

/** The stores the preview prices at: the three with prices to show. */
export const SHOWCASE_CHAINS = ["walmart", "dominion", "sobeys"] as const;

/**
 * Everyday groups, in display order. Chosen against production on 2026-10-11
 * for a mix of coverage: some are priced at all three stores and some at two,
 * so the preview shows the "No price at…" handling a real list needs rather
 * than a list where every store prices everything.
 */
export const SHOWCASE_GROUPS = [
  "2-percent-milk",
  "large-eggs",
  "whole-wheat-bread",
  "salted-butter",
  "block-cheddar-cheese",
  "cream-cheese",
  "spaghetti-pasta",
  "orange-juice-pulp-free",
  "sliced-bacon",
  "regular-potato-chip",
  "ground-coffee",
] as const;

async function queryCandidates(slugs: readonly string[]) {
  return prisma.product.findMany({
    where: { isActive: true, subcategory: { in: [...slugs] } },
    include: {
      storeProducts: {
        where: {
          isActive: true,
          currentPrice: { not: null },
          store: { chain: { in: [...SHOWCASE_CHAINS] } },
        },
        include: { store: { select: { id: true, chain: true, name: true } } },
        orderBy: { currentPrice: "asc" },
      },
    },
  });
}

export type ShowcaseProduct = Awaited<ReturnType<typeof queryCandidates>>[number];

type Candidate = {
  id: string;
  imageUrl: string | null;
  storeProducts: { lastScrapedAt: Date | null; store: { chain: string } }[];
};

/**
 * The product a group is shown as: one with a photo, priced at the most
 * showcase stores, then the most recently priced, then by id so the choice is
 * stable between renders. Null when no member has a photo and a price.
 */
export function pickShowcaseProduct<T extends Candidate>(candidates: T[]): T | null {
  const chainsOf = (c: T) => new Set(c.storeProducts.map((sp) => sp.store.chain)).size;
  const newestOf = (c: T) =>
    Math.max(0, ...c.storeProducts.map((sp) => sp.lastScrapedAt?.getTime() ?? 0));

  const eligible = candidates.filter((c) => c.imageUrl && c.storeProducts.length > 0);
  eligible.sort(
    (a, b) =>
      chainsOf(b) - chainsOf(a) ||
      newestOf(b) - newestOf(a) ||
      a.id.localeCompare(b.id),
  );
  return eligible[0] ?? null;
}

/**
 * One product per showcase group, in `SHOWCASE_GROUPS` order. A group with no
 * eligible product is left out rather than filled with something invented.
 */
export async function loadShowcase(): Promise<ShowcaseProduct[]> {
  const candidates = await queryCandidates(SHOWCASE_GROUPS);
  const byGroup = new Map<string, ShowcaseProduct[]>();
  for (const c of candidates) {
    const slug = c.subcategory as string;
    byGroup.set(slug, [...(byGroup.get(slug) ?? []), c]);
  }
  return SHOWCASE_GROUPS.flatMap((slug) => {
    const pick = pickShowcaseProduct(byGroup.get(slug) ?? []);
    return pick ? [pick] : [];
  });
}

/** The showcase stores as store rows, in `SHOWCASE_CHAINS` order. */
export async function loadShowcaseStores() {
  const stores = await prisma.store.findMany({
    where: { isActive: true, chain: { in: [...SHOWCASE_CHAINS] } },
    select: { id: true, chain: true, name: true },
  });
  return SHOWCASE_CHAINS.flatMap((chain) => stores.filter((s) => s.chain === chain));
}
