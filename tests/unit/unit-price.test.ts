import { describe, it, expect } from "vitest";
import {
  getUnitPrice,
  parseQuantity,
  rankByUnitPrice,
  comparableBasis,
} from "@/lib/unit-price";

describe("parseQuantity", () => {
  it("normalizes weight to grams", () => {
    expect(parseQuantity("454 g")).toEqual({ qty: 454, basis: "g" });
    expect(parseQuantity("1.36 kg")).toEqual({ qty: 1360, basis: "g" });
  });

  it("normalizes volume to millilitres", () => {
    expect(parseQuantity("284 ml")).toEqual({ qty: 284, basis: "ml" });
    expect(parseQuantity("2 l")).toEqual({ qty: 2000, basis: "ml" });
  });

  it("expands multipacks", () => {
    // Treating "12x355 ml" as 355ml would make a case of pop look absurdly cheap.
    expect(parseQuantity("12x355.0 ml")).toEqual({ qty: 4260, basis: "ml" });
    expect(parseQuantity("4 x 113 g")).toEqual({ qty: 452, basis: "g" });
  });

  it("treats packs and counts as units", () => {
    expect(parseQuantity("12 pack")).toEqual({ qty: 12, basis: "unit" });
    expect(parseQuantity("6 ct")).toEqual({ qty: 6, basis: "unit" });
  });

  it("returns null when there is no parseable size", () => {
    expect(parseQuantity("per kg")).toEqual({ qty: 1000, basis: "g" });
    expect(parseQuantity("assorted")).toBeNull();
    expect(parseQuantity(null)).toBeNull();
  });
});

describe("getUnitPrice", () => {
  it("computes per-100 for weight and volume", () => {
    expect(getUnitPrice({ price: 2.79, unitSize: "284 ml" })?.value).toBeCloseTo(0.982, 2);
    expect(getUnitPrice({ price: 3.59, unitSize: "796 ml" })?.value).toBeCloseTo(0.451, 2);
  });

  it("reverses the naive sticker-price conclusion", () => {
    // The small can is cheaper on the shelf but worse value — the entire
    // reason group comparison must use unit price.
    const small = getUnitPrice({ price: 2.79, unitSize: "284 ml" })!;
    const large = getUnitPrice({ price: 3.59, unitSize: "796 ml" })!;
    expect(2.79).toBeLessThan(3.59);
    expect(large.value).toBeLessThan(small.value);
  });

  it("prefers the structured columns over free text", () => {
    const p = getUnitPrice({
      price: 5.0,
      unitQuantity: 500,
      unitMeasure: "g",
      unitSize: "nonsense",
    });
    expect(p?.value).toBeCloseTo(1.0, 5);
    expect(p?.basis).toBe("g");
  });

  it("prices counts per single unit", () => {
    const p = getUnitPrice({ price: 4.99, unitSize: "12 pack" });
    expect(p?.basis).toBe("unit");
    expect(p?.value).toBeCloseTo(0.4158, 3);
    expect(p?.label).toContain("each");
  });

  it("returns null rather than a bogus number", () => {
    expect(getUnitPrice({ price: 0, unitSize: "500 g" })).toBeNull();
    expect(getUnitPrice({ price: 5, unitSize: "assorted" })).toBeNull();
    expect(getUnitPrice({ price: null, unitSize: "500 g" })).toBeNull();
  });

  it("labels readably", () => {
    expect(getUnitPrice({ price: 3.59, unitSize: "796 ml" })?.label).toBe("$0.45 / 100ml");
    expect(getUnitPrice({ price: 5.0, unitSize: "500 g" })?.label).toBe("$1.00 / 100g");
  });
});

describe("rankByUnitPrice", () => {
  type Row = { brand: string; price: number; size: string };
  const up = (r: Row) => getUnitPrice({ price: r.price, unitSize: r.size });

  it("ranks the real all-dressed chips group correctly", () => {
    const rows: Row[] = [
      { brand: "Lay's", price: 5.29, size: "220 g" },
      { brand: "No Name", price: 1.99, size: "200 g" },
      { brand: "Ruffles", price: 5.29, size: "200 g" },
      { brand: "President's Choice", price: 2.5, size: "200 g" },
    ];
    const { ranked, basis } = rankByUnitPrice(rows, up);
    expect(basis).toBe("g");
    expect(ranked.map((r) => r.brand)).toEqual([
      "No Name",
      "President's Choice",
      "Lay's",
      "Ruffles",
    ]);
  });

  it("never interleaves weight with volume", () => {
    const rows: Row[] = [
      { brand: "A", price: 2, size: "500 g" },
      { brand: "B", price: 3, size: "500 g" },
      { brand: "C", price: 1, size: "500 ml" }, // cheaper number, wrong basis
    ];
    const { ranked, basis, incomparable } = rankByUnitPrice(rows, up);
    expect(basis).toBe("g");
    expect(ranked.map((r) => r.brand)).toEqual(["A", "B"]);
    expect(incomparable.map((r) => r.brand)).toEqual(["C"]);
  });

  it("sets aside items with no parseable size", () => {
    const rows: Row[] = [
      { brand: "A", price: 2, size: "500 g" },
      { brand: "B", price: 9, size: "assorted" },
    ];
    const { ranked, incomparable } = rankByUnitPrice(rows, up);
    expect(ranked.map((r) => r.brand)).toEqual(["A"]);
    expect(incomparable.map((r) => r.brand)).toEqual(["B"]);
  });
});

describe("comparableBasis", () => {
  it("only allows like-for-like", () => {
    const g = getUnitPrice({ price: 1, unitSize: "100 g" })!;
    const ml = getUnitPrice({ price: 1, unitSize: "100 ml" })!;
    expect(comparableBasis(g, g)).toBe(true);
    expect(comparableBasis(g, ml)).toBe(false);
  });
});
