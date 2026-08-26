import { config as loadEnv } from "dotenv";

/*
 * Local by default (CLAUDE.md rule 2). `--production` redirects only
 * DATABASE_URL and refuses to run against anything but Neon.
 */
const TARGET_PRODUCTION = process.argv.includes("--production");
loadEnv({ path: ".env" });
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;
loadEnv({ path: ".env.local", override: true });
if (TARGET_PRODUCTION) process.env.DATABASE_URL = PRODUCTION_DATABASE_URL;

if (TARGET_PRODUCTION && !/neon\.tech/i.test(process.env.DATABASE_URL ?? "")) {
  console.error("\n❌ --production expects the Neon database. Refusing to run.\n");
  process.exit(1);
}

/**
 * Clear prices that cannot be real.
 *
 *   npm run prices:clean                    # report only
 *   npm run prices:clean -- --apply         # clear them
 *   npm run prices:clean -- --production --apply
 *
 * A capture reads what a page renders, and a page can render something the
 * parser misreads — a Verka ghee arrived at $489.99. `/api/groups` already
 * refuses to rank an impossible unit price, but the number still sits in the
 * database, still shows on a product page, and still looks like a real quote to
 * anyone who finds it.
 *
 * Two independent tests, catching two different mistakes — and each is repaired
 * where it is actually broken:
 *
 *   absolute — a grocery item over $150. Real at a warehouse club, never at the
 *              three stores Panion holds. **The price is wrong**, so the price
 *              is cleared and the row deactivated.
 *   relative — a unit price more than 15x the cheapest in its equivalence
 *              group. Here the sticker price is usually fine and **the size is
 *              wrong**: a 258 g pack of butter tarts at $4.69 is an ordinary
 *              price that produced $1090.70/100g. Clearing the price would
 *              discard a real observation, so the size is cleared instead. The
 *              product keeps its price, and simply stops being ranked on value
 *              until a later scrape supplies a size that parses.
 *
 * Follows rule 1: prints its targets and exits. `--apply` is a second,
 * deliberate invocation, and neither path deletes anything.
 */

