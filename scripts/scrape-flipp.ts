import { config as loadEnv } from "dotenv";

// Same env precedence as prisma.config.ts and Next.js.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

/**
 * Run one Flipp cycle against whatever DATABASE_URL resolves to.
 *
 *   npm run scrape:flipp            # full term list, production pacing
 *   npm run scrape:flipp -- --fast  # no jitter, for local iteration
 *   npm run scrape:flipp -- --terms milk,bread
 *
 * Deliberately a script rather than only an Inngest job: it lets the adapter be
 * proven against the real endpoint before any cron, deploy, or Inngest Cloud
 * wiring exists.
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
  console.log(`\n▸ Flipp scrape → ${host ?? "(unknown DB)"}\n`);

  // Import after env is loaded, so the Prisma client picks up DATABASE_URL.
  const { runFlippCycle } = await import("@/lib/pricing/run-flipp");

  const started = Date.now();
  const summary = await runFlippCycle({
    verbose: true,
    ...(terms ? { terms } : {}),
    ...(fast ? { delayMs: { min: 0, max: 0 } } : {}),
  });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n─── Summary (${seconds}s) ───`);
  console.log(`  flyer items fetched : ${summary.fetched}`);
  console.log(`  matched to catalogue: ${summary.matched}`);
  console.log(`  discarded unmatched : ${summary.unmatched}`);
  console.log(`  flyers upserted     : ${summary.flyersUpserted}`);
  console.log(`  product images added: ${summary.imagesBackfilled}`);

  for (const [chain, r] of Object.entries(summary.byStore)) {
    console.log(
      `  ${chain.padEnd(22)} ${String(r.accepted).padStart(4)} accepted  ${String(r.updated).padStart(4)} price updates  ${String(r.rejected.length).padStart(3)} rejected`,
    );
  }

  if (summary.errors.length) {
    console.log(`\n  ⚠ ${summary.errors.length} fetch errors:`);
    for (const e of summary.errors.slice(0, 10)) console.log(`    - ${e}`);
  }
  console.log();
}

main()
  .catch((err) => {
    console.error("\n❌ Flipp scrape failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
  });
