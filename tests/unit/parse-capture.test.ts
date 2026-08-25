import { describe, it, expect } from "vitest";
import {
  parseCapture,
  normalizeCaptured,
  coercePrice,
  extractDisplayPrice,
  matchNameFor,
} from "@/lib/capture/parse-capture";

/**
 * The parser is deliberately tolerant: it reads captures pasted by hand from
 * several retailers whose payload shapes differ and change without notice.
 * These tests pin the shapes actually seen, plus the failure modes that must
 * degrade quietly rather than throw.
 */

describe("coercePrice", () => {
  it("reads the shapes retailers actually use", () => {
    expect(coercePrice(5.99)).toBe(5.99);
    expect(coercePrice("5.99")).toBe(5.99);
    expect(coercePrice("$5.99")).toBe(5.99);
    expect(coercePrice({ amount: "4.78" })).toBe(4.78); // Voilà
    expect(coercePrice({ price: 4.64 })).toBe(4.64); // Walmart
    expect(coercePrice({ priceString: "$12.49" })).toBe(12.49);
  });

  it("rejects non-prices rather than coercing them to zero", () => {
    expect(coercePrice(null)).toBeNull();
    expect(coercePrice("")).toBeNull();
    expect(coercePrice("free")).toBeNull();
    expect(coercePrice(0)).toBeNull();
    expect(coercePrice(-3)).toBeNull();
    expect(coercePrice({})).toBeNull();
  });
});

describe("extractDisplayPrice", () => {
  // Walmart.ca renders search results client-side, so the DOM tier copies a
  // tile's price block as display text; the current price renders first,
  // before was-prices and cent-denominated unit prices.
  it("trusts the screen-reader label over the mangled visual spans", () => {
    // Real tiles from a live 2026-08-25 capture: the visual price's
    // dollar/cent spans concatenate to "$498" for a $4.98 product.
    expect(extractDisplayPrice("$498current price $4.9826¢/100ml")).toBe(4.98);
    expect(extractDisplayPrice("$477current price $4.77$272.57/100lt")).toBe(4.77);
    expect(extractDisplayPrice("$344current price $3.4434¢/100ml")).toBe(3.44);
  });

  it("reads unlabeled dollar amounts, preferring one with a decimal point", () => {
    expect(extractDisplayPrice("$4.97")).toBe(4.97);
    expect(extractDisplayPrice("current price Now $4.97 Was $5.97")).toBe(4.97);
    expect(extractDisplayPrice("$1,299.00")).toBe(1299);
  });

  it("falls back to cents only when no dollar amount exists", () => {
    expect(extractDisplayPrice("97 ¢")).toBe(0.97);
    expect(extractDisplayPrice("")).toBeNull();
    expect(extractDisplayPrice("Rollback")).toBeNull();
  });
});

