import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { validateBody, idSchema, priceSchema } from "@/lib/validate";
import { notFound } from "@/lib/api-error";

export async function GET() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const watchlist = await prisma.watchlist.findMany({
    where: { userId: user!.id },
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
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(watchlist);
}

const WatchlistSchema = z.object({
  productId: idSchema,
  targetPrice: priceSchema.nullish(),
  notifyOnDrop: z.boolean().optional(),
  notifyOnRise: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { data, error: invalid } = await validateBody(request, WatchlistSchema);
  if (invalid) return invalid;

  const { productId, targetPrice, notifyOnDrop, notifyOnRise } = data;

  // An unknown productId previously reached Prisma and surfaced as a
  // foreign-key 500 rather than a 404 (audit H4).
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) return notFound("Product not found");

  const entry = await prisma.watchlist.upsert({
    where: { userId_productId: { userId: user.id, productId } },
    update: {
      targetPrice: targetPrice ?? null,
      ...(notifyOnDrop !== undefined && { notifyOnDrop }),
      ...(notifyOnRise !== undefined && { notifyOnRise }),
    },
    create: {
      userId: user.id,
      productId,
      targetPrice: targetPrice ?? null,
      ...(notifyOnDrop !== undefined && { notifyOnDrop }),
      ...(notifyOnRise !== undefined && { notifyOnRise }),
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
