import { describe, it, expect } from "vitest";
import {
  matchProduct,
  parseSize,
  sizesCompatible,
  isMultiProductListing,
  hasConflictingAttribute,
  normalizeName,
  tokenize,
  type CanonicalProduct,
} from "@/lib/pricing/match";

/**
 * Catalogue excerpt mirroring the real seeded products involved in the
 * mismatches these tests pin down.
 */
const CATALOGUE: CanonicalProduct[] = [
  {
    id: "prod_d001",
    name: "Natrel Skim Milk",
    brand: "Natrel",
    unitSize: "2L",
    unitQuantity: 2,
    unitMeasure: "L",
  },
  {
    id: "prod_milk_natrel",
    name: "Central Dairies 2% Milk",
    brand: "Central Dairies",
    unitSize: "2L",
    unitQuantity: 2,
    unitMeasure: "L",
  },
  {
    id: "prod_buns_country_harvest",
    name: "Country Harvest Hamburger Buns",
    brand: "Country Harvest",
    unitSize: "8pk",
    unitQuantity: 8,
    unitMeasure: "unit",
  },
  {
    id: "prod_bread_wonder",
    name: "Wonder White Bread",
    brand: "Wonder",
    unitSize: "675g",
    unitQuantity: 675,
    unitMeasure: "g",
  },
  {
    id: "prod_bread_dempsters",
    name: "Dempster's Whole Wheat Bread",
    brand: "Dempster's",
    unitSize: "600g",
    unitQuantity: 600,
    unitMeasure: "g",
  },
  {
    id: "prod_butter_lactantia",
    name: "Lactantia Butter Salted",
    brand: "Lactantia",
    unitSize: "454g",
    unitQuantity: 454,
    unitMeasure: "g",
  },
];

const matchName = (name: string) => matchProduct(name, CATALOGUE)?.productId ?? null;

describe("matchProduct — real mismatches from the first live Flipp run", () => {
  // Each of these was accepted by the original scoring and is wrong.

  it("does not match a different milk variant on brand + 'milk' alone", () => {
    // Brand and "milk" both matched; "skim" — the identifying token — did not.
    expect(matchName("Natrel lactose free chocolate milk")).toBeNull();
  });

  it("does not match bagels to hamburger buns", () => {
    expect(matchName("Country Harvest bagels 6-pack.")).toBeNull();
  });

  it("rejects multi-product flyer listings", () => {
    expect(matchName("WONDER OR D'ITALIANO BREAD OR BUNS, 420-675 G")).toBeNull();
    expect(matchName("Dempster's Bread or Texas Toast")).toBeNull();
    expect(matchName("DEMPSTER'S Holsum White or Whole Wheat Bread")).toBeNull();
  });

  it("does not match a generic name to a branded product", () => {
    // Powell's "White Bread" is not necessarily Wonder-brand.
    expect(matchName("White Bread")).toBeNull();
  });
});

describe("matchProduct — accepts genuine matches", () => {
  it("matches an exact name", () => {
    expect(matchName("Natrel Skim Milk")).toBe("prod_d001");
  });

  it("tolerates extra flyer wording when the product's tokens are all present", () => {
    expect(matchName("Natrel Skim Milk 2L carton")).toBe("prod_d001");
  });

  it("matches case- and punctuation-insensitively", () => {
    expect(matchName("LACTANTIA BUTTER SALTED, 454 G")).toBe(
      "prod_butter_lactantia",
    );
  });

  it("returns null when nothing is close", () => {
    expect(matchName("Charmin Ultra Soft Toilet Paper")).toBeNull();
  });
});

