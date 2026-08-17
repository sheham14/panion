import type { PriceObservation } from "@/lib/pricing/types";

/**
 * Voilà adapter — Sobeys' online grocery platform.
 *
 * Verified against the live API before this was written:
 *
 *  - The product search is a plain anonymous `GET` on
 *    `/api/webproductpagews/v6/product-pages/search`. No API key, no auth.
 *    The path was recovered from Voilà's own `robots.txt`, which names the
 *    search endpoints, and from the client bundle's service map.
 *  - **Region comes from the session, not from a parameter.** Passing
 *    `regionId` on the query string is silently ignored — a bogus value still
 *    returns 200 with unchanged results. Without a region-scoped session the
 *    API answers for a default region: searching "milk" returns Natrel (a
 *    Quebec/Ontario dairy) rather than Central Dairies and Scotsburn, which are
 *    what a St. John's shopper actually sees. Those prices would be wrong for
 *    every user of this app, so `sessionCookie` is **required**, not optional.
 *  - The endpoint that sets a region (`/v2/temporary-delivery-destinations`) is
 *    blocked by AWS WAF — 403 with an empty body, with or without cookies. So
 *    the session has to be established in a real browser and handed in.
 *
 * Richer than PC Express in two ways worth exploiting: it returns `unitPrice`
 * already computed (per 100ml/100g — the same basis `unit-price.ts` ranks on)
 * and a real `categoryPath` taxonomy, which Loblaw never exposes.
 *
 * It returns **no barcode of any kind** — `upc`, `gtin`, `ean` and `sku` are
 * all absent, and `retailerProductId` is a Sobeys-internal code. Matching is
 * therefore name-and-size only, with no exact-join fallback (contrast
 * `pcexpress.ts`, where the UPC makes size confusion structurally impossible).
 */

const API_BASE = "https://voila.ca/api/webproductpagews/v6";

/** AWS WAF 403s undici's default agent string; a browser UA is mandatory. */
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Money as Voilà returns it — an amount string, not a number. */
type VoilaMoney = { amount?: string | null; currency?: string | null };

/** Subset of the response we rely on. Everything optional — external API. */
export type VoilaProduct = {
  productId?: string;
  retailerProductId?: string;
  name?: string;
  brand?: string;
  packSizeDescription?: string;
  price?: VoilaMoney | null;
  /** Present only when the promotion is an actual price cut. */
  promoPrice?: VoilaMoney | null;
  unitPrice?: {
    price?: VoilaMoney | null;
    unitName?: string | null;
  } | null;
  promotions?: { description?: string | null; promoId?: string | null }[];
  available?: boolean;
  categoryPath?: string[];
  image?: { src?: string | null; imageId?: string | null } | null;
};

export type VoilaSearchResponse = {
  productGroups?: {
    type?: string;
    decoratedProducts?: VoilaProduct[];
  }[];
};

/** A Voilà product normalized to what the pipeline cares about. */
export type NormalizedVoilaProduct = {
  /** Voilà's own product UUID — stable, and what `storeSku` records. */
  productId: string;
  /** Sobeys-internal retailer code, e.g. "501329EA". */
  retailerProductId: string | null;
  name: string;
  brand: string | null;
  packageSize: string | null;
  /** Price a shopper pays today — the promo price when one is running. */
  price: number;
  /** Shelf price, set only when a promotion is actually discounting it. */
  regularPrice: number | null;
  isSale: boolean;
  /** Voilà's own unit price, e.g. 0.24 with basis "PER_100ML". */
  unitPrice: { value: number; basis: string } | null;
  imageUrl: string | null;
  inStock: boolean;
  /** e.g. ["Dairy & Eggs", "Milk", "Dairy Milk"] — a real taxonomy. */
  categoryPath: string[];
  /** The search term that surfaced this product. */
  foundVia?: string;
};

