import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { purgeDeletedAccounts } from "@/lib/inngest/functions/purge-deleted-accounts";
import { expireSales } from "@/lib/inngest/functions/expire-sales";
import { scrapeFlyers, scrapeDominion } from "@/lib/inngest/functions/scrape-prices";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [purgeDeletedAccounts, expireSales, scrapeFlyers, scrapeDominion],
});
