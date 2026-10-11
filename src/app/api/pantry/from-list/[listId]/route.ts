import { NextRequest, NextResponse, after } from "next/server";
import { categorizePantry } from "@/lib/pantry/categorize";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { listId } = await params;
  const body = await request.json();
  const { items } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "items array is required" },
      { status: 400 },
    );
  }

  // Ownership check
  const list = await prisma.list.findFirst({
    where: { id: listId, userId: user.id },
  });
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  // Fetch the list items to get product details
  const listItems = await prisma.listItem.findMany({
    where: {
      listId,
      id: { in: items.map((i: { listItemId: string }) => i.listItemId) },
    },
    include: { product: true },
  });

  // Bulk create pantry items
  const pantryItems = await prisma.pantryItem.createMany({
    data: listItems.map((li) => ({
      userId: user.id,
      productId: li.productId ?? null,
      name: li.name,
      quantity: li.quantity,
      unit: li.unit ?? null,
      // The catalogue's category when the item is linked; the rest are
      // suggested after responding.
      category: li.product?.category ?? null,
      addedFrom: "list_checkout",
      expiresAt: items.find(
        (i: { listItemId: string; expiresAt?: string }) =>
          i.listItemId === li.id,
      )?.expiresAt
        ? new Date(
            items.find(
              (i: { listItemId: string; expiresAt?: string }) =>
                i.listItemId === li.id,
            ).expiresAt,
          )
        : null,
    })),
  });

  after(() => categorizePantry(user.id).then(() => {}));

  return NextResponse.json({ created: pantryItems.count }, { status: 201 });
}
