import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { withGroups } from "@/lib/list-groups";

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

  if (!list)
    return NextResponse.json({ error: "List not found" }, { status: 404 });

  const serialized = {
    ...list,
    items: list.items.map((item) => ({
      ...item,
      quantity:
        item.quantity !== null && item.quantity !== undefined
          ? Number(item.quantity)
          : null,
      customPrice: item.customPrice ? Number(item.customPrice) : null,
      product: item.product
        ? {
            ...item.product,
            unitQuantity: item.product.unitQuantity
              ? Number(item.product.unitQuantity)
              : null,
            storeProducts: item.product.storeProducts.map((sp) => ({
              ...sp,
              currentPrice: sp.currentPrice ? Number(sp.currentPrice) : null,
            })),
          }
        : null,
    })),
  };

  return NextResponse.json({ ...serialized, items: await withGroups(serialized.items) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const list = await prisma.list.updateMany({
    where: { id, userId: user.id },
    data: { name: body.name },
  });

  return NextResponse.json(list);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;

  await prisma.list.deleteMany({
    where: { id, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
