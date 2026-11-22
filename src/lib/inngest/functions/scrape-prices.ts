import { NonRetriableError } from "inngest";
import { inngest } from "@/lib/inngest/client";
import { notifyOwner } from "@/lib/notify-owner";
import { ALL_CATALOGUE_TERMS } from "@/lib/pricing/catalogue-terms";
import { fetchFlyerItems } from "@/lib/pricing/adapters/flipp";
import { fetchPcExpressProducts } from "@/lib/pricing/adapters/pcexpress";
import { fetchVoilaProducts, looksRegionScoped } from "@/lib/pricing/adapters/voila";
import { DEFAULT_SEARCH_TERMS as FLIPP_TERMS, ST_JOHNS_POSTAL_CODE, runFlippCycle } from "@/lib/pricing/run-flipp";
import { runPcExpressCycle } from "@/lib/pricing/run-pcexpress";
import { runVoilaCycle } from "@/lib/pricing/run-voila";
import { prisma } from "@/lib/prisma";
import {
  TERMS_PER_STEP,
  batches,
  mergeBatches,
  mostSearchesFailed,
  reviveFlyerItems,
  revivePcProducts,
} from "@/lib/pricing/weekly-scrape";

/**
 * The weekly price refresh (owner's decision, 2026-11-21): Flipp flyers, then
 * Dominion (PC Express API), then Sobeys (Voilà API), Thursday mornings when
 * NL flyers flip, an hour apart so they never run at once.
 *
 * Each job fetches in batches, one step per batch, then matches and ingests
 * once (see `weekly-scrape.ts` for why). The rules every job keeps:
 *
 *  - `retries: 0`. A retried fetch hits the retailer again, and a retried
 *    ingest would append the same observations to price history twice. A
 *    failed week is reported and waits for the next one.
 *  - One run at a time per job.
 *  - A run where most searches failed is a failure, not a thin success.
 *  - Any failure emails the owner, because a scrape that stops silently is
 *    how prices went three months stale in 2026.
 *  - `SCRAPERS_ENABLED=false` skips every job (the kill switch).
 */

const scrapersDisabled = () => process.env.SCRAPERS_ENABLED === "false";

function reportFailure(job: string, hint: string) {
  return async ({ error }: { error: Error }) => {
    await notifyOwner(
      `Panion: the weekly ${job} scrape failed`,
      `The ${job} price scrape failed and wrote nothing.\n\n${error.message}\n\n${hint}\n\nDetails are in the Inngest dashboard.`,
    );
  };
}

/** Flipp: sale prices across every store, plus product imagery. */
export const scrapeFlyers = inngest.createFunction(
  {
    id: "pricing-scrape-flyers",
    name: "Weekly flyer scrape (Flipp)",
    triggers: [{ cron: "0 9 * * 4" }], // Thu 09:00 UTC ≈ 06:30 NDT
    retries: 0,
    concurrency: { limit: 1 },
    onFailure: reportFailure("Flipp flyer", "Flipp may have changed its API."),
  },
  async ({ step }) => {
    if (scrapersDisabled()) return { skipped: "SCRAPERS_ENABLED=false" };

    const stores = await step.run("load-chains", () =>
      prisma.store.findMany({ where: { isActive: true }, select: { chain: true } }),
    );
    const chains = stores.map((s) => s.chain.toLowerCase());

    const parts = [];
    for (const [i, terms] of batches(FLIPP_TERMS, TERMS_PER_STEP).entries()) {
      parts.push(
        await step.run(`fetch-${i}`, () =>
          fetchFlyerItems({ postalCode: ST_JOHNS_POSTAL_CODE, terms, chains }),
        ),
      );
    }
    const { items, errors } = mergeBatches(parts, (item) => item.flyerItemId);
    if (mostSearchesFailed(FLIPP_TERMS.length, errors)) {
      throw new NonRetriableError(
        `${errors.length} of ${FLIPP_TERMS.length} Flipp searches failed: ${errors.slice(0, 3).join("; ")}`,
      );
    }

    return await step.run("match-and-ingest", () =>
      runFlippCycle({ fetched: { items: reviveFlyerItems(items), errors } }),
    );
  },
);

