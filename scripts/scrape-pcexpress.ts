import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

/**
 * Run one PC Express (Dominion) cycle.
 *
 *   npm run scrape:dominion
 *   npm run scrape:dominion -- --fast
 *   npm run scrape:dominion -- --terms milk,cheese
 *   npm run scrape:dominion -- --no-backfill   # skip barcode/image backfill
 */
async function main() {
  const args = process.argv.slice(2);
  const fast = args.includes("--fast");
  const noBackfill = args.includes("--no-backfill");

  const termsArg = args.find((a) => a.startsWith("--terms"));
  const terms = termsArg
    ? (termsArg.includes("=")
        ? termsArg.split("=")[1]
        : args[args.indexOf(termsArg) + 1]
      )
        ?.split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;

  if (process.env.SCRAPERS_ENABLED === "false") {
    console.log("SCRAPERS_ENABLED=false — kill switch is on, exiting.");
    return;
  }

  const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1];
  console.log(`\n▸ PC Express (Dominion) scrape → ${host ?? "(unknown DB)"}\n`);

  const { runPcExpressCycle } = await import("@/lib/pricing/run-pcexpress");

  const started = Date.now();
  const s = await runPcExpressCycle({
    verbose: true,
    backfillCatalogue: !noBackfill,
    ...(terms ? { terms } : {}),
    ...(fast ? { delayMs: { min: 0, max: 0 } } : {}),
  });

  console.log(`\n─── Summary (${((Date.now() - started) / 1000).toFixed(1)}s) ───`);
  console.log(`  products fetched     : ${s.fetched}`);
  console.log(`  matched by barcode   : ${s.matchedByBarcode}`);
  console.log(`  matched by name      : ${s.matchedByName}`);
  console.log(`  unmatched (discarded): ${s.unmatched}`);
  console.log(`  barcodes backfilled  : ${s.barcodesBackfilled}`);
  console.log(`  images backfilled    : ${s.imagesBackfilled}`);
  if (s.ingest) {
    console.log(
      `  ${s.ingest.storeName}: ${s.ingest.accepted} accepted, ${s.ingest.updated} price updates, ${s.ingest.rejected.length} rejected`,
    );
    for (const r of s.ingest.rejected.slice(0, 5)) {
      console.log(`      reject [${r.reason}] ${r.detail}`);
    }
  }
  if (s.errors.length) {
    console.log(`\n  ⚠ ${s.errors.length} fetch errors:`);
    for (const e of s.errors.slice(0, 10)) console.log(`    - ${e}`);
  }
  console.log();
}

main()
  .catch((err) => {
    console.error("\n❌ PC Express scrape failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
  });
