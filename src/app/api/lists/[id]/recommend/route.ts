import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

type StoreTotal = {
  store: { id: string; chain: string; name: string };
  total: number;
  matchedItems: number;
  unmatchedItems: string[];
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

  for (const item of list.items) {
    if (!item.product) {
      for (const storeData of Object.values(storeTotals)) {
        storeData.unmatchedItems.push(item.name);
      }
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
          unmatchedItems: [],
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

  const ranked = Object.values(storeTotals).sort(
    (a: StoreTotal, b: StoreTotal) => a.total - b.total,
  );

  const cheapest = ranked[0];

  return NextResponse.json({
    listId: id,
    listName: list.name,
    totalItems: list.items.length,
    ranked: ranked.map((s: StoreTotal, index: number) => ({
      rank: index + 1,
      store: s.store,
      total: Math.round(s.total * 100) / 100,
      matchedItems: s.matchedItems,
      unmatchedItems: s.unmatchedItems,
      savingsVsCheapest:
        index === 0 ? 0 : Math.round((s.total - cheapest.total) * 100) / 100,
      items: s.items,
    })),
  });
}
