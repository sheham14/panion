import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { computeListPricing } from "@/lib/list-pricing";

/**
 * Which of the shopper's stores to buy this list at — the same answer the
 * list page gives, because it is the same function.
 *
 * This route used to keep its own ranking: coverage first, then sticker total
 * per store, quantity times price with no unit conversion and no custom
 * prices, across every store rather than the shopper's. So it could name a
 * different "best" store than the list page did for the same list. It now
 * returns `computeListPricing()` (CLAUDE.md rule 12): stores rank on the basket
 * every one of them can price, and each states what it covers and leaves out.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;

  const [list, preferred] = await Promise.all([
    prisma.list.findFirst({
      where: { id, userId: user.id },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: {
            product: {
              select: {
                unitSize: true,
                unitMeasure: true,
                unitQuantity: true,
                storeProducts: {
                  where: { isActive: true },
                  select: {
                    currentPrice: true,
                    store: { select: { chain: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.userPreferredStore.findMany({
      where: { userId: user.id },
      select: { store: { select: { chain: true } } },
    }),
  ]);

  if (!list)
    return NextResponse.json({ error: "List not found" }, { status: 404 });

  const items = list.items.map((item) => ({
    id: item.id,
    isChecked: item.isChecked,
    quantity: item.quantity !== null ? Number(item.quantity) : null,
    unit: item.unit,
    customPrice: item.customPrice !== null ? Number(item.customPrice) : null,
    product: item.product
      ? {
          unitSize: item.product.unitSize,
          unitMeasure: item.product.unitMeasure,
          unitQuantity:
            item.product.unitQuantity !== null
              ? Number(item.product.unitQuantity)
              : null,
          storeProducts: item.product.storeProducts.map((sp) => ({
            currentPrice: sp.currentPrice !== null ? Number(sp.currentPrice) : null,
            store: sp.store,
          })),
        }
      : null,
  }));

  // Like the list page: no stores chosen means nothing to rank, said as such.
  const pricing = computeListPricing(
    items,
    preferred.map((p) => p.store.chain.toLowerCase()),
  );
  const nameOf = new Map(list.items.map((i) => [i.id, i.name]));
  const round = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    listId: list.id,
    listName: list.name,
    itemCount: pricing.itemCount,
    hasPreferredStores: preferred.length > 0,
    best: pricing.ranked[0]?.chain ?? null,
    stores: pricing.baskets.map((b) => ({
      chain: b.chain,
      total: round(b.total),
      /** Comparable between stores: the shared basket only. */
      comparableTotal: round(b.comparableTotal),
      covered: b.covered.length,
      missing: b.missing.map((m) => ({
        name: nameOf.get(m.itemId) ?? "",
        elsewhere: m.elsewhere,
      })),
    })),
    sharedItemCount: pricing.commonItemIds.length,
    unlinkedItems: pricing.unlinkedItemIds.map((itemId) => nameOf.get(itemId) ?? ""),
    cheapestSplit: pricing.cheapestSplit,
  });
}
