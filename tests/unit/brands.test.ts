import { describe, it, expect } from "vitest";
import { splitLeadingBrand, STORE_BRANDS } from "@/lib/pricing/brands";

const KNOWN = [...STORE_BRANDS.flatMap((s) => s.brands), "Dove", "Simply", "PC"];

describe("splitLeadingBrand", () => {
  it("splits a store brand off a captured Walmart title", () => {
    // The real shape: no brand field, brand inside the title.
    expect(splitLeadingBrand("Great Value Large White Eggs, 12 Count", KNOWN)).toEqual({
      brand: "Great Value",
      name: "Large White Eggs, 12 Count",
    });
  });

  it("is case- and punctuation-insensitive, and keeps the canonical spelling", () => {
    expect(splitLeadingBrand("GREAT VALUE, Salted Butter", KNOWN)).toEqual({
      brand: "Great Value",
      name: "Salted Butter",
    });
    expect(splitLeadingBrand("President's Choice Peanut Butter", KNOWN)?.brand).toBe(
      "President's Choice",
    );
  });

  it("prefers the longest brand", () => {
    expect(splitLeadingBrand("PC Blue Menu Steel Cut Oats", KNOWN)?.brand).toBe("PC Blue Menu");
    expect(splitLeadingBrand("Sensations by Compliments Truffle Oil", KNOWN)?.brand).toBe(
      "Sensations by Compliments",
    );
  });

  it("only matches whole leading words", () => {
    expect(splitLeadingBrand("Dovetail Aged Cheddar", KNOWN)).toBeNull();
    expect(splitLeadingBrand("Large Eggs by Great Value", KNOWN)).toBeNull();
  });

  it("does not split when nothing would be left", () => {
    expect(splitLeadingBrand("Great Value", KNOWN)).toBeNull();
  });

  it("returns null when no known brand leads the title", () => {
    expect(splitLeadingBrand("Newfoundland Eggs Large Brown", KNOWN)).toBeNull();
  });
});
