import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

type StoreTotal = {
  store: { id: string; chain: string; name: string };
  total: number;
  matchedItems: number;
  items: { name: string; price: number; storeProductId: string }[];
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;

  const list = await prisma.list.findFirst({
    where: { id, userId: user.id },
    include: {
      items: {
        where: { isChecked: false },
        include: {
          product: {
            include: {
              storeProducts: {
                where: { isActive: true, store: { chain: { not: "costco" } } },
                include: {
                  store: { select: { id: true, chain: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!list)
    return NextResponse.json({ error: "List not found" }, { status: 404 });

  const storeTotals: { [storeId: string]: StoreTotal } = {};

  // Free-text items belong to the list, not to any one store. They used to be
  // pushed into whatever stores happened to already exist in `storeTotals`,
  // which meant an unmatched *first* item was dropped entirely (the map was
  // still empty) and the rest were scattered per-store (audit M3).
  const unmatchedItems: string[] = [];

  for (const item of list.items) {
    if (!item.product) {
      unmatchedItems.push(item.name);
      continue;
    }

    for (const sp of item.product.storeProducts) {
      if (!sp.currentPrice) continue;

      const storeId = sp.store.id;
      if (!storeTotals[storeId]) {
        storeTotals[storeId] = {
          store: sp.store,
          total: 0,
          matchedItems: 0,
          items: [],
        };
      }

      const lineTotal = Number(sp.currentPrice) * Number(item.quantity);
      storeTotals[storeId].total += lineTotal;
      storeTotals[storeId].matchedItems += 1;
      storeTotals[storeId].items.push({
        name: item.name,
        price: Number(sp.currentPrice),
        storeProductId: sp.id,
      });
    }
  }

  // Rank by coverage first, then price. Sorting on total alone let a store that
  // stocks 1 of your 10 items "win" as cheapest despite being unable to fill
  // the basket (audit M3).
  const ranked = Object.values(storeTotals).sort((a, b) =>
    b.matchedItems !== a.matchedItems
      ? b.matchedItems - a.matchedItems
      : a.total - b.total,
  );

  const best = ranked[0];

  return NextResponse.json({
    listId: id,
    listName: list.name,
    totalItems: list.items.length,
    matchableItems: list.items.length - unmatchedItems.length,
    // One top-level list rather than a copy per store.
    unmatchedItems,
    ranked: ranked.map((s, index) => ({
      rank: index + 1,
      store: s.store,
      total: Math.round(s.total * 100) / 100,
      matchedItems: s.matchedItems,
      // Only meaningful between stores with the same coverage; null otherwise
      // so the UI doesn't present an apples-to-oranges "saving".
      savingsVsBest:
        index === 0 || s.matchedItems !== best.matchedItems
          ? null
          : Math.round((s.total - best.total) * 100) / 100,
      items: s.items,
    })),
  });
}
