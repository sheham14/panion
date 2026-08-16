import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  parsePcExpressResponse,
  normalizePcProduct,
} from "@/lib/pricing/adapters/pcexpress";
import {
  parseFlippResponse,
  normalizeFlippItem,
} from "@/lib/pricing/adapters/flipp";

/**
 * Adapters are tested against **real captured responses**, per
 * PRICING-PIPELINE.md §10. Both endpoints are unofficial and can change shape
 * without notice, so the contract these fixtures encode is the early warning.
 */
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, "../fixtures/pricing", name), "utf-8"),
  );

describe("PC Express adapter", () => {
  const milk = fixture("pcexpress-search-milk.json");
  const cheese = fixture("pcexpress-search-cheese.json");

  it("parses a real search response", () => {
    const products = parsePcExpressResponse(milk);
    expect(products.length).toBeGreaterThan(0);
    const p = products[0];
    expect(p.code).toMatch(/_EA$/);
    expect(p.price).toBeGreaterThan(0);
    expect(typeof p.name).toBe("string");
  });

  it("extracts the UPC, which is the cross-store match key", () => {
    const withUpc = parsePcExpressResponse(milk).find((p) => p.barcode);
    expect(withUpc?.barcode).toMatch(/^\d{8,}$/);
  });

  it("reads a sale, and regularPrice always exceeds the sale price when given", () => {
    const onSale = parsePcExpressResponse(cheese).filter((p) => p.isSale);
    expect(onSale.length).toBeGreaterThan(0);

    // Not every SPECIAL carries a wasPrice — the fixture contains real items
    // priced at a flat promotional price with no advertised "was". So the
    // invariant is conditional: if we do have one, it must be higher.
    for (const p of onSale) {
      if (p.regularPrice !== null) {
        expect(p.regularPrice).toBeGreaterThan(p.price);
      }
    }
    expect(onSale.some((p) => p.regularPrice !== null)).toBe(true);
  });

  it("marks a SPECIAL as on sale even without a wasPrice", () => {
    // expireFinishedSales() handles the missing revert value by falling back to
    // the newest non-sale price in history.
    const flat = parsePcExpressResponse(cheese).find(
      (p) => p.isSale && p.regularPrice === null,
    );
    expect(flat).toBeDefined();
  });

  it("leaves regularPrice null when not on sale", () => {
    const regular = parsePcExpressResponse(milk).filter((p) => !p.isSale);
    for (const p of regular) expect(p.regularPrice).toBeNull();
  });

  it("degrades to an empty list rather than throwing on a shape change", () => {
    expect(parsePcExpressResponse(null)).toEqual([]);
    expect(parsePcExpressResponse({})).toEqual([]);
    expect(parsePcExpressResponse({ results: "not an array" })).toEqual([]);
    expect(parsePcExpressResponse({ results: [null, 42, {}] })).toEqual([]);
  });

  it("drops entries missing a code, name or price", () => {
    expect(normalizePcProduct({ name: "x", prices: { price: { value: 1 } } })).toBeNull();
    expect(normalizePcProduct({ code: "c", prices: { price: { value: 1 } } })).toBeNull();
    expect(normalizePcProduct({ code: "c", name: "x" })).toBeNull();
  });
});

describe("Flipp adapter", () => {
  const milk = fixture("flipp-search-milk.json");

  it("parses a real search response", () => {
    const items = parseFlippResponse(milk);
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.price).toBeGreaterThan(0);
      expect(i.chain).toBe(i.merchantName.toLowerCase());
    }
  });

  it("degrades to an empty list rather than throwing", () => {
    expect(parseFlippResponse(null)).toEqual([]);
    expect(parseFlippResponse({ items: "nope" })).toEqual([]);
  });

  it("drops items missing merchant, name or price", () => {
    expect(normalizeFlippItem({ name: "x", current_price: 1 })).toBeNull();
    expect(normalizeFlippItem({ merchant_name: "m", current_price: 1 })).toBeNull();
    expect(
      normalizeFlippItem({ merchant_name: "m", name: "x", flyer_item_id: 1 }),
    ).toBeNull();
  });

  it("coerces string prices", () => {
    const i = normalizeFlippItem({
      merchant_name: "Sobeys",
      name: "Milk",
      current_price: "4.99",
      flyer_item_id: 123,
    });
    expect(i?.price).toBe(4.99);
  });
});
