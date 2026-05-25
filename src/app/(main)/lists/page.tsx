import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import ListsClient from "@/components/lists/ListsClient";
import { GUEST_LIST, GUEST_ALL_LISTS, GUEST_PREFERRED_STORES } from "@/lib/guest-data";
import type { ComponentProps } from "react";

const LAST_LIST_KEY = "sentinel_last_list_id";

async function getLists(userId: string) {
  return prisma.list.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      _count: { select: { items: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function getListDetail(listId: string, userId: string) {
  return prisma.list.findFirst({
    where: { id: listId, userId },
    include: {
      items: {
        include: {
          product: {
            include: {
              storeProducts: {
                where: { isActive: true },
                include: {
                  store: { select: { id: true, chain: true, name: true } },
                },
                orderBy: { currentPrice: "asc" },
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

export default async function ListsPage() {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get("panion-guest")?.value === "1";

  if (isGuest) {
    return (
      <ListsClient
        initialList={GUEST_LIST as ComponentProps<typeof ListsClient>["initialList"]}
        allLists={GUEST_ALL_LISTS}
        preferredStores={GUEST_PREFERRED_STORES}
      />
    );
  }

  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const userId = session.user.id;

  const [rawLists, preferredStores] = await Promise.all([
    getLists(userId),
    prisma.userPreferredStore.findMany({
      where: { userId },
      include: { store: { select: { chain: true, name: true } } },
    }),
  ]);

  const allLists = rawLists.map((l) => ({
    id: l.id,
    name: l.name,
    itemCount: l._count.items,
  }));

  // Load most recent list
  const firstList = rawLists[0] ?? null;
  const initialList = firstList
    ? await getListDetail(firstList.id, userId)
    : null;

  const serializedList = initialList
    ? {
        ...initialList,
        items: initialList.items.map((item) => ({
          ...item,
          quantity:
            item.quantity !== null && item.quantity !== undefined
              ? Number(item.quantity)
              : null,
          customPrice: item.customPrice ? Number(item.customPrice) : null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
          product: item.product
            ? {
                ...item.product,
                unitQuantity: item.product.unitQuantity
                  ? Number(item.product.unitQuantity)
                  : null,
                storeProducts: item.product.storeProducts.map((sp) => ({
                  ...sp,
                  currentPrice: sp.currentPrice
                    ? Number(sp.currentPrice)
                    : null,
                })),
              }
            : null,
        })),
      }
    : null;

  return (
    <ListsClient
      initialList={
        serializedList as ComponentProps<typeof ListsClient>["initialList"]
      }
      allLists={allLists}
      preferredStores={preferredStores.map((ps) => ({
        chain: ps.store.chain,
        name: ps.store.name,
      }))}
    />
  );
}
