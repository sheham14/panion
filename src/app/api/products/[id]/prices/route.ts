import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseRangeDays } from "@/lib/query-params";
import { notFound } from "@/lib/api-error";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");

  // `range=all` used to map to 9999 days — effectively unbounded. Capped at a
  // year, which is more history than retention keeps anyway (audit M2).
  const days = parseRangeDays(searchParams.get("range") ?? "90d");
  const since = new Date();
  since.setDate(since.getDate() - days);

  const storeProducts = await prisma.storeProduct.findMany({
    where: {
      productId: id,
      isActive: true,
      ...(storeId && { storeId }),
    },
    include: {
      store: { select: { id: true, chain: true, name: true } },
      priceHistory: {
        where: { scrapedAt: { gte: since } },
        orderBy: { scrapedAt: "asc" },
      },
    },
  });

  if (!storeProducts.length) {
    return notFound("Product not found");
  }

  return NextResponse.json(storeProducts);
}
