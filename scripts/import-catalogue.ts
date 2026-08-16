import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

/**
 * Build the canonical catalogue from real store data.
 *
 *   npm run catalogue:import                 # ~250 products, production pacing
 *   npm run catalogue:import -- --fast       # no jitter (local iteration)
 *   npm run catalogue:import -- --size 300
 *   npm run catalogue:import -- --purge-seed # drop the fabricated seed products first
 *
 * `--purge-seed` deletes the hand-written products whose ids start with
 * "prod_" (the old seed's convention) along with anything referencing them.
 * Real imported products get cuid ids, so the two are trivially separable.
 */
async function main() {
  const args = process.argv.slice(2);
  const fast = args.includes("--fast");
  const purgeSeed = args.includes("--purge-seed");

  const arg = (flag: string): string | undefined => {
    const hit = args.find((a) => a.startsWith(flag));
    if (!hit) return undefined;
    return hit.includes("=") ? hit.split("=")[1] : args[args.indexOf(hit) + 1];
  };

  const size = Number(arg("--size") ?? 250);

  const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1];
  console.log(`\n▸ Catalogue import → ${host ?? "(unknown DB)"}  (target ${size})\n`);

  const { prisma } = await import("@/lib/prisma");

  if (purgeSeed) {
    // Hand-written seed products used "prod_*" ids; imported ones use cuids.
    const doomed = await prisma.product.findMany({
      where: { id: { startsWith: "prod_" } },
      select: { id: true },
    });
    const ids = doomed.map((d) => d.id);
    if (ids.length) {
      const spIds = (
        await prisma.storeProduct.findMany({
          where: { productId: { in: ids } },
          select: { id: true },
        })
      ).map((s) => s.id);

      await prisma.$transaction([
        prisma.priceHistory.deleteMany({ where: { storeProductId: { in: spIds } } }),
        prisma.priceReport.deleteMany({ where: { storeProductId: { in: spIds } } }),
        prisma.storeInventory.deleteMany({ where: { storeProductId: { in: spIds } } }),
        prisma.storeProduct.deleteMany({ where: { productId: { in: ids } } }),
        prisma.watchlist.deleteMany({ where: { productId: { in: ids } } }),
        prisma.recipeIngredient.updateMany({
          where: { productId: { in: ids } },
          data: { productId: null },
        }),
        prisma.listItem.updateMany({
          where: { productId: { in: ids } },
          data: { productId: null },
        }),
        prisma.pantryItem.updateMany({
          where: { productId: { in: ids } },
          data: { productId: null },
        }),
        prisma.product.deleteMany({ where: { id: { in: ids } } }),
      ]);
      console.log(`Purged ${ids.length} fabricated seed products and their price data.`);
      console.log(
        "Recipe/list/pantry references were nulled rather than deleted, so those rows survive as free text.\n",
      );
    }
  }

  const { importCatalogue } = await import("@/lib/pricing/import-catalogue");

  const started = Date.now();
  const s = await importCatalogue({
    verbose: true,
    targetSize: size,
    ...(fast ? { delayMs: { min: 0, max: 0 } } : {}),
  });

  console.log(`\n─── Summary (${((Date.now() - started) / 1000).toFixed(1)}s) ───`);
  console.log(`  fetched   : ${s.fetched}`);
  console.log(`  kept      : ${s.kept}`);
  console.log(`  created   : ${s.created}`);
  console.log(`  updated   : ${s.updated}`);
  console.log(`  prices    : ${s.pricesWritten}`);
  console.log(`  by category:`);
  for (const [c, n] of Object.entries(s.byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${c.padEnd(20)} ${n}`);
  }
  if (s.errors.length) {
    console.log(`\n  ⚠ ${s.errors.length} fetch errors (first 5):`);
    for (const e of s.errors.slice(0, 5)) console.log(`    - ${e}`);
  }
  console.log();

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("\n❌ Catalogue import failed:", err);
  process.exit(1);
});
