import { config as loadEnv } from "dotenv";

/*
 * Local by default, matching `prisma.config.ts` (CLAUDE.md rule 2).
 * `--production` redirects only DATABASE_URL, and refuses to run if `.env`
 * does not resolve to Neon.
 *
 * This one writes prices, so it announces its target loudly below. It only
 * ever upserts: nothing in the ingest path deletes or deactivates a row, so a
 * narrow `--terms` run leaves every product it did not fetch untouched rather
 * than treating absence as "gone" (CLAUDE.md rule 1).
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
  console.log(
    `\n▸ PC Express (Dominion) scrape → ${host ?? "(unknown DB)"}${TARGET_PRODUCTION ? "  [--production]" : ""}\n`,
  );

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
