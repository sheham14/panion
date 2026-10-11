import { notFound } from "next/navigation";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { getStoreMeta } from "@/lib/store-meta";
import type { ProductCategory } from "../../../../../prisma/generated/enums";
import ProductDetailClient from "@/components/product/ProductDetailClient";

// ── Data fetching ──────────────────────────────

async function getProduct(id: string, userId: string | null) {
  const [product, watchlist] = await Promise.all([
    prisma.product.findUnique({
      where: { id, isActive: true },
      include: {
        storeProducts: {
          where: { isActive: true },
          include: {
            store: true,
            priceHistory: {
              orderBy: { scrapedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
    userId
      ? prisma.watchlist.findFirst({ where: { userId, productId: id } })
      : null,
  ]);

  if (!product) return null;

  const STORE_META: Record<
    string,
    { color: string; bg: string; letter: string }
  > = {
    walmart: { color: "#0071ce", bg: "#0071ce18", letter: "W" },
    loblaws: { color: "#c8102e", bg: "#c8102e18", letter: "L" },
    metro: { color: "#e30000", bg: "#e3000018", letter: "M" },
    sobeys: { color: "#d62b2b", bg: "#d62b2b18", letter: "S" },
    dollarama: { color: "#00853e", bg: "#00853e18", letter: "D" },
  };

  const storePrices = product.storeProducts
    .map((sp) => {
      const latest = sp.priceHistory[0] ?? null;
      const days = latest
        ? Math.floor(
            (Date.now() - new Date(latest.scrapedAt).getTime()) / 86400000,
          )
        : null;

      return {
        storeId: sp.storeId,
        chain: sp.store.chain,
        storeName: sp.store.name,
        price: latest ? Number(latest.price) : null,
        isSale: latest?.isSale ?? false,
        scrapedAt: latest?.scrapedAt.toISOString() ?? null,
        daysAgo: days,
        ...getStoreMeta(sp.store.chain),
      };
    })
    .sort((a, b) => {
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return a.price - b.price;
    });

  const bestPrice = storePrices.find((s) => s.price !== null) ?? null;

  // Unit price calculation
  let unitPrice: string | null = null;
  if (bestPrice?.price && product.unitQuantity && product.unitMeasure) {
    const qty = Number(product.unitQuantity);
    const measure = product.unitMeasure;
    if (measure === "unit") {
      const perUnit = bestPrice.price / qty;
      unitPrice = `$${perUnit.toFixed(2)} / unit`;
    } else if (["L", "l", "kg", "lb", "oz"].includes(measure)) {
      const perUnit = bestPrice.price / qty;
      unitPrice = `$${perUnit.toFixed(2)} / ${measure}`;
    } else {
      // g, ml, etc. — show per 100
      const perUnit = (bestPrice.price / qty) * 100;
      unitPrice = `$${perUnit.toFixed(2)} / 100${measure}`;
    }
  }

  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    unitSize: product.unitSize,
    unitMeasure: product.unitMeasure,
    imageUrl: product.imageUrl,
    description: product.description,
    storePrices,
    bestPrice: bestPrice?.price ?? null,
    bestStore: bestPrice?.chain ?? null,
    unitPrice,
    isWatched: !!watchlist,
  };
}

/** Most similar products shown: one per related group. */
const SIMILAR = 6;

/**
 * Products in groups related to this one: other milks for skim milk, other
 * eggs for large eggs. Its own group is already on the page under "Compare
 * brands". Related means sharing the group's last word, its noun ("milk" in
 * `skim-milk`); the broad category alone used to offer condensed milk and
 * almond milk for skim milk. Falls back to the category when the noun finds
 * too few. One product per group, the cheapest, priced from current prices —
 * this read `priceHistory`, which is empty for most products.
 */
async function getSimilarProducts(
  // Prisma already hands us the enum member here; widening it to `string` was
  // what forced the `as any` back.
  category: ProductCategory | null,
  subcategory: string | null,
  excludeId: string,
) {
  if (!category && !subcategory) return [];
  const noun = subcategory?.split("-").filter((w) => /^[a-z]{3,}$/.test(w)).pop() ?? null;

  const priced = {
    where: { isActive: true, currentPrice: { not: null } },
    select: { currentPrice: true, store: { select: { chain: true } } },
  } as const;
  const base = { isActive: true, id: { not: excludeId }, storeProducts: { some: { isActive: true, currentPrice: { not: null } } } };

  const related = noun
    ? await prisma.product.findMany({
        where: { ...base, subcategory: { contains: noun, not: subcategory ?? undefined } },
        include: { storeProducts: priced },
        take: 60,
      })
    : [];
  const fallback =
    related.length < 3 && category
      ? await prisma.product.findMany({
          where: { ...base, category, subcategory: { not: subcategory ?? undefined } },
          include: { storeProducts: priced },
          take: 60,
        })
      : [];

  const cheapest = (p: (typeof related)[number]) =>
    p.storeProducts
      .map((sp) => ({ chain: sp.store.chain, price: Number(sp.currentPrice) }))
      .sort((a, b) => a.price - b.price)[0] ?? null;

  const byGroup = new Map<string, { p: (typeof related)[number]; best: ReturnType<typeof cheapest> }>();
  for (const p of [...related, ...fallback]) {
    const key = p.subcategory ?? p.id;
    const best = cheapest(p);
    const current = byGroup.get(key);
    if (!current || (best && current.best && best.price < current.best.price)) {
      byGroup.set(key, { p, best });
    }
  }

  return [...byGroup.values()].slice(0, SIMILAR).map(({ p, best }) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    unitSize: p.unitSize,
    imageUrl: p.imageUrl,
    bestPrice: best?.price ?? null,
    bestStore: best?.chain ?? null,
  }));
}

// ── Page ───────────────────────────────────────

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [product, similar] = await Promise.all([
    getProduct(id, userId),
    prisma.product
      .findUnique({ where: { id }, select: { category: true, subcategory: true } })
      .then((p) => getSimilarProducts(p?.category ?? null, p?.subcategory ?? null, id)),
  ]);

  if (!product) notFound();

  return (
    <ProductDetailClient
      product={product}
      similar={similar}
      isLoggedIn={!!userId}
    />
  );
}
