/**
 * Shared types for the pricing pipeline.
 *
 * The design rule (PRICING-PIPELINE.md §4): **adapters are dumb, the ingestion
 * writer is smart.** An adapter's only job is to produce `PriceObservation[]`.
 * All validation, precedence and DB writing lives in `ingest.ts`, so adding a
 * store means adding one adapter and nothing else.
 */

/**
 * Provenance of a price observation.
 *
 * `PriceHistory.source` is deliberately a String column rather than a Postgres
 * enum, so new values are convention + validation rather than a migration
 * (§5.1). This array is the enforcement point.
 */
export const PRICE_SOURCES = [
  "manual", // typed in via the admin bulk-entry tool
  "scraper", // store e-commerce platform (Dominion / Voilà / Walmart)
  "flyer", // Flipp weekly flyer item
  "crowdsourced", // user PriceReport that passed verification
  "partner", // supplied directly by a partner store (§6.7)
] as const;

export type PriceSource = (typeof PRICE_SOURCES)[number];

export const isPriceSource = (v: unknown): v is PriceSource =>
  typeof v === "string" && (PRICE_SOURCES as readonly string[]).includes(v);

/**
 * One price sighting, from any source.
 *
 * Identifies its target by `(storeId, productId)` rather than by
 * `storeProductId`, because adapters resolve products by SKU or by name match
 * and shouldn't need to know the join-table's primary key.
 */
export type PriceObservation = {
  storeId: string;
  productId: string;
  /** The price a shopper pays today, in CAD. Sale price if one is running. */
  price: number;
  /** True when `price` is a promotional price. */
  isSale?: boolean;
  /** Pre-sale price, when known and `isSale` is true. */
  regularPrice?: number | null;
  /** When the sale ends — for flyers, the flyer's validUntil. */
  saleEndDate?: Date | null;
  source: PriceSource;
  /** When the price was actually seen (not when it was written). */
  observedAt: Date;
  /** User id, for crowdsourced observations only. */
  submittedBy?: string | null;
  /** The store's own name for the product, when the adapter knows it. */
  storeProductName?: string | null;
  /** The store's SKU, when the adapter knows it. */
  storeSku?: string | null;
};

/** Why an observation was refused. Surfaces in ScrapeRun.errorDetails. */
export type RejectionReason =
  | "price_out_of_bounds"
  | "implausible_swing"
  | "unknown_store_product"
  | "invalid_source"
  | "invalid_price";

export type RejectedObservation = {
  observation: PriceObservation;
  reason: RejectionReason;
  detail: string;
};

export type IngestResult = {
  accepted: number;
  rejected: RejectedObservation[];
  /** StoreProduct rows whose currentPrice actually changed. */
  updated: number;
};

/** What every adapter returns. */
export type AdapterResult = {
  observations: PriceObservation[];
  /** Adapter-level problems that aren't per-observation (e.g. a 403). */
  errors: string[];
};

// ── Validation bounds (PRICING-PIPELINE.md §7) ──────────────────────────────

/** Below this, it's a parse error, not a grocery price. */
export const MIN_PRICE = 0.1;
/** Above this, it's a parse error or a non-grocery item. */
export const MAX_PRICE = 500;
/** A jump larger than this vs. the previous observation is treated as a
 *  unit/mapping error (per-kg vs per-item is the classic case). */
export const MAX_PRICE_MULTIPLIER = 5;
export const MIN_PRICE_MULTIPLIER = 0.2;
