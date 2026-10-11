/**
 * List items bought as a group — pure, no DB.
 *
 * Each store prices "any of" a group with its own best buy, over the same
 * amount at every store. Picking each store's cheapest package instead would
 * compare a 6-pack with an 18-pack and give "Best" to the smallest box.
 */
import { describe, it, expect } from "vitest";
import {
  bestBuysByChain,
  describeGroup,
  groupLabel,
  groupProduct,
  referenceSize,
  sizeOf,
  type GroupMember,
} from "@/lib/list-groups";
import { computeListPricing, type PricingItem } from "@/lib/list-pricing";

// ── Fixtures ───────────────────────────────────

function member(
  id: string,
  prices: Record<string, number>,
  size: { name?: string; unitSize?: string | null; qty?: number; measure?: string } = {},
): GroupMember {
  return {
    id,
    name: size.name ?? `Product ${id}`,
    brand: null,
    imageUrl: null,
    unitSize: size.unitSize ?? null,
    unitQuantity: size.qty ?? null,
    unitMeasure: size.measure ?? null,
    storeProducts: Object.entries(prices).map(([chain, currentPrice]) => ({
      id: `${id}-${chain}`,
      currentPrice,
      isSale: false,
      store: { id: `store_${chain}`, chain, name: chain },
    })),
  };
}

const eggs = (id: string, count: number, prices: Record<string, number>) =>
  member(id, prices, { qty: count, measure: "unit" });

// ── Sizes ──────────────────────────────────────

describe("sizeOf", () => {
  it("prefers the structured columns", () => {
    expect(sizeOf(member("a", {}, { qty: 454, measure: "g", name: "Butter 250g" })))
      .toEqual({ qty: 454, basis: "g" });
  });

  it("reads a count from the name when nothing else states one", () => {
    expect(sizeOf(member("a", {}, { name: "Newfoundland Eggs Large White 18 Eggs" })))
      .toEqual({ qty: 18, basis: "unit" });
    expect(sizeOf(member("a", {}, { name: "White Eggs Large 12 Count" })))
      .toEqual({ qty: 12, basis: "unit" });
  });

  it('reads Voilà\'s "12 per pack" as a count', () => {
    expect(sizeOf(member("a", {}, { name: "Brown Eggs", unitSize: "12 per pack" })))
      .toEqual({ qty: 12, basis: "unit" });
  });

  it("returns null rather than guess", () => {
    expect(sizeOf(member("a", {}, { name: "Newfoundland Eggs Large White Eggs" }))).toBeNull();
  });
});

describe("referenceSize", () => {
  it("is the median size, in the group's most common measure", () => {
    const members = [
      eggs("a", 6, {}),
      eggs("b", 12, {}),
      eggs("c", 12, {}),
      eggs("d", 30, {}),
      member("e", {}, { qty: 500, measure: "g" }),
    ];
    expect(referenceSize(members)).toEqual({ qty: 12, basis: "unit" });
  });

  it("is a size actually sold, not an average between two", () => {
    expect(referenceSize([eggs("a", 6, {}), eggs("b", 18, {})])).toEqual({ qty: 6, basis: "unit" });
  });
});

// ── Best buys ──────────────────────────────────

describe("bestBuysByChain", () => {
  const reference = { qty: 12, basis: "unit" as const };

  it("prices every store for the same amount, in whole packages", () => {
    const buys = bestBuysByChain(
      [eggs("six", 6, { walmart: 3.0 }), eggs("dozen", 12, { sobeys: 5.5 })],
      reference,
    );
    // Two 6-packs at Walmart, not one: otherwise Walmart "wins" on half the eggs.
    expect(buys.get("walmart")).toMatchObject({ currentPrice: 6, pick: { productId: "six", packs: 2 } });
    expect(buys.get("sobeys")).toMatchObject({ currentPrice: 5.5, pick: { productId: "dozen", packs: 1 } });
  });

  it("takes each store's cheapest way to the amount", () => {
    const buys = bestBuysByChain(
      [eggs("a", 12, { dominion: 5.24 }), eggs("b", 12, { dominion: 5.93 }), eggs("c", 18, { dominion: 6.29 })],
      reference,
    );
    expect(buys.get("dominion")?.pick.productId).toBe("a");
  });

  it("leaves out a product whose size is unknown", () => {
    const buys = bestBuysByChain(
      [member("mystery", { walmart: 1.0 }, { name: "Eggs" }), eggs("dozen", 12, { walmart: 5.24 })],
      reference,
    );
    expect(buys.get("walmart")?.pick.productId).toBe("dozen");
  });

  it("leaves out a size so small it is more likely misread than real", () => {
    const buys = bestBuysByChain([eggs("one", 1, { walmart: 0.2 })], reference);
    expect(buys.has("walmart")).toBe(false);
  });

  it("with no size anywhere, compares single packages", () => {
    const buys = bestBuysByChain([member("a", { walmart: 3 }), member("b", { walmart: 2 })], null);
    expect(buys.get("walmart")).toMatchObject({ currentPrice: 2, pick: { packs: 1 } });
  });
});

describe("groupProduct", () => {
  // Sizes 6, 12 and 18: every store is priced for 12.
  const members = [
    eggs("six", 6, { walmart: 3.0 }),
    eggs("dozen", 12, { sobeys: 5.5, dominion: 5.24 }),
    eggs("eighteen", 18, { sobeys: 9.0 }),
  ];

  it("is a product with one row per store, named for the group", () => {
    const product = groupProduct("large-eggs", members)!;
    expect(product.name).toBe("Large eggs");
    expect(product.storeProducts.map((sp) => sp.store.chain).sort())
      .toEqual(["dominion", "sobeys", "walmart"]);
  });

  it("prices through computeListPricing with no special case", () => {
    const item: PricingItem = {
      id: "i1",
      isChecked: false,
      quantity: 2,
      unit: "each",
      customPrice: null,
      product: groupProduct("large-eggs", members),
    };
    const pricing = computeListPricing([item], ["walmart", "sobeys", "dominion"]);
    const total = (chain: string) => pricing.baskets.find((b) => b.chain === chain)?.total;
    expect(total("dominion")).toBeCloseTo(10.48);
    expect(total("walmart")).toBeCloseTo(12);
    expect(pricing.ranked[0].chain).toBe("dominion");
  });

  it("is null when nothing in the group has a price", () => {
    expect(groupProduct("large-eggs", [eggs("a", 12, {})])).toBeNull();
  });
});

describe("describeGroup", () => {
  it("offers members best value first and states the amount priced", () => {
    const group = describeGroup("large-eggs", [
      eggs("pricey", 12, { sobeys: 8.59 }),
      eggs("bulk", 30, { walmart: 14.98 }),
      eggs("cheap", 12, { dominion: 5.24 }),
    ]);
    expect(group.reference).toBe("12 count");
    expect(group.choices.map((c) => c.id)).toEqual(["cheap", "bulk", "pricey"]);
    expect(group.choices[0]).toMatchObject({ bestPrice: 5.24, bestStore: "dominion" });
  });

  it("labels a slug the way search does", () => {
    expect(groupLabel("2-percent-milk")).toBe("2 percent milk");
  });
});
