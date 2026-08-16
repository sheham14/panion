import type { PriceObservation } from "@/lib/pricing/types";

/**
 * PC Express adapter — Loblaw's platform, which serves Dominion and No Frills.
 *
 * Unlike Flipp (sale prices only), this returns **regular shelf prices** plus
 * UPCs, package sizes and product photography — see PRICING-PIPELINE.md §6.1,
 * which nominates it as the first scraper to build for exactly these reasons.
 *
 * Two things verified against the live API before this was written:
 *
 *  - The storefront HTML is Akamai-protected and cannot be fetched
 *    programmatically, but `api.pcexpress.ca` itself is not. Only `x-apikey`
 *    and `Content-Type` are actually required; the rest of the browser's
 *    headers are noise.
 *  - Prices are identical across NL store IDs (0924 / 0935 / 0906 all returned
 *    the same values), i.e. Loblaw prices at the **banner** level here. That
 *    matches the chain-level decision in §12.1, so one store id per banner is
 *    sufficient.
 */

const API_BASE = "https://api.pcexpress.ca/pcx-bff/api/v1";

/**
 * Banner → representative NL store id.
 *
 * Dominion 0924 is Stavanger Drive, St. John's. No Frills shares the platform;
 * its store id needs confirming before that banner is enabled.
 */
export const PC_EXPRESS_BANNERS = {
  dominion: { banner: "dominion", storeId: "0924" },
} as const;

export type PcExpressBanner = keyof typeof PC_EXPRESS_BANNERS;

/** Subset of the response we rely on. Everything optional — external API. */
export type PcExpressProduct = {
  code?: string;
  name?: string;
  brand?: string;
  packageSize?: string;
  articleNumber?: string;
  upcs?: string[];
  link?: string;
  stockStatus?: string;
  prices?: {
    price?: { value?: number | null; type?: string | null } | null;
    wasPrice?: { value?: number | null } | null;
  } | null;
  badges?: {
    dealBadge?: { type?: string | null; expiryDate?: string | null } | null;
  } | null;
  imageAssets?: {
    imageUrl?: string | null;
    largeUrl?: string | null;
    mediumUrl?: string | null;
    smallUrl?: string | null;
    thumbnailUrl?: string | null;
  }[];
};

