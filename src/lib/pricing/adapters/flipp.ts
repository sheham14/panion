import type { AdapterResult, PriceObservation } from "@/lib/pricing/types";

/**
 * Flipp flyer adapter — weekly sale prices for every chain at once.
 *
 * Flipp's flyer viewer renders from structured JSON over an unauthenticated
 * backend. One adapter covers Walmart, Dominion, Sobeys *and* the NL
 * independents (Powell's, Colemans, Value Grocer, BidGood's, Clover Farm,
 * Marie's Mini Mart), which is why it's the cheapest source of real data we
 * have — see PRICING-PIPELINE.md §6.5.
 *
 * Caveats that shape the design:
 *  - The endpoint is **unofficial** and can change without notice. Everything
 *    is defensively parsed; a shape change degrades to "no observations",
 *    never a throw.
 *  - It returns **sale prices only**, not a catalogue. It is an overlay on
 *    regular prices, never a replacement.
 *  - Unmatched items are discarded (§6.5) — we only want sale prices for
 *    products we actually track.
 */

const FLIPP_BASE = "https://backflipp.wishabi.com/flipp";

/** Browser-realistic UA: a bare client UA gets fingerprint-blocked. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Raw item shape. Every field optional — this is an unofficial API. */
export type FlippItem = {
  flyer_item_id?: number;
  flyer_id?: number;
  merchant_name?: string;
  merchant_id?: number;
  name?: string;
  current_price?: number | string | null;
  original_price?: number | string | null;
  pre_price_text?: string | null;
  post_price_text?: string | null;
  sale_story?: string | null;
  clean_image_url?: string | null;
  clipping_image_url?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  _L1?: string | null;
  _L2?: string | null;
};

/** A flyer item normalized into something we can reason about. */
export type NormalizedFlyerItem = {
  flyerItemId: string;
  flyerId: string | null;
  merchantName: string;
  /** Lowercased merchant name — the join key against `Store.chain`. */
  chain: string;
  name: string;
  price: number;
  regularPrice: number | null;
  /** Unit qualifier as displayed, e.g. "/100 g". */
  unitText: string | null;
  imageUrl: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  category: string | null;
};

const toNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const toDate = (v: unknown): Date | null => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Normalize one raw item; returns null when it isn't usable. */
export function normalizeFlippItem(raw: FlippItem): NormalizedFlyerItem | null {
  const merchant = raw.merchant_name?.trim();
  const name = raw.name?.trim();
  const price = toNumber(raw.current_price);

  // No merchant, no name, or no price means there's nothing to ingest.
  if (!merchant || !name || price === null) return null;

  const id = raw.flyer_item_id ?? null;
  if (id === null) return null;

  return {
    flyerItemId: String(id),
    flyerId: raw.flyer_id != null ? String(raw.flyer_id) : null,
    merchantName: merchant,
    chain: merchant.toLowerCase(),
    name,
    price,
    regularPrice: toNumber(raw.original_price),
    unitText: raw.post_price_text?.trim() || null,
    imageUrl: raw.clean_image_url || raw.clipping_image_url || null,
    validFrom: toDate(raw.valid_from),
    validTo: toDate(raw.valid_to),
    category: raw._L2 || raw._L1 || null,
  };
}

/** Narrow an unknown response body to its `items` array without casting. */
function extractItems(body: unknown): FlippItem[] {
  if (!body || typeof body !== "object") return [];
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.filter((i): i is FlippItem => !!i && typeof i === "object");
}

/** Parse a whole search response, dropping unusable items. */
export function parseFlippResponse(body: unknown): NormalizedFlyerItem[] {
  return extractItems(body)
    .map(normalizeFlippItem)
    .filter((i): i is NormalizedFlyerItem => i !== null);
}

/** Politeness jitter — §3 requires randomized pacing, never parallel hammering. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (minMs: number, maxMs: number) =>
  minMs + Math.floor(Math.random() * (maxMs - minMs));

export type FlippFetchOptions = {
  postalCode: string;
  /** Search terms — Flipp has no "list everything" endpoint. */
  terms: string[];
  /** Restrict to these lowercased merchant names. Empty = keep all. */
  chains?: string[];
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  /** Pacing between requests, ms. §3: 2-10s in production. */
  delayMs?: { min: number; max: number };
};

/**
 * Fetch and normalize flyer items for a postal code.
 *
 * Deduplicates by `flyer_item_id`, since one item surfaces under several
 * search terms.
 */
export async function fetchFlyerItems(
  opts: FlippFetchOptions,
): Promise<{ items: NormalizedFlyerItem[]; errors: string[] }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const delay = opts.delayMs ?? { min: 2000, max: 6000 };
  const wanted = new Set((opts.chains ?? []).map((c) => c.toLowerCase()));

  const byId = new Map<string, NormalizedFlyerItem>();
  const errors: string[] = [];

  for (const [index, term] of opts.terms.entries()) {
    if (index > 0) await sleep(jitter(delay.min, delay.max));

    const url =
      `${FLIPP_BASE}/items/search?q=${encodeURIComponent(term)}` +
      `&postal_code=${encodeURIComponent(opts.postalCode)}&locale=en-ca`;

    try {
      const res = await doFetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });

      // §3.4: fail quietly and back off — never retry-storm.
      if (!res.ok) {
        errors.push(`"${term}": HTTP ${res.status}`);
        continue;
      }

      for (const item of parseFlippResponse(await res.json())) {
        if (wanted.size > 0 && !wanted.has(item.chain)) continue;
        byId.set(item.flyerItemId, item);
      }
    } catch (err) {
      errors.push(`"${term}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { items: [...byId.values()], errors };
}

/**
 * Turn matched flyer items into observations.
 *
 * Matching is the caller's job — it needs the product catalogue, which the
 * adapter deliberately knows nothing about (§4: adapters are dumb).
 */
export function toObservations(
  matches: { item: NormalizedFlyerItem; storeId: string; productId: string }[],
  observedAt: Date,
): AdapterResult {
  const observations: PriceObservation[] = matches.map(
    ({ item, storeId, productId }) => ({
      storeId,
      productId,
      price: item.price,
      isSale: true, // everything in a flyer is a promotion by definition
      regularPrice: item.regularPrice,
      saleEndDate: item.validTo,
      source: "flyer",
      observedAt,
      storeProductName: item.name,
      storeSku: item.flyerItemId,
    }),
  );

  return { observations, errors: [] };
}
