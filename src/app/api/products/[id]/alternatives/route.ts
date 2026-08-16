import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api-error";
import { getUnitPrice, rankByUnitPrice } from "@/lib/unit-price";

/**
 * Cheaper alternatives to a product — the cross-**brand** comparison.
 *
 * Distinct from the store comparison on the product page, which answers "where
 * is *this exact item* cheapest". This answers "is there a cheaper brand of the
 * same thing", which for a budget shopper is usually the bigger saving: the
 * store-brand all-dressed chips are 2.7x cheaper per gram than the name brand.
 *
 * Products are grouped by `Product.subcategory`, an equivalence group assigned
 * at import — brand-agnostic and size-agnostic. Because sizes differ within a
 * group, ranking is by **unit price**, never sticker price.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, subcategory: true },
  });
  if (!product) return notFound("Product not found");
  if (!product.subcategory) {
    // Ungrouped products simply have no known alternatives.
    return NextResponse.json({ group: null, basis: null, options: [] });
  }

  const peers = await prisma.product.findMany({
    where: { subcategory: product.subcategory, isActive: true },
    select: {
      id: true,
      name: true,
      brand: true,
      unitSize: true,
      unitQuantity: true,
      unitMeasure: true,
      imageUrl: true,
      storeProducts: {
        where: { isActive: true, currentPrice: { not: null } },
        select: {
          currentPrice: true,
          isSale: true,
          lastScrapedAt: true,
          store: { select: { id: true, chain: true, name: true } },
        },
        orderBy: { currentPrice: "asc" },
      },
    },
  });

  // One row per product at its cheapest store — the comparison is between
  // brands, so a product shouldn't appear four times for four stores.
  const options = peers
    .filter((p) => p.storeProducts.length > 0)
    .map((p) => {
      const best = p.storeProducts[0];
      const price = Number(best.currentPrice);
      return {
        productId: p.id,
        name: p.name,
        brand: p.brand,
        unitSize: p.unitSize,
        imageUrl: p.imageUrl,
        price,
        isSale: best.isSale,
        store: best.store,
        lastScrapedAt: best.lastScrapedAt,
        unitPrice: getUnitPrice({
          price,
          unitQuantity: p.unitQuantity ? Number(p.unitQuantity) : null,
          unitMeasure: p.unitMeasure,
          unitSize: p.unitSize,
        }),
        // How many stores carry this exact product — feeds the store view.
        storeCount: p.storeProducts.length,
      };
    });

  const { ranked, basis, incomparable } = rankByUnitPrice(
    options,
    (o) => o.unitPrice,
  );

  const current = ranked.find((o) => o.productId === id);
  const cheapest = ranked[0];

  return NextResponse.json({
    group: product.subcategory,
    basis,
    // Only meaningful when both are on the same basis.
    savingsVsCurrent:
      current && cheapest && current.productId !== cheapest.productId
        ? {
            productId: cheapest.productId,
            perUnit:
              Math.round(
                (current.unitPrice!.value - cheapest.unitPrice!.value) * 100,
              ) / 100,
            percent: Math.round(
              (1 - cheapest.unitPrice!.value / current.unitPrice!.value) * 100,
            ),
          }
        : null,
    options: ranked,
    // Same group but a different measure (weight vs volume) — shown, never ranked.
    incomparable,
  });
}
