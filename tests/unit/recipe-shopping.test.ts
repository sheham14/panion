import { describe, it, expect } from "vitest";
import {
  packsFor,
  planRecipeShopping,
  type ShoppingIngredient,
  type ShoppingProduct,
} from "@/lib/recipes/recipe-shopping";

const product = (
  id: string,
  brand: string,
  name: string,
  size: { qty: number | null; measure: string | null },
  prices: [chain: string, price: number][],
): ShoppingProduct => ({
  id,
  name,
  brand,
  unitSize: size.qty ? `${size.qty}${size.measure}` : null,
  unitQuantity: size.qty,
  unitMeasure: size.measure,
  prices: prices.map(([chain, price]) => ({
    price,
    isSale: false,
    chain,
    storeName: `${chain} store`,
  })),
});

const ingredient = (
  id: string,
  name: string,
  opts: Partial<ShoppingIngredient> = {},
): ShoppingIngredient => ({
  id,
  name,
  quantity: null,
  unit: null,
  inPantry: false,
  linked: null,
  groupSlug: null,
  ...opts,
});

const MOZZARELLA = [
  product("comp-moz", "Compliments", "Shredded Pizza Mozzarella", { qty: 320, measure: "g" }, [["sobeys", 5.99]]),
  product("gv-moz", "Great Value", "Pizza Mozzarella Shredded", { qty: 320, measure: "g" }, [["walmart", 5.47]]),
  product("kraft-moz", "Kraft", "Shredded Mozzarella", { qty: 320, measure: "g" }, [["sobeys", 7.49], ["dominion", 6.99]]),
];

describe("packsFor", () => {
  it("covers the recipe's amount with whole packages", () => {
    expect(packsFor(500, "g", { unitQuantity: 200, unitMeasure: "g", unitSize: "200g" })).toBe(3);
    expect(packsFor(1, "kg", { unitQuantity: 500, unitMeasure: "g", unitSize: "500g" })).toBe(2);
  });

  it("converts kitchen volumes", () => {
    // 2 cups is 480 ml: one 2 L carton.
    expect(packsFor(2, "cups", { unitQuantity: 2000, unitMeasure: "ml", unitSize: "2L" })).toBe(1);
    expect(packsFor(3, "tbsp", { unitQuantity: 250, unitMeasure: "ml", unitSize: "250ml" })).toBe(1);
  });

  it("buys one package when the units can't be compared", () => {
    // Cups of cheese, cheese sold by weight.
    expect(packsFor(2, "cups", { unitQuantity: 320, unitMeasure: "g", unitSize: "320g" })).toBe(1);
    expect(packsFor(2, "cloves", { unitQuantity: 100, unitMeasure: "g", unitSize: "100g" })).toBe(1);
    expect(packsFor(null, null, { unitQuantity: 320, unitMeasure: "g", unitSize: "320g" })).toBe(1);
  });

  it("distrusts an absurd package count", () => {
    // A size misread as 10 g would ask for 50 packs of a 500 g recipe.
    expect(packsFor(500, "g", { unitQuantity: 10, unitMeasure: "g", unitSize: "10g" })).toBe(1);
  });
});

