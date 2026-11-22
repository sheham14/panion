import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { purgeDeletedAccounts } from "@/lib/inngest/functions/purge-deleted-accounts";
import { expireSales } from "@/lib/inngest/functions/expire-sales";
import {
  scrapeFlyers,
  scrapeDominion,
  scrapeSobeys,
} from "@/lib/inngest/functions/scrape-prices";

// Each Inngest step is its own call to this route. Measured 2026-11-22 on
// Dominion: an 8-search fetch step took 24-37 s and returned at most 162 KB;
// matching 1,794 fetched items against the 851-product catalogue took 3 s, so
// a full week's match-and-ingest should take well under this too.
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [purgeDeletedAccounts, expireSales, scrapeFlyers, scrapeDominion, scrapeSobeys],
});
