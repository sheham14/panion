import { prisma } from "@/lib/prisma";
import { getStoreMeta } from "@/lib/store-meta";
import { computeListPricing, type PricingItem } from "@/lib/list-pricing";


export async function getWatchlistSummary(userId: string) {
  const [preferredStores, watchlist] = await Promise.all([
    prisma.userPreferredStore.findMany({
      where: { userId },
      include: { store: true },
    }),
    prisma.watchlist.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            // Reads the denormalized currentPrice instead of a per-store-product
            // correlated subquery into priceHistory. This runs on every home
            // render, so the join mattered (audit M1).
            storeProducts: {
              where: { isActive: true },
              select: {
                storeId: true,
                currentPrice: true,
                isSale: true,
                lastScrapedAt: true,
                store: { select: { id: true, chain: true, name: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const preferredStoreIds = new Set(preferredStores.map((ps) => ps.storeId));

  const items = watchlist.map((w) => {
    const prices: Record<string, { price: number; scrapedAt: string } | null> =
      {};
    let bestPrice: number | null = null;
    let bestStore: string | null = null;

    for (const sp of w.product.storeProducts) {
      if (!preferredStoreIds.has(sp.storeId)) continue;
      const chain = sp.store.chain;
      if (sp.currentPrice !== null) {
        const price = Number(sp.currentPrice);
        prices[chain] = {
          price,
          scrapedAt: (sp.lastScrapedAt ?? new Date()).toISOString(),
        };
        if (bestPrice === null || price < bestPrice) {
          bestPrice = price;
          bestStore = chain;
        }
      } else {
        prices[chain] = null;
      }
    }

    return {
      watchlistId: w.id,
      productId: w.product.id,
      name: w.product.name,
      brand: w.product.brand,
      category: w.product.category,
      imageUrl: w.product.imageUrl,
      unitSize: w.product.unitSize,
      prices,
      bestPrice,
      bestStore,
      notifyOnDrop: w.notifyOnDrop,
      notifyOnRise: w.notifyOnRise,
    };
  });

  // Totals go through the same core the list page uses (`list-pricing.ts`),
  // for the reason recorded as CLAUDE.md rule 12: summing prices into a bare
  // `Record<chain, number>` and then picking the smallest ranks the store that
  // is *missing* the most watched products first. The `/api/lists/[id]/recommend`
  // route already ranks on coverage for this reason (audit M3); this was the
  // last place still sorting on a raw total.
  //
  // A watchlist row is one unit of one product, so quantity 1 / unit "each"
  // reproduces the previous arithmetic exactly — what changes is that the
  // exclusions now come back with the totals instead of being dropped.
  const preferredChains = preferredStores.map((ps) => ps.store.chain);
  const pricingItems: PricingItem[] = watchlist.map((w) => ({
    id: w.id,
    isChecked: false,
    quantity: 1,
    unit: "each",
    customPrice: null,
    product: {
      unitSize: w.product.unitSize,
      unitMeasure: w.product.unitMeasure,
      unitQuantity:
        w.product.unitQuantity === null ? null : Number(w.product.unitQuantity),
      // Filtered by store id, not chain: a preferred store is a specific
      // location, and matching on chain alone would price the watchlist at a
      // branch the user never chose.
      storeProducts: w.product.storeProducts
        .filter((sp) => preferredStoreIds.has(sp.storeId))
        .map((sp) => ({
          currentPrice: sp.currentPrice === null ? null : Number(sp.currentPrice),
          store: { chain: sp.store.chain },
        })),
    },
  }));

  const pricing = computeListPricing(pricingItems, preferredChains);
  const basketOf = new Map(pricing.baskets.map((b) => [b.chain, b]));

  const storeTotals: Record<string, number> = {};
  for (const basket of pricing.baskets) storeTotals[basket.chain] = basket.total;

  const stores = preferredStores.map((ps) => {
    const basket = basketOf.get(ps.store.chain.toLowerCase());
    return {
      id: ps.storeId,
      chain: ps.store.chain,
      name: ps.store.name,
      total: basket?.total ?? 0,
      // What that total actually covers. A total shown without these is not
      // comparable to the one beside it.
      covered: basket?.covered.length ?? 0,
      missing: basket?.missing.length ?? 0,
      ...getStoreMeta(ps.store.chain),
    };
  });

  return {
    items,
    stores,
    storeTotals,
    /** Ranked on the basket every store can price — never on a raw total. */
    bestStore: pricing.ranked[0]?.chain ?? null,
    /** Watched products in total, so `covered` has a denominator. */
    itemCount: pricing.itemCount,
    /** Products every priced store can quote — what `bestStore` was decided on. */
    comparableItemCount: pricing.commonItemIds.length,
  };
}