describe("planRecipeShopping", () => {
  const chains = ["dominion", "sobeys", "walmart"];

  it("buys a group ingredient as the cheapest member at each store", () => {
    const { picks, pricing } = planRecipeShopping(
      [ingredient("i1", "shredded mozzarella", { groupSlug: "shredded-mozzarella-cheese" })],
      new Map([["shredded-mozzarella-cheese", MOZZARELLA]]),
      chains,
    );

    expect(picks.i1).toMatchObject({ productId: "gv-moz", chain: "walmart", cost: 5.47, viaGroup: true });
    const at = (chain: string) =>
      pricing.baskets.find((b) => b.chain === chain)!.covered[0]?.price;
    expect(at("sobeys")).toBe(5.99); // Compliments, not the dearer Kraft
    expect(at("dominion")).toBe(6.99);
    expect(at("walmart")).toBe(5.47);
  });

  it("chooses the member that covers the amount most cheaply, packages included", () => {
    const small = product("small", "A", "Butter", { qty: 250, measure: "g" }, [["sobeys", 3.0]]);
    const big = product("big", "B", "Butter", { qty: 1000, measure: "g" }, [["sobeys", 9.0]]);
    // 900 g needs four small packs ($12) or one big ($9).
    const { picks } = planRecipeShopping(
      [ingredient("i1", "butter", { quantity: 900, unit: "g", groupSlug: "salted-butter" })],
      new Map([["salted-butter", [small, big]]]),
      ["sobeys"],
    );
    expect(picks.i1).toMatchObject({ productId: "big", packs: 1, cost: 9 });
  });

  it("prefers a linked product over the group", () => {
    const linked = product("linked", "Natrel", "2% Milk", { qty: 2000, measure: "ml" }, [["sobeys", 6.49]]);
    const { picks } = planRecipeShopping(
      [ingredient("i1", "milk", { linked, groupSlug: "2-percent-milk" })],
      new Map([["2-percent-milk", [product("cheap", "X", "2% Milk", { qty: 2000, measure: "ml" }, [["sobeys", 4.99]])]]]),
      ["sobeys"],
    );
    expect(picks.i1).toMatchObject({ productId: "linked", viaGroup: false });
  });

  it("shows pantry items but leaves them out of the totals", () => {
    const { picks, pricing } = planRecipeShopping(
      [
        ingredient("i1", "shredded mozzarella", { groupSlug: "moz", inPantry: true }),
        ingredient("i2", "mozzarella again", { groupSlug: "moz" }),
      ],
      new Map([["moz", MOZZARELLA]]),
      chains,
    );
    expect(picks.i1).not.toBeNull();
    expect(pricing.itemCount).toBe(1);
    expect(pricing.baskets.every((b) => b.covered.every((c) => c.itemId !== "i1"))).toBe(true);
  });

  it("reports an ingredient it cannot price instead of dropping it", () => {
    const { picks, pricing } = planRecipeShopping(
      [ingredient("i1", "salt to taste")],
      new Map(),
      chains,
    );
    expect(picks.i1).toBeNull();
    expect(pricing.unlinkedItemIds).toEqual(["i1"]);
  });

  it("does not rank a store first for leaving an ingredient out", () => {
    // Walmart has no parmesan, so its total ($6.50) is the smallest of the
    // three — but on the mozzarella every store can price, Sobeys is cheaper.
    const moz = [
      product("comp-moz", "Compliments", "Shredded Mozzarella", { qty: 320, measure: "g" }, [["sobeys", 5.99]]),
      product("gv-moz", "Great Value", "Shredded Mozzarella", { qty: 320, measure: "g" }, [["walmart", 6.5]]),
      product("kraft-moz", "Kraft", "Shredded Mozzarella", { qty: 320, measure: "g" }, [["dominion", 6.99]]),
    ];
    const parm = [product("parm", "Kraft", "Grated Parmesan", { qty: 250, measure: "g" }, [["sobeys", 8.0], ["dominion", 8.5]])];
    const { pricing } = planRecipeShopping(
      [
        ingredient("i1", "mozzarella", { groupSlug: "moz" }),
        ingredient("i2", "parmesan", { groupSlug: "parm" }),
      ],
      new Map([["moz", moz], ["parm", parm]]),
      chains,
    );

    const walmart = pricing.baskets.find((b) => b.chain === "walmart")!;
    expect(walmart.total).toBeLessThan(pricing.baskets.find((b) => b.chain === "sobeys")!.total);
    expect(pricing.ranked[0].chain).toBe("sobeys");
    expect(walmart.missing.map((m) => m.itemId)).toEqual(["i2"]);
  });
});