const ABSOLUTE_MAX = 150;
const GROUP_RATIO = 15;

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("@/lib/prisma");
  const { getUnitPrice } = await import("@/lib/unit-price");

  const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1];
  console.log(`\n▸ ${TARGET_PRODUCTION ? "PRODUCTION " : ""}${host ?? "(unknown DB)"}\n`);

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, subcategory: true,
      unitSize: true, unitQuantity: true, unitMeasure: true,
      storeProducts: {
        where: { isActive: true, currentPrice: { not: null } },
        select: { id: true, currentPrice: true, store: { select: { name: true } } },
      },
    },
  });

  type Row = {
    /** StoreProduct id for a bad price, Product id for a bad size. */
    id: string;
    kind: "price" | "size";
    label: string;
    price: number;
    why: string;
  };
  const doomed: Row[] = [];

  // Absolute: no grocery item at these stores costs this much.
  for (const p of products) {
    for (const sp of p.storeProducts) {
      const price = Number(sp.currentPrice);
      if (price > ABSOLUTE_MAX) {
        doomed.push({
          id: sp.id,
          kind: "price",
          label: `${p.name.slice(0, 52)} @ ${sp.store.name.split(" ")[0]}`,
          price,
          why: `$${price.toFixed(2)} — above the $${ABSOLUTE_MAX} ceiling`,
        });
      }
    }
  }

  // Relative: unit price far above the cheapest in the same group.
  const byGroup = new Map<string, typeof products>();
  for (const p of products) {
    if (!p.subcategory) continue;
    byGroup.set(p.subcategory, [...(byGroup.get(p.subcategory) ?? []), p]);
  }

  for (const [group, list] of byGroup) {
    const priced = list
      .flatMap((p) =>
        p.storeProducts.map((sp) => {
          const price = Number(sp.currentPrice);
          return {
            productId: p.id,
            size: p.unitSize,
            label: `${p.name.slice(0, 52)} @ ${sp.store.name.split(" ")[0]}`,
            price,
            unit: getUnitPrice({
              price,
              unitQuantity: p.unitQuantity ? Number(p.unitQuantity) : null,
              unitMeasure: p.unitMeasure,
              unitSize: p.unitSize,
            }),
          };
        }),
      )
      .filter((x) => x.unit && x.unit.value > 0);

    if (priced.length < 2) continue;

    // Compare only within one basis; g and ml are not commensurable.
    for (const basis of new Set(priced.map((x) => x.unit!.basis))) {
      const same = priced.filter((x) => x.unit!.basis === basis);
      if (same.length < 2) continue;
      const floor = Math.min(...same.map((x) => x.unit!.value));
      for (const x of same) {
        if (
          x.unit!.value > floor * GROUP_RATIO &&
          !doomed.some((d) => d.id === x.productId)
        ) {
          doomed.push({
            id: x.productId,
            kind: "size",
            label: x.label,
            price: x.price,
            why:
              `size "${x.size ?? "?"}" gives ${x.unit!.label} in "${group}" — ` +
              `cheapest there is ${same.find((s) => s.unit!.value === floor)!.unit!.label}`,
          });
        }
      }
    }
  }

  if (!doomed.length) {
    console.log("No implausible prices found.\n");
    process.exit(0);
  }

  const badPrices = doomed.filter((d) => d.kind === "price");
  const badSizes = doomed.filter((d) => d.kind === "size");

  if (badPrices.length) {
    console.log(`── ${badPrices.length} impossible PRICE(s) — will be cleared ──`);
    for (const d of badPrices) console.log(`  ${d.label}\n      ${d.why}`);
  }
  if (badSizes.length) {
    console.log(`\n── ${badSizes.length} impossible SIZE(s) — price kept, size cleared ──`);
    for (const d of badSizes) console.log(`  ${d.label}\n      ${d.why}`);
  }

  if (!apply) {
    console.log(`\nDry run — nothing changed. Re-run with --apply.\n`);
    process.exit(0);
  }

  let clearedPrices = 0;
  if (badPrices.length) {
    // Deactivate rather than delete: a later scrape can put a correct price
    // back on the same row.
    ({ count: clearedPrices } = await prisma.storeProduct.updateMany({
      where: { id: { in: badPrices.map((d) => d.id) } },
      data: { currentPrice: null, isSale: false, regularPrice: null, isActive: false },
    }));
  }

  /*
   * Repair before discarding.
   *
   * Most of these sizes are not wrong at all — "22 x 18.636g" is a correct
   * statement of a 410 g pack that `parseSize` used to read as 18.6 g. Now
   * that it multiplies multipacks out, recomputing the columns from the string
   * fixes the row outright. Only a size that still cannot be read is cleared.
   */
  const { parseSize } = await import("@/lib/pricing/match");
  let repairedSizes = 0;
  let clearedSizes = 0;

  for (const d of badSizes) {
    const product = await prisma.product.findUnique({
      where: { id: d.id },
      select: { unitSize: true, unitQuantity: true, unitMeasure: true },
    });
    const reparsed = product?.unitSize ? parseSize(product.unitSize) : null;

    // Re-reading to the same value is not a repair. That happens when the size
    // string is itself wrong rather than mis-parsed — Mott's Fruitsations is
    // stored as one 104 ml cup while the price is for the multipack — and
    // writing it back would leave the absurd unit price exactly as it was.
    const unchanged =
      reparsed !== null &&
      product?.unitQuantity !== null &&
      product?.unitQuantity !== undefined &&
      Math.abs(Number(product.unitQuantity) - reparsed.qty) < 0.01 &&
      product.unitMeasure === reparsed.unit;

    if (reparsed && !unchanged) {
      await prisma.product.update({
        where: { id: d.id },
        data: { unitQuantity: reparsed.qty, unitMeasure: reparsed.unit },
      });
      repairedSizes += 1;
    } else {
      // All three, because `getUnitPrice` falls back from the columns to
      // `unitSize`, and leaving that behind would re-derive the same figure.
      await prisma.product.update({
        where: { id: d.id },
        data: { unitSize: null, unitQuantity: null, unitMeasure: null },
      });
      clearedSizes += 1;
    }
  }

  console.log(
    `\n✅ Cleared ${clearedPrices} price(s); repaired ${repairedSizes} size(s), ` +
      `cleared ${clearedSizes}. Nothing deleted.\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Failed:", err);
  process.exit(1);
});
