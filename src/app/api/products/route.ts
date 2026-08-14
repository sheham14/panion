import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "../../../../auth";
import { parsePagination } from "@/lib/query-params";
import { ProductCategory } from "../../../../prisma/generated/enums";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const rawCategory = searchParams.get("category");
  const { limit, skip } = parsePagination(searchParams);

  // Only accept a real enum member — an arbitrary `?category=` string used to
  // reach Prisma as `as any` and surface as a 500 (audit L8).
  const category =
    rawCategory && rawCategory in ProductCategory
      ? (rawCategory as ProductCategory)
      : null;

  // Get session — optional, guests can still search
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const where = {
    isActive: true,
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { brand: { contains: q, mode: "insensitive" as const } },
      ],
    }),
    ...(category && { category }),
  };

  // No `count()` here: this endpoint returns a flat array with no pagination
  // envelope, so the extra COUNT ran on every request and was thrown away.
  const [products, watchlist] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      include: {
        // `currentPrice` is denormalized onto StoreProduct precisely so hot
        // read paths don't need a per-row correlated subquery into
        // priceHistory (audit M1). The chart endpoint still reads the series.
        storeProducts: {
          where: { isActive: true, currentPrice: { not: null } },
          select: {
            storeId: true,
            currentPrice: true,
            isSale: true,
            lastScrapedAt: true,
            store: { select: { id: true, chain: true, name: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    // Fetch user's watchlist IDs if logged in
    userId
      ? prisma.watchlist.findMany({
          where: { userId },
          select: { productId: true },
        })
      : Promise.resolve([]),
  ]);

  const watchedIds = new Set(
    watchlist.map((w: { productId: string }) => w.productId),
  );

  // Shape into flat array the search page expects
  const shaped = products.map((product) => {
    const prices = product.storeProducts
      .map((sp) => ({
        storeId: sp.storeId,
        chain: sp.store.chain,
        price: Number(sp.currentPrice),
        isSale: sp.isSale,
        lastScrapedAt: sp.lastScrapedAt,
      }))
      .sort((a, b) => a.price - b.price);

    const best = prices[0] ?? null;

    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      unitSize: product.unitSize,
      imageUrl: product.imageUrl,
      category: product.category,
      bestPrice: best?.price ?? null,
      bestStore: best?.chain ?? null,
      prices,
      isWatched: watchedIds.has(product.id),
    };
  });

  return NextResponse.json(shaped, {
    headers: {
      // Cache for 5 min as per PLAN.md — Redis caching can replace this later
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
