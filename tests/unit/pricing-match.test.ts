import { describe, it, expect } from "vitest";
import {
  matchProduct,
  parseSize,
  sizesCompatible,
  isMultiProductListing,
  hasConflictingAttribute,
  normalizeBarcode,
  matchByBarcode,
  matchProductByBarcodeOrName,
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

describe("matchProduct — bugs found building the Dominion adapter", () => {
  const DAIRY: CanonicalProduct[] = [
    { id: "milk_2pct_2l", name: "Central Dairies 2% Milk", brand: "Central Dairies", unitSize: "2L", unitQuantity: 2, unitMeasure: "L" },
    { id: "butter_lactantia", name: "Lactantia Butter Salted", brand: "Lactantia", unitSize: "454g", unitQuantity: 454, unitMeasure: "g" },
  ];
  const m = (n: string) => matchProduct(n, DAIRY)?.productId ?? null;

  it("does not match a different fat percentage", () => {
    // 05749801031 is 3.25% homogenized; tokenizing dropped the bare number so
    // it looked identical to the 2% product.
    expect(m("Central Dairies 3.25% Homogenized Milk 2 l")).toBeNull();
    expect(m("Central Dairies 1% Milk 2 l")).toBeNull();
    expect(m("Central Dairies 2% Milk 2 l")).toBe("milk_2pct_2l");
  });

  it("does not match a different pack size of the same product", () => {
    // 05749801042 is the 1L. Only caught when packageSize is part of the name
    // passed to the matcher.
    expect(m("Central Dairies 2% Milk 1 l")).toBeNull();
    expect(m("Central Dairies 2% Milk 473 ml")).toBeNull();
  });

  it("does not match a different format at the same weight", () => {
    // Sea Salted Butter Sticks 454g vs a 454g block.
    expect(m("Lactantia Sea Salted Butter Sticks 454 g")).toBeNull();
    expect(m("Lactantia Salted Butter 454 g")).toBe("butter_lactantia");
  });
});

describe("barcode matching", () => {
  const WITH_BARCODES: CanonicalProduct[] = [
    { id: "p1", name: "Central Dairies 2% Milk", brand: "Central Dairies", unitSize: "2L", unitQuantity: 2, unitMeasure: "L", barcode: "05749801032" },
  ];

  it("normalizes padding so retailer variants compare equal", () => {
    expect(normalizeBarcode("05749801032")).toBe("5749801032");
    expect(normalizeBarcode("5749801032")).toBe("5749801032");
    expect(normalizeBarcode("0005749801032")).toBe("5749801032");
  });

  it("rejects PLU codes and junk as barcodes", () => {
    expect(normalizeBarcode("4011")).toBeNull(); // loose-produce PLU
    expect(normalizeBarcode("")).toBeNull();
    expect(normalizeBarcode(null)).toBeNull();
  });

  it("matches exactly on barcode regardless of name", () => {
    const r = matchByBarcode("5749801032", WITH_BARCODES);
    expect(r?.productId).toBe("p1");
    expect(r?.confidence).toBe(1);
  });

  it("prefers barcode over name when both could match", () => {
    const r = matchProductByBarcodeOrName(
      { barcode: "05749801032", name: "something else entirely" },
      WITH_BARCODES,
    );
    expect(r?.productId).toBe("p1");
    expect(r?.reason).toContain("barcode=");
  });

  it("falls back to name matching when there is no barcode", () => {
    const r = matchProductByBarcodeOrName(
      { barcode: null, name: "Central Dairies 2% Milk 2 l" },
      WITH_BARCODES,
    );
    expect(r?.productId).toBe("p1");
    expect(r?.reason).not.toContain("barcode=");
  });
});

describe("matchProduct — mismatch found on the first live Sobeys run", () => {
  const POULTRY: CanonicalProduct[] = [
    {
      id: "prod_wr_breasts",
      name: "Watson Ridge Chicken Breasts",
      brand: "Watson Ridge",
      unitSize: "800g",
      unitQuantity: 800,
      unitMeasure: "g",
    },
  ];
  const m = (n: string) => matchProduct(n, POULTRY)?.productId ?? null;

  it("does not match nuggets to breasts", () => {
    // Live: a $5.97 Walmart flyer bag of "Watson Ridge chicken nuggets" was
    // priced against the $16.00 800g pack of breasts — a 2.7x spread that read
    // as a bargain rather than as the bad match it was. "breasts" (plural) was
    // absent from the cuts group, so nothing conflicted.
    expect(m("Watson Ridge chicken nuggets")).toBeNull();
  });

  it("does not match other prepared forms to a raw cut", () => {
    expect(m("Watson Ridge Chicken Strips 800g")).toBeNull();
    expect(m("Watson Ridge Chicken Tenders 800g")).toBeNull();
    expect(m("Watson Ridge Chicken Patties 800g")).toBeNull();
  });

  it("still matches the same cut", () => {
    expect(m("Watson Ridge Chicken Breasts 800g")).toBe("prod_wr_breasts");
  });

  it("treats singular and plural cuts as the same attribute", () => {
    expect(hasConflictingAttribute(["chicken", "breasts"], ["chicken", "breast"])).toBe(false);
    expect(hasConflictingAttribute(["chicken", "nuggets"], ["chicken", "breasts"])).toBe(true);
  });
});
