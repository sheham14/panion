import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUnitPrice, rankByUnitPrice } from "@/lib/unit-price";

/**
 * Search **equivalence groups** — "what is the cheapest bread", not "where is
 * this loaf cheapest".
 *
 * The two questions a shopper asks are different, and only one of them had a
 * way in. Searching "bread" returned a wall of individual loaves, each showing
 * its own cheapest store; the brand-versus-brand ranking existed but could only
 * be reached from inside a product page, so nobody found it. This is the front
 * door for it.
 *
 * Ranking is by **unit price**, never sticker price: a group deliberately spans
 * pack sizes, so a 450g loaf at $3.49 and a 675g loaf at $4.29 only compare
 * honestly per 100g. Products whose size cannot be parsed, or which measure in
 * a different basis than the rest of their group, are returned but never
 * ranked — showing them as "cheapest" would be a guess.
 */

/** Groups smaller than this are just a product; there is nothing to compare. */
const MIN_GROUP_SIZE = 2;
const MAX_GROUPS = 12;
const MAX_MEMBERS = 24;

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ groups: [] });

  // Match the group slug itself as well as product names: "bread" should find
  // `multigrain-bread` even where no product name contains the bare word.
  const slugQuery = q.toLowerCase().replace(/\s+/g, "-");

  const candidates = await prisma.product.findMany({
    where: {
      isActive: true,
      subcategory: { not: null },
      OR: [
        { subcategory: { contains: slugQuery, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { subcategory: true },
    take: 400,
  });

  const groupNames = [...new Set(candidates.map((c) => c.subcategory!))];
  if (groupNames.length === 0) return NextResponse.json({ groups: [] });

  // Pull every member of each candidate group — a group found by one product's
  // name must still be ranked against all its siblings.
  const members = await prisma.product.findMany({
    where: { isActive: true, subcategory: { in: groupNames } },
    select: {
      id: true,
      name: true,
      brand: true,
      unitSize: true,
      unitQuantity: true,
      unitMeasure: true,
      imageUrl: true,
      subcategory: true,
      storeProducts: {
        where: { isActive: true, currentPrice: { not: null } },
        select: {
          currentPrice: true,
          isSale: true,
          store: { select: { id: true, name: true, chain: true } },
        },
        orderBy: { currentPrice: "asc" },
      },
    },
  });

  const byGroup = new Map<string, typeof members>();
  for (const m of members) {
    const k = m.subcategory!;
    byGroup.set(k, [...(byGroup.get(k) ?? []), m]);
  }

  const groups = [...byGroup.entries()]
    .map(([slug, list]) => {
      // One row per product at its cheapest store: the comparison is between
      // brands, so a product must not appear once per store it is sold in.
      const options = list
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
            storeCount: new Set(p.storeProducts.map((s) => s.store.id)).size,
            unitPrice: getUnitPrice({
              price,
              unitQuantity: p.unitQuantity ? Number(p.unitQuantity) : null,
              unitMeasure: p.unitMeasure,
              unitSize: p.unitSize,
            }),
          };
        });

      const { ranked, basis, incomparable } = rankByUnitPrice(
        options,
        (o) => o.unitPrice,
      );

      /*
       * Drop unit prices that cannot be true.
       *
       * A misparsed size produces an arithmetically valid but absurd figure —
       * a Sobeys hard-boiled egg pack came out at $565.91/100g because its
       * size read as a fraction of a gram. One such row makes the whole
       * ranking untrustworthy to anyone reading it, and it is always a parsing
       * artefact rather than a real price. Compared against the group's median
       * rather than a fixed threshold, since a sensible per-100g figure for
       * butter and for saffron differ by orders of magnitude.
       */
      const values = ranked
        .map((o) => o.unitPrice?.value ?? 0)
        .filter((v) => v > 0)
        .sort((a, b) => a - b);
      const median = values.length
        ? values[Math.floor(values.length / 2)]
        : null;
      const plausible = median
        ? ranked.filter((o) => {
            const v = o.unitPrice?.value;
            if (!v) return true;
            return v <= median * 12 && v >= median / 12;
          })
        : ranked;
      const implausible = ranked.filter((o) => !plausible.includes(o));

      const stores = new Set<string>();
      for (const p of list) for (const sp of p.storeProducts) stores.add(sp.store.id);

      const cheapest = plausible[0] ?? null;
      const dearest = plausible[plausible.length - 1] ?? null;

      return {
        group: slug,
        // "multigrain-bread" reads as a heading once the hyphens go.
        label: slug.replace(/-/g, " "),
        basis,
        productCount: options.length,
        storeCount: stores.size,
        cheapest,
        // What the group is worth knowing about: the spread between best and
        // worst value, which is the saving a shopper can actually act on.
        spreadPercent:
          cheapest?.unitPrice && dearest?.unitPrice && dearest !== cheapest
            ? Math.round(
                (1 - cheapest.unitPrice.value / dearest.unitPrice.value) * 100,
              )
            : null,
        options: plausible.slice(0, MAX_MEMBERS),
        incomparable: [...incomparable, ...implausible].slice(0, MAX_MEMBERS),
      };
    })
    // A group with one priced product compares nothing.
    .filter((g) => g.productCount >= MIN_GROUP_SIZE)
    .sort(
      (a, b) =>
        b.storeCount - a.storeCount ||
        b.productCount - a.productCount ||
        a.label.localeCompare(b.label),
    )
    .slice(0, MAX_GROUPS);

  return NextResponse.json(
    { groups },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    },
  );
}
