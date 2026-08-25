/**
 * Parse a capture payload produced by the browser bookmarklet.
 *
 * The division of labour is deliberate: **the bookmarklet is dumb and the
 * parser is smart.** The bookmarklet locates a product array on the page and
 * copies it verbatim; every decision about what counts as a name, a price or a
 * size happens here. That way a retailer changing their payload shape is fixed
 * by editing this file, not by the user reinstalling a bookmark.
 *
 * Nothing here fetches anything. The capture came from a page a person opened
 * in their own browser, which is the whole point — see DATA-SOURCING.md.
 */

export type CaptureSource = "walmart" | "voila" | "generic";

/** What the bookmarklet puts on the clipboard. */
export type CapturePayload = {
  source?: string;
  url?: string;
  capturedAt?: string;
  /** Raw product-ish objects, exactly as they appeared on the page. */
  items?: unknown[];
  /** Present instead of `items` when the bookmarklet found nothing. */
  diagnostic?: unknown;
};

/** One capture normalized into something the ingest endpoint accepts. */
export type CapturedItem = {
  name: string;
  brand: string | null;
  size: string | null;
  price: number;
  isSale: boolean;
  regularPrice: number | null;
  storeSku: string | null;
};

export type ParseResult = {
  source: CaptureSource;
  url: string | null;
  items: CapturedItem[];
  /** Entries that looked like products but had no usable price or name. */
  skipped: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Coerce a price from the several shapes retailers use.
 *
 * Seen in the wild: a number, a string, `{amount:"5.99"}` (Voilà), and
 * `{price: 5.99}` / `{priceString:"$5.99"}` (Walmart). Currency symbols and
 * thousands separators are stripped.
 */
export function coercePrice(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;

  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  if (isRecord(v)) {
    for (const key of ["amount", "price", "value", "priceString", "currentPrice"]) {
      const found = coercePrice(v[key]);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * Extract a price from human-readable display text — the DOM tier of the
 * bookmarklet copies a tile's price block verbatim.
 *
 * The visual price renders dollars and cents as separate spans, which
 * `textContent` concatenates into a mangled figure: a real Walmart tile
 * reads `"$498current price $4.9826¢/100ml"` for a $4.98 product. The
 * screen-reader label (`current price $4.98`) is therefore the trusted
 * reading; a bare dollar figure is only believed when it carries an
 * explicit decimal point. Cents-only prices (`"97 ¢"`) are tried last.
 */
export function extractDisplayPrice(text: string): number | null {
  const positive = (s: string): number | null => {
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const labeled = text.match(/current\s*price\s*\$\s*([0-9,]+(?:\.\d{1,2})?)/i);
  if (labeled) return positive(labeled[1]);
  const withCents = text.match(/\$\s*([0-9,]+\.\d{2})/);
  if (withCents) return positive(withCents[1]);
  const bare = text.match(/\$\s*([0-9,]+)/);
  if (bare) return positive(bare[1]);
  const cents = text.match(/(\d{1,3}(?:\.\d+)?)\s*¢/);
  if (cents) {
    const n = Number(cents[1]) / 100;
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** First non-empty string among the given keys. */
function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

const NAME_KEYS = ["name", "title", "productName", "displayName", "description"];
const BRAND_KEYS = ["brand", "brandName", "manufacturerName"];
const SIZE_KEYS = [
  "packSizeDescription", "packageSize", "size", "unitSize",
  "sizeDescription", "weight",
];
const SKU_KEYS = [
  "usItemId", "productId", "id", "sku", "retailerProductId", "itemId",
];
const PRICE_KEYS = [
  "price", "currentPrice", "priceInfo", "linePrice", "offerPrice", "amount",
];
const WAS_PRICE_KEYS = [
  "wasPrice", "listPrice", "originalPrice", "regularPrice", "strikethroughPrice",
];

/**
 * Normalize one raw product object.
 *
 * Key names are tried across retailers rather than branching per source: the
 * shapes overlap heavily, and a single tolerant reader is less likely to break
 * silently than three strict ones. An entry with no name or no price is not a
 * product — it is a banner, a filter, or an ad slot — and is dropped.
 */
export function normalizeCaptured(raw: unknown): CapturedItem | null {
  if (!isRecord(raw)) return null;

  const name = pickString(raw, NAME_KEYS);
  if (!name || name.length < 2) return null;

  let price: number | null = null;
  for (const k of PRICE_KEYS) {
    price = coercePrice(raw[k]);
    if (price !== null) break;
  }

  // DOM-tier captures carry the tile's price block as raw display text.
  const priceText = typeof raw.priceText === "string" ? raw.priceText : null;
  if (price === null && priceText) price = extractDisplayPrice(priceText);
  if (price === null) return null;

  let regularPrice: number | null = null;
  for (const k of WAS_PRICE_KEYS) {
    regularPrice = coercePrice(raw[k]);
    if (regularPrice !== null) break;
  }
  if (regularPrice === null && priceText) {
    const was = priceText.match(/was\s*\$\s*([0-9,]+(?:\.\d{1,2})?)/i);
    if (was) {
      const n = Number(was[1].replace(/,/g, ""));
      regularPrice = Number.isFinite(n) && n > 0 ? n : null;
    }
  }

  // A "was" price that isn't actually higher is not a sale — some payloads
  // echo the current price into the list-price field.
  const isSale = regularPrice !== null && regularPrice > price;

  return {
    name,
    brand: pickString(raw, BRAND_KEYS),
    size: pickString(raw, SIZE_KEYS),
    price,
    isSale,
    regularPrice: isSale ? regularPrice : null,
    storeSku: pickString(raw, SKU_KEYS),
  };
}

const SOURCES: CaptureSource[] = ["walmart", "voila", "generic"];

export function parseCapture(input: unknown): ParseResult {
  const payload = (isRecord(input) ? input : {}) as CapturePayload;

  const declared = typeof payload.source === "string" ? payload.source : "";
  const source: CaptureSource = SOURCES.includes(declared as CaptureSource)
    ? (declared as CaptureSource)
    : "generic";

  const raw = Array.isArray(payload.items) ? payload.items : [];

  const items: CapturedItem[] = [];
  let skipped = 0;
  // Retailers repeat the same product across carousels and "sponsored" slots.
  const seen = new Set<string>();

  for (const entry of raw) {
    const item = normalizeCaptured(entry);
    if (!item) {
      skipped += 1;
      continue;
    }
    const key = `${item.storeSku ?? ""}::${item.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  return {
    source,
    url: typeof payload.url === "string" ? payload.url : null,
    items,
    skipped,
  };
}

/**
 * The string the ingest endpoint matches on.
 *
 * Brand and size are prepended for the same reason `run-pcexpress.ts` does it:
 * without a size on the item side, `parseSize()` finds nothing, the size guard
 * is skipped entirely, and a 2L product happily matches a 1L SKU. With no
 * barcode available from either Walmart or Voilà, this string is the *only*
 * identity a capture carries.
 */
export function matchNameFor(item: CapturedItem): string {
  return [item.brand, item.name, item.size].filter(Boolean).join(" ");
}