/** Dominion (PC Express): regular shelf prices. */
export const scrapeDominion = inngest.createFunction(
  {
    id: "pricing-scrape-dominion",
    name: "Weekly catalogue scrape (Dominion / PC Express)",
    triggers: [{ cron: "0 10 * * 4" }], // an hour after the flyer job
    retries: 0,
    concurrency: { limit: 1 },
    onFailure: reportFailure(
      "Dominion",
      "If every search failed, PC_EXPRESS_API_KEY has probably rotated: read the new x-apikey from newfoundlandgrocerystores.ca (see .env.example) and update it on Vercel.",
    ),
  },
  async ({ step }) => {
    if (scrapersDisabled()) return { skipped: "SCRAPERS_ENABLED=false" };
    const apiKey = process.env.PC_EXPRESS_API_KEY;
    if (!apiKey) throw new NonRetriableError("PC_EXPRESS_API_KEY is not set on Vercel.");

    // The full catalogue list, as Sobeys uses: the catalogue was built from
    // it, and the 44-term default left ~186 Dominion rows unrefreshed.
    const terms = ALL_CATALOGUE_TERMS;
    const parts = [];
    for (const [i, batch] of batches(terms, TERMS_PER_STEP).entries()) {
      parts.push(
        await step.run(`fetch-${i}`, async () => {
          const r = await fetchPcExpressProducts({ banner: "dominion", terms: batch, apiKey });
          return { items: r.products, errors: r.errors };
        }),
      );
    }
    const { items, errors } = mergeBatches(parts, (p) => p.code);
    if (mostSearchesFailed(terms.length, errors)) {
      throw new NonRetriableError(
        `${errors.length} of ${terms.length} Dominion searches failed: ${errors.slice(0, 3).join("; ")}`,
      );
    }

    return await step.run("match-and-ingest", () =>
      runPcExpressCycle({
        banner: "dominion",
        fetched: { products: revivePcProducts(items), errors },
        // Unattended runs only price. Writing barcodes and retailer image
        // URLs onto products stays a deliberate, attended step.
        backfillCatalogue: false,
      }),
    );
  },
);

/** Sobeys (Voilà): regular and promo prices, scoped by a St. John's session. */
export const scrapeSobeys = inngest.createFunction(
  {
    id: "pricing-scrape-sobeys",
    name: "Weekly catalogue scrape (Sobeys / Voilà)",
    triggers: [{ cron: "0 11 * * 4" }], // an hour after Dominion
    retries: 0,
    concurrency: { limit: 1 },
    onFailure: reportFailure(
      "Sobeys",
      "Most likely VOILA_SESSION_COOKIE has expired. Capture a fresh one (logged out, St. John's store selected; see .env.example) and update it on Vercel.",
    ),
  },
  async ({ step }) => {
    if (scrapersDisabled()) return { skipped: "SCRAPERS_ENABLED=false" };
    const sessionCookie = process.env.VOILA_SESSION_COOKIE;
    if (!sessionCookie) throw new NonRetriableError("VOILA_SESSION_COOKIE is not set on Vercel.");

    // One dairy search first. An expired session answers 200 for another
    // province, so check the region before making 160 more requests with it.
    const first = await step.run("region-check", async () => {
      const r = await fetchVoilaProducts({ terms: ["milk"], sessionCookie });
      return { items: r.products, errors: r.errors };
    });
    if (!looksRegionScoped(first.items)) {
      throw new NonRetriableError(
        "Voilà returned no Newfoundland dairy brands for \"milk\": VOILA_SESSION_COOKIE is no longer scoped to St. John's.",
      );
    }

    const terms = ALL_CATALOGUE_TERMS.filter((t) => t !== "milk");
    const parts = [first];
    for (const [i, batch] of batches(terms, TERMS_PER_STEP).entries()) {
      parts.push(
        await step.run(`fetch-${i}`, async () => {
          const r = await fetchVoilaProducts({ terms: batch, sessionCookie });
          return { items: r.products, errors: r.errors };
        }),
      );
    }
    const { items, errors } = mergeBatches(parts, (p) => p.productId);
    if (mostSearchesFailed(terms.length + 1, errors)) {
      throw new NonRetriableError(
        `${errors.length} of ${terms.length + 1} Sobeys searches failed: ${errors.slice(0, 3).join("; ")}`,
      );
    }

    // runVoilaCycle repeats the region check over everything fetched.
    return await step.run("match-and-ingest", () =>
      runVoilaCycle({ fetched: { products: items, errors } }),
    );
  },
);
