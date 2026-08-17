import { config as loadEnv } from "dotenv";

// Same env precedence as prisma.config.ts and Next.js.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

/**
 * Run one Voilà (Sobeys) cycle against whatever DATABASE_URL resolves to.
 *
 *   npm run scrape:sobeys            # full term list, production pacing
 *   npm run scrape:sobeys -- --fast  # no jitter, for local iteration
 *   npm run scrape:sobeys -- --terms milk,bread
 *
 * Requires VOILA_SESSION_COOKIE — Voilà scopes prices to the session rather
 * than to a query parameter, so without a St. John's session this quietly
 * returns another province's prices. The run aborts if the response contains no
 * Newfoundland dairy brands.
 */
async function main() {
  const args = process.argv.slice(2);
  const fast = args.includes("--fast");

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
  console.log(`\n▸ Voilà (Sobeys) scrape → ${host ?? "(unknown DB)"}\n`);

  const { runVoilaCycle } = await import("@/lib/pricing/run-voila");

  const started = Date.now();
  const summary = await runVoilaCycle({
    verbose: true,
    ...(terms ? { terms } : {}),
    ...(fast ? { delayMs: { min: 0, max: 0 } } : {}),
  });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n─── Summary (${seconds}s) ───`);
  console.log(`  products fetched    : ${summary.fetched}`);
  console.log(`  matched to catalogue: ${summary.matched}`);
  console.log(`  discarded unmatched : ${summary.unmatched}`);

  if (summary.ingest) {
    console.log(
      `  ${summary.ingest.storeName}: ${summary.ingest.accepted} accepted, ${summary.ingest.updated} price updates, ${summary.ingest.rejected.length} rejected`,
    );
  }

  for (const e of summary.errors.slice(0, 10)) console.log(`  ! ${e}`);
}

main()
  .catch((err) => {
    console.error(`\n✖ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  })
  .then(() => process.exit(0));
