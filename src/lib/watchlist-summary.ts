import { prisma } from "@/lib/prisma";

const STORE_META: Record<
  string,
  { color: string; bg: string; letter: string }
> = {
  walmart:  { color: "#0071ce", bg: "#0071ce18", letter: "W" },
  dominion: { color: "#c8102e", bg: "#c8102e18", letter: "D" },
  sobeys:   { color: "#d62b2b", bg: "#d62b2b18", letter: "S" },
  costco:   { color: "#005dab", bg: "#005dab18", letter: "C" },
};

export async function getWatchlistSummary(userId: string) {
  const [preferredStores, watchlist] = await Promise.all([
    prisma.userPreferredStore.findMany({
      where: { userId, store: { chain: { not: "costco" } } },
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
  const storeTotals: Record<string, number> = {};
  preferredStores.forEach((ps) => {
    storeTotals[ps.store.chain] = 0;
  });

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
        if (storeTotals[chain] !== undefined) {
          storeTotals[chain] += price;
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

  const storesWithPrices = Object.entries(storeTotals).filter(([, t]) => t > 0);
  const bestStore = storesWithPrices.length
    ? storesWithPrices.reduce((a, b) => (a[1] < b[1] ? a : b))[0]
    : null;

  const stores = preferredStores.map((ps) => ({
    id: ps.storeId,
    chain: ps.store.chain,
    name: ps.store.name,
    total: storeTotals[ps.store.chain] ?? 0,
    ...(STORE_META[ps.store.chain] ?? {
      color: "#aaa",
      bg: "#aaa18",
      letter: "?",
    }),
  }));

  return { items, stores, storeTotals, bestStore };
}
