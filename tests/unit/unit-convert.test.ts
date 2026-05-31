/**
 * Pure unit-conversion logic — no DB, no auth, no mocks. Fast.
 */
import { describe, it, expect } from "vitest";
import {
  isBulkProduct,
  getUnitType,
  getMeasureType,
  getAllowedUnits,
  TO_BASE,
} from "@/lib/unit-convert";

describe("isBulkProduct", () => {
  it("identifies 'per kg' unitSize as bulk", () => {
    expect(isBulkProduct("per kg")).toBe(true);
    expect(isBulkProduct("Per Kg")).toBe(true); // case-insensitive
  });

  it("identifies packaged sizes as not bulk", () => {
    expect(isBulkProduct("500g")).toBe(false);
    expect(isBulkProduct("2L")).toBe(false);
    expect(isBulkProduct("12 pack")).toBe(false);
  });

  it("handles null/undefined gracefully", () => {
    expect(isBulkProduct(null)).toBe(false);
    expect(isBulkProduct(undefined)).toBe(false);
  });
});

describe("getUnitType", () => {
  it("classifies weight units", () => {
    expect(getUnitType("g")).toBe("weight");
    expect(getUnitType("kg")).toBe("weight");
    expect(getUnitType("lbs")).toBe("weight");
  });

  it("classifies volume units", () => {
    expect(getUnitType("ml")).toBe("volume");
    expect(getUnitType("L")).toBe("volume");
  });

  it("falls back to count for unknown units", () => {
    expect(getUnitType("unknown-thing")).toBe("count");
  });
});

describe("getAllowedUnits", () => {
  it("returns count units for packaged products", () => {
    expect(getAllowedUnits("g", "500g")).toEqual(["each", "pack"]);
  });

  it("returns weight units for bulk weight products", () => {
    expect(getAllowedUnits("g", "per kg")).toContain("g");
    expect(getAllowedUnits("g", "per kg")).toContain("kg");
  });

  it("returns volume units for bulk volume products", () => {
    expect(getAllowedUnits("ml", "per L")).toContain("ml");
    expect(getAllowedUnits("ml", "per L")).toContain("L");
  });
});

describe("TO_BASE conversion table", () => {
  it("normalises kg to grams correctly", () => {
    expect(TO_BASE.kg).toBe(1000);
  });

  it("normalises lbs to grams", () => {
    // 1 lb ≈ 453.592 g
    expect(TO_BASE.lbs).toBeCloseTo(453.592, 3);
  });

  it("normalises L to ml", () => {
    expect(TO_BASE.L).toBe(1000);
  });
});

describe("getMeasureType", () => {
  it("returns count for null/undefined", () => {
    expect(getMeasureType(null)).toBe("count");
    expect(getMeasureType(undefined)).toBe("count");
  });

  it("classifies weight and volume measures", () => {
    expect(getMeasureType("kg")).toBe("weight");
    expect(getMeasureType("L")).toBe("volume");
  });
});
