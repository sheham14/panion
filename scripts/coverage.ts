import { config as loadEnv } from "dotenv";

/*
 * Local by default, matching `prisma.config.ts` (CLAUDE.md rule 2).
 * `--production` redirects only DATABASE_URL, and refuses to run if `.env`
 * does not resolve to Neon.
 *
 * This is read-only, but it still asks before it looks: the numbers in
 * STATUS.md §1 describe production, and for a long time this script could only
 * reach localhost — so refreshing them meant editing them by hand, and they
 * drifted.
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
 * Catalogue coverage and bad-match report.
 *
 *   npm run coverage
 *   npm run coverage -- --production
 *
 * Read-only. Answers two questions after any scrape:
 *
 *  1. **Coverage** — how many products carry a price at each store, and how many
 *     support a cross-store comparison at all. A store's ceiling is not the
 *     catalogue size: Loblaw private label (No Name, President's Choice) cannot
 *     exist at Sobeys or Walmart, so coverage is reported against the
 *     *addressable* subset rather than the total.
 *
 *  2. **Suspicious spreads** — the same product priced very differently at two
 *     stores is usually a bad match, not a bargain. A Walmart flyer bag of
 *     "Watson Ridge chicken nuggets" was matched to an 800g pack of "Watson
 *     Ridge Chicken Breasts" and showed as a 2.7x saving; this report is what
 *     surfaced it. Since Sobeys and Walmart publish no barcodes, name matching
 *     carries those stores entirely and this class of error will recur.
 */

/** Brands sold only by Loblaw — unreachable at any other chain. */
const LOBLAW_ONLY = [
  "no name",
  "president's choice",
  "presidents choice",
  "pc blue menu",
  "pc black label",
  "life brand",
  "farmer's market",
];

/** Above this ratio between two stores, treat the match as suspect. */
const SUSPICIOUS_RATIO = 1.8;

async function main() {
  // Every ad-hoc script prints its target host on start (rule 2).
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").host;
    } catch {
      return "(unparseable)";
    }
  })();
  console.log(
    `\nDatabase: ${host}${TARGET_PRODUCTION ? "  [--production]" : ""}`,
  );

  const { prisma } = await import("@/lib/prisma");

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      name: true,
      brand: true,
      unitSize: true,
      storeProducts: {
        where: { isActive: true, currentPrice: { not: null } },
        select: {
          currentPrice: true,
          isSale: true,
          storeProductName: true,
          store: { select: { name: true, chain: true } },
        },
      },
    },
  });

  const isLoblawOnly = (b: string | null) =>
    LOBLAW_ONLY.some((x) => (b ?? "").toLowerCase().includes(x));

  const exclusive = products.filter((p) => isLoblawOnly(p.brand));
  const addressable = products.length - exclusive.length;
  const multiStore = products.filter((p) => p.storeProducts.length > 1);

  console.log(`\n─── Coverage ───`);
  console.log(`  catalogue                : ${products.length}`);
  console.log(`  Loblaw-exclusive brands  : ${exclusive.length} (unreachable off-Loblaw)`);
  console.log(`  addressable elsewhere    : ${addressable}`);
  console.log(`  comparable at 2+ stores  : ${multiStore.length}`);

  const byStore = new Map<string, number>();
  for (const p of products)
    for (const sp of p.storeProducts)
      byStore.set(sp.store.name, (byStore.get(sp.store.name) ?? 0) + 1);

  /**
   * A Loblaw banner's denominator is the whole catalogue — it is the only
   * chain that can stock No Name and President's Choice. Measuring it against
   * the addressable subset produced the nonsense "Dominion: 140%".
   */
  const LOBLAW_CHAINS = new Set(["dominion", "no frills"]);
  const chainOf = new Map<string, string>();
  for (const p of products)
    for (const sp of p.storeProducts) chainOf.set(sp.store.name, sp.store.chain);

  console.log(`\n─── Prices per store ───`);
  for (const [store, n] of [...byStore].sort((a, b) => b[1] - a[1])) {
    const loblaw = LOBLAW_CHAINS.has(chainOf.get(store) ?? "");
    const denom = loblaw ? products.length : addressable;
    const pct = ((n / denom) * 100).toFixed(0);
    console.log(
      `  ${store.padEnd(34)} ${String(n).padStart(4)}  (${pct}% of ${loblaw ? "catalogue" : "addressable"})`,
    );
  }

  const suspicious = multiStore
    .map((p) => {
      const prices = p.storeProducts.map((sp) => Number(sp.currentPrice));
      return { p, ratio: Math.max(...prices) / Math.min(...prices) };
    })
    .filter((r) => r.ratio >= SUSPICIOUS_RATIO)
    .sort((a, b) => b.ratio - a.ratio);

  console.log(`\n─── Suspicious spreads (>= ${SUSPICIOUS_RATIO}x) ───`);
  if (!suspicious.length) {
    console.log(`  none`);
  }
  for (const { p, ratio } of suspicious) {
    console.log(`\n  ${p.brand ?? "-"} — ${p.name} (${p.unitSize ?? "?"})  ${ratio.toFixed(1)}x`);
    for (const sp of p.storeProducts) {
      console.log(
        `     ${sp.store.chain.padEnd(12)} $${Number(sp.currentPrice).toFixed(2).padStart(7)}${sp.isSale ? " SALE" : "     "}  as: ${sp.storeProductName ?? "-"}`,
      );
    }
  }
  console.log();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit(0));