/** Voilà sends money as a string; anything unparseable is not a price. */
const money = (m: VoilaMoney | null | undefined): number | null => {
  const raw = m?.amount;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function normalizeVoilaProduct(
  raw: VoilaProduct,
): NormalizedVoilaProduct | null {
  const productId = raw.productId?.trim();
  const name = raw.name?.trim();
  const shelfPrice = money(raw.price);

  if (!productId || !name || shelfPrice === null) return null;

  /**
   * A `promotions[]` entry does **not** imply a price cut.
   *
   * Voilà attaches promotion badges to multibuys and loyalty offers that leave
   * the shelf price untouched, and those arrive with no `promoPrice` at all.
   * Trusting the badge alone would record the regular price as a sale price,
   * which then suppresses later regular observations via the live-sale rule in
   * `shouldReplaceCurrent()`. Only a strictly lower `promoPrice` counts.
   */
  const promo = money(raw.promoPrice);
  const isSale = promo !== null && promo < shelfPrice;

  const unitAmount = money(raw.unitPrice?.price);
  const unitBasis = raw.unitPrice?.unitName?.trim() || null;

  return {
    productId,
    retailerProductId: raw.retailerProductId?.trim() || null,
    name,
    brand: raw.brand?.trim() || null,
    packageSize: raw.packSizeDescription?.trim() || null,
    price: isSale ? promo : shelfPrice,
    regularPrice: isSale ? shelfPrice : null,
    isSale,
    unitPrice:
      unitAmount !== null && unitBasis
        ? { value: unitAmount, basis: unitBasis }
        : null,
    imageUrl: raw.image?.src?.trim() || null,
    // Absent `available` means available; only an explicit false is a stockout.
    inStock: raw.available !== false,
    categoryPath: Array.isArray(raw.categoryPath)
      ? raw.categoryPath.filter((c): c is string => typeof c === "string")
      : [],
  };
}

/**
 * Parse a search response, dropping unusable entries.
 *
 * Results arrive in several `productGroups` (a "personalized" group and one or
 * more "cluster" groups); they are flattened, since the grouping is a
 * merchandising concern rather than a data one.
 */
export function parseVoilaResponse(body: unknown): NormalizedVoilaProduct[] {
  if (!body || typeof body !== "object") return [];
  const groups = (body as VoilaSearchResponse).productGroups;
  if (!Array.isArray(groups)) return [];

  const out: NormalizedVoilaProduct[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    const products = group?.decoratedProducts;
    if (!Array.isArray(products)) continue;
    for (const raw of products) {
      if (!raw || typeof raw !== "object") continue;
      const p = normalizeVoilaProduct(raw);
      // The same product appears in both the personalized and cluster groups.
      if (p && !seen.has(p.productId)) {
        seen.add(p.productId);
        out.push(p);
      }
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) =>
  min + Math.floor(Math.random() * (max - min));

export type VoilaFetchOptions = {
  terms: string[];
  /**
   * A browser session already scoped to the St. John's region — the
   * `global_sid` and `VISITORID` cookies. Required: see the header note.
   */
  sessionCookie: string;
  /** Results per term. */
  pageSize?: number;
  fetchImpl?: typeof fetch;
  /** §3 requires randomized pacing; tests pass {min:0,max:0}. */
  delayMs?: { min: number; max: number };
};

/**
 * Fetch and normalize products for each search term, deduplicated.
 *
 * Search-term driven for the same reason as PC Express: there is no
 * "list the catalogue" endpoint, and a well-mapped basket beats an exhaustive
 * one for comparison purposes.
 */
export async function fetchVoilaProducts(
  opts: VoilaFetchOptions,
): Promise<{ products: NormalizedVoilaProduct[]; errors: string[] }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const delay = opts.delayMs ?? { min: 2000, max: 6000 };

  const byId = new Map<string, NormalizedVoilaProduct>();
  const errors: string[] = [];

  for (const [index, term] of opts.terms.entries()) {
    if (index > 0) await sleep(jitter(delay.min, delay.max));

    const params = new URLSearchParams({
      q: term,
      tag: "web",
      maxProductsToDecorate: String(opts.pageSize ?? 30),
      maxPageSize: String(opts.pageSize ?? 30),
    });

    try {
      const res = await doFetch(`${API_BASE}/product-pages/search?${params}`, {
        headers: {
          Accept: "application/json",
          Cookie: opts.sessionCookie,
          Referer: "https://voila.ca/",
          // Required, not cosmetic: AWS WAF fronts this API and rejects
          // undici's default agent string with a 403 on every request. The
          // same cookie succeeds with a browser UA and fails without one.
          "User-Agent": BROWSER_USER_AGENT,
          "Accept-Language": "en-CA,en;q=0.9",
        },
      });

      if (!res.ok) {
        // §3.4: fail quietly, never retry-storm. 403 is the WAF; a session that
        // has expired usually shows up as a default-region result, not an error.
        errors.push(
          `"${term}": HTTP ${res.status}${
            res.status === 403 ? " (WAF block, or VOILA_SESSION_COOKIE expired)" : ""
          }`,
        );
        continue;
      }

      for (const p of parseVoilaResponse(await res.json())) {
        if (!byId.has(p.productId)) byId.set(p.productId, { ...p, foundVia: term });
      }
    } catch (err) {
      errors.push(
        `"${term}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { products: [...byId.values()], errors };
}

/**
 * Guard against a silently de-scoped session.
 *
 * An expired or region-less session does not error — it returns a perfectly
 * valid 200 for the wrong province, which is the worst possible failure because
 * it looks like success. These dairies are sold in Newfoundland and are absent
 * from the default region, so seeing none of them in a dairy search means the
 * cookie is no longer scoped to St. John's.
 */
export const NL_REGION_MARKER_BRANDS = ["central dairies", "scotsburn"];

export function looksRegionScoped(
  products: NormalizedVoilaProduct[],
): boolean {
  return products.some((p) =>
    NL_REGION_MARKER_BRANDS.includes((p.brand ?? "").toLowerCase()),
  );
}

/** Turn matched products into observations for the ingestion writer. */
export function toObservations(
  matches: {
    product: NormalizedVoilaProduct;
    storeId: string;
    productId: string;
  }[],
  observedAt: Date,
): PriceObservation[] {
  return matches.map(({ product, storeId, productId }) => ({
    storeId,
    productId,
    price: product.price,
    isSale: product.isSale,
    regularPrice: product.regularPrice,
    // Voilà does not publish a promotion end date on the search response.
    saleEndDate: null,
    source: "scraper",
    observedAt,
    storeProductName: product.name,
    storeSku: product.retailerProductId ?? product.productId,
  }));
}