describe("normalizeCaptured", () => {
  it("normalizes a DOM-tier Walmart tile with a display-text price", () => {
    const item = normalizeCaptured({
      name: "Great Value 2% Milk, 4 L",
      priceText: "current price Now $5.47, was $6.27, 13.7 ¢/100 ml",
      itemId: "6000203002170",
      link: "https://www.walmart.ca/en/ip/great-value-2-milk/6000203002170",
    });
    expect(item).toMatchObject({
      name: "Great Value 2% Milk, 4 L",
      price: 5.47,
      isSale: true,
      regularPrice: 6.27,
      storeSku: "6000203002170",
    });
  });

  it("does not read a was-only price block as a sale on itself", () => {
    // The first dollar amount is the current price; a was-price equal to it
    // must not register as a sale.
    const item = normalizeCaptured({
      name: "Wonder White Bread",
      priceText: "current price $5.00, was $5.00",
    });
    expect(item?.price).toBe(5.0);
    expect(item?.isSale).toBe(false);
    expect(item?.regularPrice).toBeNull();
  });

  it("normalizes a Walmart-shaped tile", () => {
    const item = normalizeCaptured({
      usItemId: "6000203002170",
      name: "Central Dairies 2% Milk",
      brand: "Central Dairies",
      price: 4.64,
      size: "2 L",
    });
    expect(item).toMatchObject({
      name: "Central Dairies 2% Milk",
      brand: "Central Dairies",
      size: "2 L",
      price: 4.64,
      isSale: false,
      storeSku: "6000203002170",
    });
  });

  it("normalizes a Voilà-shaped product", () => {
    const item = normalizeCaptured({
      retailerProductId: "501329EA",
      name: "Natrel 2% Milk Partly Skimmed 2 L",
      brand: "Natrel",
      packSizeDescription: "2L",
      price: { amount: "5.99", currency: "CAD" },
    });
    expect(item?.price).toBe(5.99);
    expect(item?.size).toBe("2L");
  });

  it("treats a higher was-price as a sale", () => {
    const item = normalizeCaptured({
      name: "Lay's Bar.B.Q Chips",
      price: 3.5,
      wasPrice: 5.29,
    });
    expect(item?.isSale).toBe(true);
    expect(item?.regularPrice).toBe(5.29);
  });

  it("does not treat an equal or lower was-price as a sale", () => {
    // Some payloads echo the current price into the list-price field; calling
    // that a sale would record a regular price as promotional and then block
    // later regular observations via the live-sale rule in ingest.
    const same = normalizeCaptured({
      name: "Wonder White Bread",
      price: 5.0,
      listPrice: 5.0,
    });
    expect(same).not.toBeNull();
    expect(same?.isSale).toBe(false);
    expect(same?.regularPrice).toBeNull();

    const lower = normalizeCaptured({
      name: "Wonder White Bread",
      price: 5.0,
      listPrice: 4.0,
    });
    expect(lower?.isSale).toBe(false);
  });

  it("drops entries that are not products", () => {
    expect(normalizeCaptured({ name: "Sponsored", price: null })).toBeNull();
    expect(normalizeCaptured({ price: 4.99 })).toBeNull(); // no name
    expect(normalizeCaptured({ name: "A", price: 4.99 })).toBeNull(); // too short
    expect(normalizeCaptured(null)).toBeNull();
    expect(normalizeCaptured("nope")).toBeNull();
  });
});

describe("parseCapture", () => {
  const capture = {
    source: "walmart",
    url: "https://www.walmart.ca/en/search?q=milk",
    items: [
      { name: "Central Dairies 2% Milk", brand: "Central Dairies", price: 4.64, size: "2 L", usItemId: "1" },
      { name: "Scotsburn 1% Milk", brand: "Scotsburn", price: 4.76, size: "2 L", usItemId: "2" },
      { name: "Sponsored banner" },
      { name: "Central Dairies 2% Milk", brand: "Central Dairies", price: 4.64, size: "2 L", usItemId: "1" },
    ],
  };

  it("parses, counts skips, and dedupes repeated tiles", () => {
    const r = parseCapture(capture);
    expect(r.source).toBe("walmart");
    expect(r.url).toContain("walmart.ca");
    // 4 entries: 2 unique products, 1 unusable, 1 duplicate.
    expect(r.items).toHaveLength(2);
    expect(r.skipped).toBe(1);
  });

  it("falls back to a generic source rather than trusting the label", () => {
    expect(parseCapture({ source: "evil", items: [] }).source).toBe("generic");
    expect(parseCapture({ items: [] }).source).toBe("generic");
  });

  it("degrades to an empty result rather than throwing", () => {
    expect(parseCapture(null).items).toEqual([]);
    expect(parseCapture({}).items).toEqual([]);
    expect(parseCapture({ items: "nope" }).items).toEqual([]);
    expect(parseCapture({ items: [null, 42] }).items).toEqual([]);
    // A diagnostic payload carries no items and must not throw.
    expect(parseCapture({ diagnostic: { roots: 0 } }).items).toEqual([]);
  });
});

describe("matchNameFor", () => {
  it("folds brand and size into the match string", () => {
    // With no barcode from Walmart or Voilà this string is the only identity a
    // capture carries — and omitting size bypasses the size guard entirely,
    // which is how a 2L product once matched a 1L SKU.
    expect(
      matchNameFor({
        name: "2% Milk",
        brand: "Central Dairies",
        size: "2 L",
        price: 4.64,
        isSale: false,
        regularPrice: null,
        storeSku: null,
      }),
    ).toBe("Central Dairies 2% Milk 2 L");
  });

  it("omits missing parts without leaving gaps", () => {
    expect(
      matchNameFor({
        name: "Bananas",
        brand: null,
        size: null,
        price: 1.99,
        isSale: false,
        regularPrice: null,
        storeSku: null,
      }),
    ).toBe("Bananas");
  });
});
