import { config as loadEnv } from "dotenv";

/*
 * Env precedence, decided before anything imports Prisma.
 *
 * Default is local, matching `prisma.config.ts` (CLAUDE.md rule 2).
 *
 * `--production` redirects **only** `DATABASE_URL`. Everything else still comes
 * from `.env.local`, because those are credentials for the world outside this
 * app — `PC_EXPRESS_API_KEY` above all — and they do not vary by which database
 * we happen to be writing to. Skipping the whole file instead just loses the
 * scraper key and fails after the harvest has already been planned.
 */
const TARGET_PRODUCTION = process.argv.includes("--production");

loadEnv({ path: ".env" });
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;
loadEnv({ path: ".env.local", override: true });
if (TARGET_PRODUCTION) process.env.DATABASE_URL = PRODUCTION_DATABASE_URL;

if (TARGET_PRODUCTION && !/neon\.tech/i.test(process.env.DATABASE_URL ?? "")) {
  console.error(
    "\n❌ --production expects the Neon database, but .env does not resolve to one. Refusing to run.\n",
  );
  process.exit(1);
}

/**
 * Build the canonical catalogue from real store data.
 *
 *   npm run catalogue:import                 # ~250 products, production pacing
 *   npm run catalogue:import -- --fast       # no jitter (local iteration)
 *   npm run catalogue:import -- --size 300
 *   npm run catalogue:import -- --purge-seed # drop the fabricated seed products first
 *
 * Targeted expansion — deepen one category without re-harvesting everything:
 *
 *   npm run catalogue:import -- --category dairy --size 60 --candidates 200
 *   npm run catalogue:import -- --terms "bread,bagels,sourdough" --size 30
 *
 * Both narrow the harvest to those search terms. The import is **purely
 * additive** — it creates and updates, and never deletes or deactivates — so a
 * scoped run cannot disturb products outside its terms. `--size` then bounds
 * how many of the harvested candidates are kept, and applies to that run only.
 * `--candidates` raises the per-category cap on how many harvested products are
 * sent to the group classifier; on a scoped run the default of 80 is usually
 * what limits the result, not `--size`.
 *
 * **`--production` writes to Neon.** Run the import there *once* rather than
 * locally and again on production: products are identified by barcode, but a
 * genuinely new product gets a fresh cuid on each run, so importing the same
 * product in both places mints two different ids for it and permanently breaks
 * the snapshot restore path between the two databases.
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

  // Scope the harvest to one category group or an explicit term list.
  const { CATALOGUE_TERMS } = await import("@/lib/pricing/catalogue-terms");
  const category = arg("--category");
  const termList = arg("--terms");
  let terms: string[] | undefined;
  if (termList) {
    terms = termList.split(",").map((t) => t.trim()).filter(Boolean);
  } else if (category) {
    terms = CATALOGUE_TERMS[category];
    if (!terms) {
      console.error(
        `\n❌ Unknown category "${category}". Known: ${Object.keys(CATALOGUE_TERMS).join(", ")}\n`,
      );
      process.exit(1);
    }
  }

  const candidates = arg("--candidates") ? Number(arg("--candidates")) : undefined;

  const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1];
  console.log(
    `\n▸ Catalogue import → ${TARGET_PRODUCTION ? "PRODUCTION " : ""}${host ?? "(unknown DB)"}  (target ${size})`,
  );
  console.log(
    terms
      ? `  scope: ${terms.length} terms — ${terms.join(", ")}\n`
      : `  scope: all terms\n`,
  );

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
    ...(terms ? { terms } : {}),
    ...(candidates ? { candidatesPerCategory: candidates } : {}),
    ...(fast ? { delayMs: { min: 0, max: 0 } } : {}),
  });

  console.log(`\n─── Summary (${((Date.now() - started) / 1000).toFixed(1)}s) ───`);
  console.log(`  fetched   : ${s.fetched}`);
  console.log(`  kept      : ${s.kept}`);
  console.log(`  created   : ${s.created}`);
  console.log(`  updated   : ${s.updated}`);
  console.log(`  prices    : ${s.pricesWritten}`);
  console.log(`  groups    : ${s.groups} (${s.groupsWithPrivateLabel} include a store brand)`);
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
