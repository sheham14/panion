import type { NormalizedPcProduct } from "@/lib/pricing/adapters/pcexpress";
import type { NormalizedFlyerItem } from "@/lib/pricing/adapters/flipp";

/**
 * Helpers for the weekly scrape jobs (`src/lib/inngest/functions/scrape-prices.ts`).
 *
 * A full run is ~160 searches with 2–6 s of deliberate pacing between them,
 * about ten minutes per store: far past what one serverless call may run. So
 * the jobs fetch in batches, one Inngest step per batch, then match and ingest
 * once over everything. Ingesting per batch would let a weaker match from a
 * later batch replace a stronger one, because each run keeps only the best
 * match per product across the whole fetch.
 */

/**
 * Searches per step. At 2–6 s apart plus the request itself, eight finish in
 * well under a minute, the function limit the Inngest route asks for.
 */
export const TERMS_PER_STEP = 8;

export function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Concatenate batch results, keeping the first copy of each id. */
export function mergeBatches<T>(
  parts: { items: T[]; errors: string[] }[],
  idOf: (item: T) => string,
): { items: T[]; errors: string[] } {
  const byId = new Map<string, T>();
  const errors: string[] = [];
  for (const part of parts) {
    for (const item of part.items) {
      const id = idOf(item);
      if (!byId.has(id)) byId.set(id, item);
    }
    errors.push(...part.errors);
  }
  return { items: [...byId.values()], errors };
}

/**
 * Whether a run failed in substance even though it finished. The adapters
 * record a failed search as an error and carry on (no retry storms), so a
 * rotated API key or a WAF block would otherwise "complete" with a handful of
 * prices and look like success (CLAUDE.md rule 6).
 */
export function mostSearchesFailed(termCount: number, errors: string[]): boolean {
  return termCount > 0 && errors.length > termCount / 2;
}

/**
 * Step results come back as JSON, so a `Date` arrives as a string. Restore
 * the ones the ingest path reads as dates.
 */
const asDate = (v: unknown): Date | null =>
  v === null || v === undefined ? null : new Date(v as string);

/** A record as it comes back from a step: these date fields may be strings. */
type FromJson<T, K extends keyof T> = Omit<T, K> & { [P in K]: unknown };

export function revivePcProducts(
  products: FromJson<NormalizedPcProduct, "saleEndDate">[],
): NormalizedPcProduct[] {
  return products.map((p) => ({ ...p, saleEndDate: asDate(p.saleEndDate) }));
}

export function reviveFlyerItems(
  items: FromJson<NormalizedFlyerItem, "validFrom" | "validTo">[],
): NormalizedFlyerItem[] {
  return items.map((i) => ({ ...i, validFrom: asDate(i.validFrom), validTo: asDate(i.validTo) }));
}
