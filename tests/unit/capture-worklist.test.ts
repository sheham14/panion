import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { searchTermFor, searchUrlFor, isLoblawOnly } from "@/lib/capture/worklist";

/**
 * The worklist tells a person which searches are worth running. Getting it
 * wrong wastes a whole capture session, which is exactly what happened once:
 * it offered the harvest's generic personal-care terms ("body wash", "lotion")
 * while the catalogue actually held 27 shampoos, so a Walmart capture returned
 * 48 products and resolved none of them.
 */

describe("searchTermFor", () => {
  it("reads an equivalence group as something a shopper would type", () => {
    expect(searchTermFor("moisturizing-shampoo", "personal_care")).toBe("moisturizing shampoo");
    expect(searchTermFor("everything-bagel", "bakery_bread")).toBe("everything bagel");
    expect(searchTermFor("penne-rigate-pasta", "pantry_dry_goods")).toBe("penne rigate pasta");
  });

  it("falls back to the category when a product has no group", () => {
    expect(searchTermFor(null, "pantry_dry_goods")).toBe("pantry dry goods");
    expect(searchTermFor(null, null)).toBe("other");
  });
});

describe("searchUrlFor", () => {
  it("builds a search on the retailer's own site", () => {
    expect(searchUrlFor("walmart", "moisturizing shampoo")).toBe(
      "https://www.walmart.ca/en/search?q=moisturizing%20shampoo",
    );
    expect(searchUrlFor("sobeys", "white bread")).toBe(
      "https://voila.ca/search?q=white%20bread",
    );
  });

  it("returns null for a chain with no known search URL", () => {
    // Colemans and Costco have no capture path yet; a dead link would be worse
    // than none.
    expect(searchUrlFor("colemans", "milk")).toBeNull();
    expect(searchUrlFor("costco", "milk")).toBeNull();
  });
});

describe("isLoblawOnly", () => {
  it("recognises private label that cannot be stocked elsewhere", () => {
    expect(isLoblawOnly("No Name")).toBe(true);
    expect(isLoblawOnly("President's Choice")).toBe(true);
    expect(isLoblawOnly("Dempster's")).toBe(false);
    expect(isLoblawOnly(null)).toBe(false);
  });
});

describe("worklist source", () => {
  it("derives terms from the catalogue, never from the harvest term list", () => {
    // CATALOGUE_TERMS is what was searched to BUILD the catalogue. The harvest
    // keeps only the best-scoring comparable groups, so those terms describe
    // aisles Panion may hold nothing from. Reintroducing that import is the
    // exact regression that cost a capture session.
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/capture/worklist.ts"),
      "utf-8",
    );
    expect(src).not.toContain("catalogue-terms");
    expect(src).not.toContain("CATALOGUE_TERMS");
  });
});
