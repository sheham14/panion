import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";

const patchSchema = z.object({
  itemId: z.string(),
  isChecked: z.boolean().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  notes: z.string().optional(),
  customPrice: z.number().nullable().optional(),
});

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

  const body = await request.json();

  const { productId, name, quantity, unit, notes } = body;

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
    });
    const serialized = {
      ...item,
      quantity: item.quantity !== null ? Number(item.quantity) : null,
      customPrice: item.customPrice ? Number(item.customPrice) : null,
      product: item.product
        ? {
            ...item.product,
            storeProducts: item.product.storeProducts.map((sp) => ({
              ...sp,
              currentPrice: sp.currentPrice ? Number(sp.currentPrice) : null,
            })),
          }
        : null,
    };

    return NextResponse.json(serialized, { status: 200 });
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
  });
  const serialized = {
    ...item,
    quantity:
      item.quantity !== null && item.quantity !== undefined
        ? Number(item.quantity)
        : null,
    customPrice: item.customPrice ? Number(item.customPrice) : null,
    product: item.product
      ? {
          ...item.product,
          storeProducts: item.product.storeProducts.map((sp) => ({
            ...sp,
            currentPrice: sp.currentPrice ? Number(sp.currentPrice) : null,
          })),
        }
      : null,
  };

  return NextResponse.json(serialized, { status: 201 });
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

  const body = await req.json();
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

  // Only update fields that were provided
  const updateData: Record<string, unknown> = {};
  if (data.isChecked !== undefined) updateData.isChecked = data.isChecked;
  if (data.quantity !== undefined) updateData.quantity = data.quantity;
  if (data.unit !== undefined) updateData.unit = data.unit;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.customPrice !== undefined) updateData.customPrice = data.customPrice;

  const updated = await prisma.listItem.update({
    where: { id: itemId },
    data: updateData,
  });

  // Touch list updatedAt so dropdown sorts correctly
  await prisma.list.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(updated);
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

  const body = await req.json();
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
