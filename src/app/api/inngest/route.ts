import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { purgeDeletedAccounts } from "@/lib/inngest/functions/purge-deleted-accounts";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [purgeDeletedAccounts],
});
