import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import type { ListItemGetPayload } from "../../../../../../prisma/generated/models/ListItem";

const createSchema = z.object({
  productId: z.string().min(1).nullish(),
  name: z.string().trim().min(1).max(200).optional(),
  quantity: z.number().finite().nonnegative().nullish(),
  unit: z.string().max(50).nullish(),
  notes: z.string().max(1000).nullish(),
});

// Bounded like `createSchema`: this accepted any number, so a negative
// quantity or price could be saved and then summed into a list total.
const patchSchema = z.object({
  itemId: z.string(),
  isChecked: z.boolean().optional(),
  quantity: z.number().finite().nonnegative().max(999).optional(),
  unit: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
  customPrice: z.number().finite().nonnegative().max(100_000).nullable().optional(),
  /** Link a typed-in item to a catalogue product, change it, or unlink (null). */
  productId: z.string().min(1).nullable().optional(),
});

/** What every write returns: the item with its product's live store rows. */
const itemInclude = {
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
} as const;

type ItemWithProduct = ListItemGetPayload<{ include: typeof itemInclude }>;

function serializeItem(item: ItemWithProduct) {
  return {
    ...item,
    quantity: item.quantity !== null ? Number(item.quantity) : null,
    customPrice: item.customPrice ? Number(item.customPrice) : null,
    product: item.product
      ? {
          ...item.product,
          unitQuantity:
            item.product.unitQuantity !== null
              ? Number(item.product.unitQuantity)
              : null,
          storeProducts: item.product.storeProducts.map((sp) => ({
            ...sp,
            currentPrice: sp.currentPrice ? Number(sp.currentPrice) : null,
          })),
        }
      : null,
  };
}

const deleteSchema = z.union([
  z.object({ itemId: z.string() }),
  z.object({ clearCompleted: z.literal(true) }),
  z.object({ clearAll: z.literal(true) }),
]);

// Verify the list belongs to the user
async function verifyListOwner(listId: string, userId: string) {
  const list = await prisma.list.findFirst({
    where: { id: listId, userId },
    select: { id: true },
  });
  return !!list;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;

  const list = await prisma.list.findFirst({ where: { id, userId: user.id } });
  if (!list)
    return NextResponse.json({ error: "List not found" }, { status: 404 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { productId, quantity, unit, notes } = parsed.data;

  // A product-linked add may arrive without a name. Add to list from search,
  // home and the product page sent only { productId, quantity } and every one
  // was rejected here — and the sheet ignored the 400, so nothing happened and
  // nothing said why. Name it from the catalogue instead of demanding the
  // client repeat it. Checking the product also turns an unknown id into a
  // 404; it used to reach Prisma as a foreign-key violation and come back 500.
  let name = parsed.data.name;
  if (productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { name: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    name ??= product.name;
  }

  if (!name)
    return NextResponse.json({ error: "name is required" }, { status: 400 });

  const lastItem = await prisma.listItem.findFirst({
    where: { listId: id },
    orderBy: { sortOrder: "desc" },
  });

  let lastCustomPrice: number | null = null;
  if (!productId && name) {
    const lastItem = await prisma.listItem.findFirst({
      where: {
        list: { userId: user.id },
        name: { equals: name, mode: "insensitive" },
        productId: null,
        customPrice: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { customPrice: true },
    });
    lastCustomPrice = lastItem?.customPrice
      ? Number(lastItem.customPrice)
      : null;
  }
  // Check for existing item to avoid duplicates
  const existing = await prisma.listItem.findFirst({
    where: {
      listId: id,
      ...(productId
        ? { productId }
        : { name: { equals: name, mode: "insensitive" }, productId: null }),
    },
  });

  if (existing) {
    const item = await prisma.listItem.update({
      where: { id: existing.id },
      data: {
        quantity:
          existing.quantity !== null
            ? Number(existing.quantity) + (quantity ?? 1)
            : (quantity ?? 1),
      },
      include: itemInclude,
    });
    return NextResponse.json(serializeItem(item), { status: 200 });
  }

  // No duplicate — proceed with create as before
  const item = await prisma.listItem.create({
    data: {
      listId: id,
      productId: productId ?? null,
      name,
      quantity: quantity ?? 1,
      unit: unit ?? null,
      notes: notes ?? null,
      customPrice: lastCustomPrice,
      sortOrder: (lastItem?.sortOrder ?? -1) + 1,
    },
    include: itemInclude,
  });
  return NextResponse.json(serializeItem(item), { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;
  const owned = await verifyListOwner(id, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { itemId, ...data } = parsed.data;

  // Verify item belongs to the verified list before updating
  const listItem = await prisma.listItem.findFirst({
    where: { id: itemId, listId: id },
    select: { id: true },
  });
  if (!listItem) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Linking is checked like POST: an unknown id would otherwise reach Prisma
  // as a foreign-key violation and come back a 500.
  if (data.productId) {
    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
  }

  // Only update fields that were provided
  const updateData: Record<string, unknown> = {};
  if (data.isChecked !== undefined) updateData.isChecked = data.isChecked;
  if (data.quantity !== undefined) updateData.quantity = data.quantity;
  if (data.unit !== undefined) updateData.unit = data.unit;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.customPrice !== undefined) updateData.customPrice = data.customPrice;
  if (data.productId !== undefined) {
    updateData.productId = data.productId;
    // Store prices replace a hand-entered one once the item is linked; left
    // behind, it would come back as the price if the item were unlinked.
    if (data.productId) updateData.customPrice = null;
  }

  const updated = await prisma.listItem.update({
    where: { id: itemId },
    data: updateData,
    include: itemInclude,
  });

  // Touch list updatedAt so dropdown sorts correctly
  await prisma.list.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(serializeItem(updated));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;
  const owned = await verifyListOwner(id, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if ("clearAll" in parsed.data) {
    await prisma.listItem.deleteMany({ where: { listId: id } });
  } else if ("clearCompleted" in parsed.data) {
    await prisma.listItem.deleteMany({
      where: { listId: id, isChecked: true },
    });
  } else {
    // Verify item belongs to the verified list before deleting
    const listItem = await prisma.listItem.findFirst({
      where: { id: parsed.data.itemId, listId: id },
      select: { id: true },
    });
    if (!listItem) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.listItem.delete({ where: { id: parsed.data.itemId } });
  }

  await prisma.list.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
