import { prisma } from "@/lib/prisma";
import BrowseClient from "./BrowseClient";

export default async function BrowsePage() {
  const [products, stores] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        brand: true,
        category: true,
        unitSize: true,
        storeProducts: {
          where: { isActive: true, currentPrice: { not: null } },
          select: {
            currentPrice: true,
            isSale: true,
            store: { select: { id: true, chain: true, name: true } },
          },
          orderBy: { currentPrice: "asc" },
        },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, chain: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serialized = products.map((p) => ({
    ...p,
    category: p.category ?? null,
    storeProducts: p.storeProducts.map((sp) => ({
      ...sp,
      currentPrice: sp.currentPrice ? Number(sp.currentPrice) : null,
    })),
  }));

  return <BrowseClient products={serialized} stores={stores} />;
}