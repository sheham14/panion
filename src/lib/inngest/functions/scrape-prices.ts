import { inngest } from "@/lib/inngest/client";
import { runFlippCycle } from "@/lib/pricing/run-flipp";
import { runPcExpressCycle } from "@/lib/pricing/run-pcexpress";

/**
 * Weekly price refresh, staggered per PRICING-PIPELINE.md §9.
 *
 * NL flyers flip on Thursdays, so both jobs run Thursday morning — flyers
 * first, then the catalogue an hour later so the two never contend for the
 * same rate-limit budget (§3.2: don't run all stores simultaneously).
 *
 * Both honour the SCRAPERS_ENABLED kill switch (§3.6).
 */

const scrapersDisabled = () => process.env.SCRAPERS_ENABLED === "false";

/** Flipp — sale prices across every store, plus product imagery. */
export const scrapeFlyers = inngest.createFunction(
  {
    id: "pricing-scrape-flyers",
    name: "Weekly flyer scrape (Flipp)",
    triggers: [{ cron: "0 9 * * 4" }], // Thu 09:00 UTC ≈ 06:30 NDT
  },
  async ({ step }) => {
    if (scrapersDisabled()) return { skipped: "SCRAPERS_ENABLED=false" };

    return await step.run("flipp-cycle", () => runFlippCycle());
  },
);

/** PC Express — regular shelf prices for the Loblaw banners. */
export const scrapeDominion = inngest.createFunction(
  {
    id: "pricing-scrape-dominion",
    name: "Weekly catalogue scrape (Dominion / PC Express)",
    triggers: [{ cron: "0 10 * * 4" }], // an hour after the flyer job
  },
  async ({ step }) => {
    if (scrapersDisabled()) return { skipped: "SCRAPERS_ENABLED=false" };

    return await step.run("pcexpress-cycle", () =>
      runPcExpressCycle({ banner: "dominion" }),
    );
  },
);