/** A PC Express product normalized to what the pipeline cares about. */
export type NormalizedPcProduct = {
  /** Loblaw product code, e.g. "20074415003_EA" — goes in storeSku. */
  code: string;
  /** Display name as the store words it. */
  name: string;
  brand: string | null;
  packageSize: string | null;
  /**
   * UPC. This is a manufacturer-assigned GS1 identity, so it is the *same*
   * number at every retailer for a national brand — which is what makes it a
   * reliable cross-store match key. Store brands (No Name = Loblaw prefix
   * 060383) carry the retailer's prefix and correctly never match elsewhere.
   */
  barcode: string | null;
  price: number;
  /** Set only when the item is on special. */
  regularPrice: number | null;
  isSale: boolean;
  saleEndDate: Date | null;
  imageUrl: string | null;
  productUrl: string | null;
  inStock: boolean;
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const toDate = (v: unknown): Date | null => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Best available image, largest first. */
function pickImage(assets: PcExpressProduct["imageAssets"]): string | null {
  const a = assets?.[0];
  if (!a) return null;
  return a.largeUrl || a.imageUrl || a.mediumUrl || a.smallUrl || a.thumbnailUrl || null;
}

export function normalizePcProduct(
  raw: PcExpressProduct,
): NormalizedPcProduct | null {
  const code = raw.code?.trim();
  const name = raw.name?.trim();
  const price = num(raw.prices?.price?.value);

  if (!code || !name || price === null) return null;

  // `type: "SPECIAL"` plus a non-null wasPrice is how a sale presents.
  const wasPrice = num(raw.prices?.wasPrice?.value);
  const isSale =
    raw.prices?.price?.type === "SPECIAL" || (wasPrice !== null && wasPrice > price);

  return {
    code,
    name,
    brand: raw.brand?.trim() || null,
    packageSize: raw.packageSize?.trim() || null,
    barcode: raw.upcs?.[0]?.trim() || null,
    price,
    regularPrice: isSale ? wasPrice : null,
    isSale,
    saleEndDate: isSale ? toDate(raw.badges?.dealBadge?.expiryDate) : null,
    imageUrl: pickImage(raw.imageAssets),
    productUrl: raw.link ? `https://www.newfoundlandgrocerystores.ca${raw.link}` : null,
    inStock: (raw.stockStatus ?? "OK") === "OK",
  };
}

/** Parse a search response, dropping unusable entries. */
export function parsePcExpressResponse(body: unknown): NormalizedPcProduct[] {
  if (!body || typeof body !== "object") return [];
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((r): r is PcExpressProduct => !!r && typeof r === "object")
    .map(normalizePcProduct)
    .filter((p): p is NormalizedPcProduct => p !== null);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) =>
  min + Math.floor(Math.random() * (max - min));

export type PcExpressFetchOptions = {
  banner: PcExpressBanner;
  terms: string[];
  apiKey: string;
  /** Results per term. The API caps around 48. */
  pageSize?: number;
  fetchImpl?: typeof fetch;
  /** §3 requires randomized pacing; tests pass {min:0,max:0}. */
  delayMs?: { min: number; max: number };
};

/**
 * Fetch and normalize products for a banner, deduplicated by product code.
 *
 * Search-term driven because there is no "list the whole catalogue" endpoint,
 * and §1 argues for a well-mapped basket over an exhaustive one anyway.
 */
export async function fetchPcExpressProducts(
  opts: PcExpressFetchOptions,
): Promise<{ products: NormalizedPcProduct[]; errors: string[] }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const delay = opts.delayMs ?? { min: 2000, max: 6000 };
  const { banner, storeId } = PC_EXPRESS_BANNERS[opts.banner];

  const byCode = new Map<string, NormalizedPcProduct>();
  const errors: string[] = [];

  for (const [index, term] of opts.terms.entries()) {
    if (index > 0) await sleep(jitter(delay.min, delay.max));

    try {
      const res = await doFetch(`${API_BASE}/products/search`, {
        method: "POST",
        headers: {
          // Verified: these two are the only required headers.
          "x-apikey": opts.apiKey,
          "Content-Type": "application/json",
          // Sent anyway so requests look like the site's own.
          "site-banner": banner,
          "business-user-agent": "PCXWEB",
          Accept: "application/json, text/plain, */*",
        },
        body: JSON.stringify({
          pagination: { from: 0, size: opts.pageSize ?? 48 },
          banner,
          cartId: "",
          lang: "en",
          storeId,
          pcId: "",
          term,
          userData: { domainUserId: "", sessionId: "" },
        }),
      });

      if (!res.ok) {
        // §3.4: fail quietly, never retry-storm. A 401 means the key rotated.
        errors.push(
          `"${term}": HTTP ${res.status}${res.status === 401 ? " (PC_EXPRESS_API_KEY may have rotated)" : ""}`,
        );
        continue;
      }

      for (const p of parsePcExpressResponse(await res.json())) {
        byCode.set(p.code, p);
      }
    } catch (err) {
      errors.push(
        `"${term}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { products: [...byCode.values()], errors };
}

/** Turn matched products into observations for the ingestion writer. */
export function toObservations(
  matches: { product: NormalizedPcProduct; storeId: string; productId: string }[],
  observedAt: Date,
): PriceObservation[] {
  return matches.map(({ product, storeId, productId }) => ({
    storeId,
    productId,
    price: product.price,
    isSale: product.isSale,
    regularPrice: product.regularPrice,
    saleEndDate: product.saleEndDate,
    source: "scraper",
    observedAt,
    storeProductName: product.name,
    storeSku: product.code,
  }));
}
