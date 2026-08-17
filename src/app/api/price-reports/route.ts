import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { validateBody, idSchema, MAX_NOTES_LENGTH } from "@/lib/validate";
import { notFound } from "@/lib/api-error";

/**
 * `reportedPrice` was previously written straight through: a negative number, a
 * huge number, or a string all reached Prisma. `notes` was unchecked against
 * its VarChar(500) column, so an over-long note became a 500 (audit H4).
 */
const PriceReportSchema = z.object({
  productId: idSchema,
  storeId: idSchema,
  reportedPrice: z
    .number()
    .finite()
    .positive()
    // A grocery item outside this range is a typo or an attack, not a price.
    .max(2000, { message: "Reported price looks out of range" })
    .refine((n) => Number.isInteger(Math.round(n * 100)), {
      message: "Price may have at most 2 decimal places",
    }),
  notes: z.string().trim().max(MAX_NOTES_LENGTH).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { data, error: invalid } = await validateBody(req, PriceReportSchema);
  if (invalid) return invalid;

  const { productId, storeId, reportedPrice, notes } = data;

  /**
   * A missing StoreProduct is not an error — it is the most useful report.
   *
   * This used to 404 whenever the row was absent, which meant a store we hold
   * no price for could never receive one: the report that would fill the gap
   * was the only one rejected. Since the row is just the (store, product) join,
   * create it on demand and let the report attach.
   *
   * The product and store are verified first so this cannot be used to
   * fabricate rows for ids that do not exist.
   */
  const [product, store] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
    prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, isActive: true },
    }),
  ]);
  if (!product) return notFound("Product not found");
  if (!store?.isActive) return notFound("Store not found");

  const storeProduct = await prisma.storeProduct.upsert({
    where: { storeId_productId: { storeId, productId } },
    create: { storeId, productId, isActive: true },
    update: {},
  });

  const report = await prisma.priceReport.create({
    data: {
      storeProductId: storeProduct.id,
      reportedBy: user.id,
      reportedPrice,
      currentDbPrice: storeProduct.currentPrice,
      seenAt: new Date(),
      notes: notes?.length ? notes : null,
    },
  });

  return NextResponse.json(
    { success: true, reportId: report.id },
    { status: 201 },
  );
}
