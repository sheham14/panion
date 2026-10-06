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
 * Retract prices the brandless-product hole wrote, and close the hole in the
 * existing catalogue.
 *
 *   npm run prices:store-brands                          # report only
 *   npm run prices:store-brands -- --production          # report production
 *   npm run prices:store-brands -- --production --apply  # change it
 *
 * Browser captures of Walmart created products with `brand: null`, the brand
 * left inside the name, and the matcher's brand gate never ran on them — so
 * Sobeys and Dominion own-brand items landed on Great Value products. The
 * matcher is fixed (e35b888), but tightening a rule retracts nothing already
 * written (rule 8). Two passes:
 *
 *  1. **Store-brand prices at the wrong chain.** A Great Value product priced
 *     at Sobeys is wrong by construction — the brand is only on Walmart's
 *     shelves. Those rows are deactivated, never deleted (rule 1), so a later
 *     correct observation can reuse them.
 *  2. **Brandless products whose name starts with a known brand** get the
 *     brand split off, the way new captures now are. Displayed names do not
 *     change: the app shows brand + name.
 *
 * Follows rule 1: prints every target and exits. `--apply` is a second,
 * deliberate invocation. Take a snapshot before applying.
 */

async function main() {
  const apply = process.argv.includes("--apply");

  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").host;
    } catch {
      return "(unparseable)";
    }
  })();
  console.log(`\nDatabase: ${host}${TARGET_PRODUCTION ? "  [--production]" : ""}`);
  console.log(apply ? "Mode: APPLY\n" : "Mode: dry run\n");

  const { prisma } = await import("@/lib/prisma");
  const { normalizeName } = await import("@/lib/pricing/match");
  const { STORE_BRANDS, splitLeadingBrand } = await import("@/lib/pricing/brands");

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      brand: true,
      storeProducts: {
        where: { isActive: true, currentPrice: { not: null } },
        select: {
          id: true,
          currentPrice: true,
          storeProductName: true,
          store: { select: { name: true, chain: true } },
        },
      },
    },
  });

  const catalogueBrands = [
    ...new Set(products.map((p) => p.brand).filter((b): b is string => Boolean(b))),
  ];
  const storeBrandNames = STORE_BRANDS.flatMap((s) => s.brands);
  const chainsFor = (brand: string) =>
    STORE_BRANDS.find((s) =>
      s.brands.some((b) => normalizeName(b) === normalizeName(brand)),
    )?.chains ?? null;

  type Retraction = { id: string; label: string };
  type Backfill = { id: string; from: string; brand: string; name: string };
  const retractions: Retraction[] = [];
  const backfills: Backfill[] = [];

  for (const p of products) {
    let brand = p.brand;

    if (!brand) {
      // Store brands first, so their canonical spelling wins.
      const split = splitLeadingBrand(p.name, [...storeBrandNames, ...catalogueBrands]);
      if (split) {
        backfills.push({ id: p.id, from: p.name, brand: split.brand, name: split.name });
        brand = split.brand;
      }
    }

    const chains = brand ? chainsFor(brand) : null;
    if (!chains) continue;

    for (const sp of p.storeProducts) {
      if (chains.includes(sp.store.chain)) continue;
      retractions.push({
        id: sp.id,
        label:
          `${brand} — ${p.name}\n` +
          `      $${Number(sp.currentPrice).toFixed(2)} at ${sp.store.name}` +
          `   (stored as: ${sp.storeProductName ?? "-"})`,
      });
    }
  }

  console.log(`── ${retractions.length} store-brand price(s) at the wrong chain — will be deactivated ──`);
  for (const r of retractions) console.log(`  ${r.label}`);

  console.log(`\n── ${backfills.length} brandless product(s) — brand will be split off ──`);
  for (const b of backfills) console.log(`  "${b.from}"\n      → brand "${b.brand}", name "${b.name}"`);

  if (!apply) {
    console.log(
      `\nDry run — nothing changed.` +
        (retractions.length || backfills.length
          ? ` Snapshot first (npm run snapshot:save${TARGET_PRODUCTION ? " -- --production" : ""}), then re-run with --apply.`
          : ""),
    );
    console.log();
    process.exit(0);
  }

  let deactivated = 0;
  if (retractions.length) {
    ({ count: deactivated } = await prisma.storeProduct.updateMany({
      where: { id: { in: retractions.map((r) => r.id) } },
      data: { currentPrice: null, isSale: false, regularPrice: null, isActive: false },
    }));
  }

  let backfilled = 0;
  for (const b of backfills) {
    // Conditional on still being brandless, so a re-run cannot strip a name twice.
    const { count } = await prisma.product.updateMany({
      where: { id: b.id, brand: null },
      data: { brand: b.brand, name: b.name },
    });
    backfilled += count;
  }

  console.log(
    `\n✅ Deactivated ${deactivated} price(s); split a brand off ${backfilled} product(s). Nothing deleted.\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Failed:", err);
  process.exit(1);
});
