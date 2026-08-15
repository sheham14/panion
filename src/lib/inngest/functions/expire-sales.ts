import { inngest } from "@/lib/inngest/client";
import { expireFinishedSales } from "@/lib/pricing/ingest";

/**
 * Clear sale flags whose end date has passed.
 *
 * PRICING-PIPELINE.md §7.3 singles this out as the bug class to be most careful
 * about: a sale price still showing after the flyer expired is the fastest way
 * to lose user trust. Flyers flip Thursdays in NL, so this runs daily to catch
 * the boundary regardless of when a given flyer ends.
 */
export const expireSales = inngest.createFunction(
  {
    id: "pricing-expire-sales",
    name: "Clear expired sale prices",
    triggers: [{ cron: "30 4 * * *" }], // 04:30 UTC ≈ 02:00 NDT, before morning traffic
  },
  async ({ step }) => {
    const result = await step.run("expire-finished-sales", () =>
      expireFinishedSales(),
    );

    return result;
  },
);
