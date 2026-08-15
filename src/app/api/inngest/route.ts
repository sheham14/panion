import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { purgeDeletedAccounts } from "@/lib/inngest/functions/purge-deleted-accounts";
import { expireSales } from "@/lib/inngest/functions/expire-sales";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [purgeDeletedAccounts, expireSales],
});
