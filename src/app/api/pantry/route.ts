import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import {
  validateBody,
  boundedString,
  idSchema,
  quantitySchema,
  MAX_NAME_LENGTH,
  MAX_TAG_LENGTH,
} from "@/lib/validate";

/**
 * Shared by POST here and PATCH on `[id]`.
 *
 * `name` is bounded because pantry item names are interpolated into Clove's
 * system prompt (audit H6), and `expiresAt` is coerced because
 * `new Date("garbage")` produced an Invalid Date that Prisma rejected as a
 * 500 (audit H4).
 */
export const pantryFields = {
  name: boundedString(MAX_NAME_LENGTH),
  brand: z.string().trim().max(MAX_TAG_LENGTH).nullish(),
  category: z.string().trim().max(MAX_TAG_LENGTH).nullish(),
  productId: idSchema.nullish(),
  quantity: quantitySchema.nullish(),
  unit: z.string().trim().max(32).nullish(),
  expiresAt: z.coerce.date().nullish(),
};

const CreatePantryItemSchema = z.object(pantryFields);

/**
 * The linked product's photo flag, or a 404 for an unknown id. Checked before
 * writing: an unknown id used to reach Prisma as a foreign-key violation and
 * come back a 500. The flag is returned so the tile can show (or drop) the
 * photo for a newly linked product without a reload.
 */
export async function linkedProduct(
  productId: string | null | undefined,
): Promise<{ imageUrl: string | null } | NextResponse | null> {
  if (!productId) return null;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { imageUrl: true },
  });
  return product ?? NextResponse.json({ error: "Product not found" }, { status: 404 });
}

export async function GET() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const pantry = await prisma.pantryItem.findMany({
    where: { userId: user.id },
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
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(pantry);
}

export async function POST(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { data, error: invalid } = await validateBody(
    request,
    CreatePantryItemSchema,
  );
  if (invalid) return invalid;

  const product = await linkedProduct(data.productId);
  if (product instanceof NextResponse) return product;

  const item = await prisma.pantryItem.create({
    data: {
      userId: user.id,
      productId: data.productId ?? null,
      name: data.name,
      quantity: data.quantity ?? null,
      unit: data.unit ?? null,
      brand: data.brand ?? null,
      category: data.category ?? null,
      expiresAt: data.expiresAt ?? null,
      addedFrom: "manual",
    },
  });

  return NextResponse.json(
    { ...item, imageUrl: product?.imageUrl ?? null },
    { status: 201 },
  );
}