describe("size guard", () => {
  it("normalizes weight and volume to base units", () => {
    expect(parseSize("1.5 L")).toEqual({ qty: 1500, unit: "ml" });
    expect(parseSize("500g")).toEqual({ qty: 500, unit: "g" });
    expect(parseSize("2kg")).toEqual({ qty: 2000, unit: "g" });
    expect(parseSize("12 pack")).toEqual({ qty: 12, unit: "unit" });
    expect(parseSize("no size here")).toBeNull();
  });

  it("never compares weight against volume", () => {
    expect(sizesCompatible({ qty: 500, unit: "g" }, { qty: 500, unit: "ml" })).toBe(
      false,
    );
  });

  it("allows a 10% tolerance but not more", () => {
    expect(sizesCompatible({ qty: 500, unit: "g" }, { qty: 540, unit: "g" })).toBe(true);
    expect(sizesCompatible({ qty: 400, unit: "g" }, { qty: 750, unit: "g" })).toBe(false);
  });

  it("permits an unknown size on either side", () => {
    expect(sizesCompatible(null, { qty: 500, unit: "g" })).toBe(true);
    expect(sizesCompatible({ qty: 500, unit: "g" }, null)).toBe(true);
  });

  it("rejects a size mismatch even when the names agree", () => {
    // Same product name, wrong pack size — the §8 trust-killer.
    expect(matchName("Lactantia Butter Salted 1kg")).toBeNull();
  });
});

describe("text helpers", () => {
  it("strips diacritics, symbols and case", () => {
    expect(normalizeName("Liberté Greek Yogurt®")).toBe("liberte greek yogurt");
  });

  it("drops stop words and bare numbers", () => {
    expect(tokenize("Selected varieties of 500 Fresh Bread")).toEqual(["bread"]);
  });

  it("detects multi-product listings", () => {
    expect(isMultiProductListing("Bread or Buns")).toBe(true);
    expect(isMultiProductListing("Orange Juice")).toBe(false); // 'or' inside a word
  });
});

describe("matchProduct — second round of live mismatches", () => {
  const WIDER: CanonicalProduct[] = [
    ...CATALOGUE,
    { id: "prod_broccoli", name: "Broccoli", brand: null, unitSize: null, unitQuantity: null, unitMeasure: null },
    { id: "prod_garlic", name: "Garlic", brand: null, unitSize: null, unitQuantity: null, unitMeasure: null },
    { id: "prod_carrots", name: "Carrots", brand: null, unitSize: null, unitQuantity: null, unitMeasure: null },
    { id: "prod_chicken_breast", name: "Maple Leaf Chicken Breast", brand: "Maple Leaf", unitSize: null, unitQuantity: null, unitMeasure: null },
    { id: "prod_coke", name: "Coca-Cola", brand: null, unitSize: null, unitQuantity: null, unitMeasure: null },
  ];
  const m = (n: string) => matchProduct(n, WIDER)?.productId ?? null;

  it("does not match a single-token product merely mentioned in a longer item", () => {
    expect(m("Swanson cheesy rice with broccoli & chicken frozen entrees")).toBeNull();
    expect(m("Golden Crust Garlic Bread")).toBeNull();
  });

  it("does not match a different cut of the same brand", () => {
    expect(m("Maple Leaf Prime Chicken Wings")).toBeNull();
  });

  it("does not match diet to regular", () => {
    expect(m("Diet Coca-Cola Pop")).toBeNull();
  });

  it("still accepts a benign qualifier on a single-token product", () => {
    expect(m("Jumbo Carrots")).toBe("prod_carrots");
  });
});

describe("hasConflictingAttribute", () => {
  it("flags mutually exclusive attributes", () => {
    expect(hasConflictingAttribute(["chicken", "wings"], ["chicken", "breast"])).toBe(true);
    expect(hasConflictingAttribute(["chocolate", "milk"], ["skim", "milk"])).toBe(true);
  });

  it("allows agreement or absence", () => {
    expect(hasConflictingAttribute(["chicken", "breast"], ["chicken", "breast"])).toBe(false);
    expect(hasConflictingAttribute(["chicken"], ["chicken", "breast"])).toBe(false);
  });
});
