import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import PantryClient from "@/components/pantry/PantryClient";
import { GUEST_PANTRY_ITEMS } from "@/lib/guest-data";

export type SerializedPantryItem = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  productId: string | null;
  /**
   * Whether the linked product has photography. The tile renders it through
   * `/api/products/[id]/image`, so only the flag travels, not the retailer URL
   * — see `productImageSrc`. Null for a typed-in item with no product, which
   * is most of the pantry today; those keep the category emoji.
   */
  imageUrl: string | null;
  expiresAt: string | null;
  /**
   * When the item entered the pantry. The tile shows age from this, not from
   * `updatedAt` — editing a quantity should not make a three-month-old jar
   * look like it arrived today.
   */
  createdAt: string;
  /** Still what the list sorts on: recently touched is the useful order. */
  updatedAt: string;
  addedFrom: string;
};

async function PantryData({ userId }: { userId: string }) {
  const items = await prisma.pantryItem.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { product: { select: { imageUrl: true } } },
  });

  const serialized: SerializedPantryItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.brand ?? null,
    category: item.category ?? null,
    quantity: item.quantity ? Number(item.quantity) : null,
    unit: item.unit ?? null,
    productId: item.productId ?? null,
    imageUrl: item.product?.imageUrl ?? null,
    expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    addedFrom: item.addedFrom,
  }));

  return <PantryClient initialItems={serialized} />;
}

function PantrySkeleton() {
  return (
    <div className="animate-pulse px-4 pt-4">
      <div className="h-[38px] rounded-xl bg-[#f4f4f4] dark:bg-[#242b2e] mb-3" />
      <div className="grid grid-cols-2 gap-[10px]">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="h-[140px] rounded-[14px] bg-[#f4f4f4] dark:bg-[#242b2e]"
          />
        ))}
      </div>
    </div>
  );
}

export default async function PantryPage() {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get("panion-guest")?.value === "1";

  if (isGuest) {
    return (
      <div className="bg-white dark:bg-[#0f1416] min-h-screen">
        <PantryClient initialItems={GUEST_PANTRY_ITEMS} />
      </div>
    );
  }

  const { user, error } = await getAuthenticatedUser();
  if (error) redirect("/signin");

  return (
    <div className="bg-white dark:bg-[#0f1416] min-h-screen">
      <Suspense fallback={<PantrySkeleton />}>
        <PantryData userId={user!.id} />
      </Suspense>
    </div>
  );
}
