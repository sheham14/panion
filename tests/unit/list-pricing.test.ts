/**
 * List pricing across stores — pure, no DB, no mocks.
 *
 * Every case here is one of the ways the old `Record<chain, number>` version
 * lied: a store looked cheapest because it was missing items, the subtotal was
 * labelled with a count it did not cover, or an item vanished from the
 * calculation entirely.
 */
import { describe, it, expect } from "vitest";
import {
  computeListPricing,
  priceItemAt,
  cheapestElsewhere,
  type PricingItem,
} from "@/lib/list-pricing";
import { GUEST_LIST, GUEST_PREFERRED_STORES } from "@/lib/guest-data";

// ── Fixtures ───────────────────────────────────

/** A packaged product priced at the given chains. `null` means carried but unpriced. */
function product(prices: Record<string, number | null>) {
  return {
    unitSize: "500g",
    unitMeasure: "g",
    unitQuantity: 500,
    storeProducts: Object.entries(prices).map(([chain, currentPrice]) => ({
      currentPrice,
      store: { chain },
    })),
  };
}

function item(
  id: string,
  prices: Record<string, number | null> | null,
  overrides: Partial<PricingItem> = {},
): PricingItem {
  return {
    id,
    isChecked: false,
    quantity: 1,
    unit: "each",
    customPrice: null,
    product: prices ? product(prices) : null,
    ...overrides,
  };
}

// ── priceItemAt ────────────────────────────────

describe("priceItemAt", () => {
  it("prices an item at a chain it is carried by", () => {
    expect(priceItemAt(item("a", { walmart: 4.98 }), "walmart")).toBe(4.98);
  });

  it("returns null for a chain with no row", () => {
    expect(priceItemAt(item("a", { walmart: 4.98 }), "sobeys")).toBeNull();
  });

  it("returns null for a row carried but unpriced", () => {
    expect(priceItemAt(item("a", { sobeys: null }), "sobeys")).toBeNull();
  });

  it("returns null for an item with no linked product", () => {
    expect(priceItemAt(item("a", null), "walmart")).toBeNull();
  });

  it("is case-insensitive on the chain", () => {
    expect(priceItemAt(item("a", { walmart: 4.98 }), "Walmart")).toBe(4.98);
  });

  it("multiplies by quantity", () => {
    const it2 = item("a", { walmart: 4.98 }, { quantity: 3 });
    expect(priceItemAt(it2, "walmart")).toBeCloseTo(14.94);
  });

  it("takes the cheapest row when a chain has two locations", () => {
    // The old loop added both to the total, double-counting the item.
    const twoStores: PricingItem = {
      ...item("a", null),
      product: {
        unitSize: "500g",
        unitMeasure: "g",
        unitQuantity: 500,
        storeProducts: [
          { currentPrice: 5.99, store: { chain: "walmart" } },
          { currentPrice: 4.49, store: { chain: "walmart" } },
        ],
      },
    };
    expect(priceItemAt(twoStores, "walmart")).toBe(4.49);
  });
});

// ── cheapestElsewhere ──────────────────────────

describe("cheapestElsewhere", () => {
  it("finds the cheapest price at another chain", () => {
    const i = item("a", { walmart: 6.49, dominion: 5.99, sobeys: 7.25 });
    expect(cheapestElsewhere(i, "sobeys")).toEqual({
      chain: "dominion",
      price: 5.99,
    });
  });

  it("excludes the chain asked about", () => {
    const i = item("a", { walmart: 1.99, dominion: 5.99 });
    expect(cheapestElsewhere(i, "walmart")).toEqual({
      chain: "dominion",
      price: 5.99,
    });
  });

  it("returns null when we hold no other price", () => {
    expect(cheapestElsewhere(item("a", { walmart: 4.98 }), "walmart")).toBeNull();
  });
});

// ── The headline defect ────────────────────────

describe("computeListPricing — ranking is not inverted by absence", () => {
  const items = [
    item("bread", { walmart: 3.0, sobeys: 3.5 }),
    item("butter", { walmart: 5.0, sobeys: 5.5 }),
    item("eggs", { walmart: 4.0 }), // sobeys cannot price this
  ];

  it("does not let the store missing an item win on a smaller basket", () => {
    const p = computeListPricing(items, ["walmart", "sobeys"]);

    // Raw totals: sobeys 9.00 < walmart 12.00. The old sort put sobeys first
    // purely because it was missing the eggs.
    const sobeys = p.baskets.find((b) => b.chain === "sobeys")!;
    const walmart = p.baskets.find((b) => b.chain === "walmart")!;
    expect(sobeys.total).toBeCloseTo(9.0);
    expect(walmart.total).toBeCloseTo(12.0);

    // On the shared basket walmart is genuinely cheaper, and that is what ranks.
    expect(p.commonItemIds).toEqual(["bread", "butter"]);
    expect(walmart.comparableTotal).toBeCloseTo(8.0);
    expect(sobeys.comparableTotal).toBeCloseTo(9.0);
    expect(p.ranked[0].chain).toBe("walmart");
  });

  it("records what each store could not price, with a price elsewhere", () => {
    const p = computeListPricing(items, ["walmart", "sobeys"]);
    const sobeys = p.baskets.find((b) => b.chain === "sobeys")!;

    expect(sobeys.missing).toEqual([
      { itemId: "eggs", elsewhere: { chain: "walmart", price: 4.0 } },
    ]);
    expect(sobeys.covered.map((c) => c.itemId)).toEqual(["bread", "butter"]);
  });

  it("gives coverage a denominator the subtotal can be labelled with", () => {
    const p = computeListPricing(items, ["walmart", "sobeys"]);
    const sobeys = p.baskets.find((b) => b.chain === "sobeys")!;
    // "2 of 3 items", not "3 items".
    expect(sobeys.covered.length).toBe(2);
    expect(p.itemCount).toBe(3);
  });
});

// ── Exclusions ─────────────────────────────────

describe("computeListPricing — exclusions", () => {
  it("puts an unlinked typed-in item in its own bucket, not a store's", () => {
    const items = [
      item("bread", { walmart: 3.0 }),
      item("candles", null), // no product, no custom price
    ];
    const p = computeListPricing(items, ["walmart"]);

    expect(p.unlinkedItemIds).toEqual(["candles"]);
    const walmart = p.baskets[0];
    expect(walmart.missing).toEqual([]); // not walmart's fault
    expect(walmart.covered.length).toBe(1);
  });

  it("counts a custom-priced typed-in item at every store", () => {
    const items = [
      item("bread", { walmart: 3.0, sobeys: 3.5 }),
      item("flowers", null, { customPrice: 8.0 }),
    ];
    const p = computeListPricing(items, ["walmart", "sobeys"]);

    for (const basket of p.baskets) {
      const flowers = basket.covered.find((c) => c.itemId === "flowers");
      expect(flowers).toEqual({
        itemId: "flowers",
        price: 8.0,
        viaCustomPrice: true,
      });
    }
    expect(p.unlinkedItemIds).toEqual([]);
  });

  it("multiplies a custom price by quantity", () => {
    const items = [item("flowers", null, { customPrice: 8.0, quantity: 3 })];
    const p = computeListPricing(items, ["walmart"]);
    expect(p.baskets[0].total).toBeCloseTo(24.0);
  });

  it("treats a carried-but-unpriced row as missing, not as free", () => {
    const items = [item("bread", { walmart: 3.0, sobeys: null })];
    const p = computeListPricing(items, ["walmart", "sobeys"]);
    const sobeys = p.baskets.find((b) => b.chain === "sobeys")!;

    expect(sobeys.total).toBe(0);
    expect(sobeys.missing.map((m) => m.itemId)).toEqual(["bread"]);
  });

  it("ignores checked items in totals and in the denominator", () => {
    const items = [
      item("bread", { walmart: 3.0 }),
      item("butter", { walmart: 5.0 }, { isChecked: true }),
    ];
    const p = computeListPricing(items, ["walmart"]);

    expect(p.itemCount).toBe(1);
    expect(p.baskets[0].total).toBeCloseTo(3.0);
  });
});

// ── Degenerate cases ───────────────────────────

describe("computeListPricing — degenerate cases", () => {
  it("keeps a zero-coverage store visible, ranked last", () => {
    const items = [item("bread", { walmart: 3.0 })];
    const p = computeListPricing(items, ["walmart", "dominion"]);

    expect(p.baskets.map((b) => b.chain)).toEqual(["walmart", "dominion"]);
    expect(p.ranked.map((b) => b.chain)).toEqual(["walmart"]);
    const dominion = p.baskets[1];
    expect(dominion.total).toBe(0);
    expect(dominion.covered).toEqual([]);
  });

  it("does not let a zero-coverage store empty the shared basket", () => {
    const items = [
      item("bread", { walmart: 3.0, sobeys: 3.5 }),
      item("butter", { walmart: 5.0, sobeys: 5.5 }),
    ];
    const p = computeListPricing(items, ["walmart", "sobeys", "dominion"]);

    // dominion prices nothing, so it takes no part in the comparison.
    expect(p.commonItemIds).toEqual(["bread", "butter"]);
    expect(p.ranked[0].chain).toBe("walmart");
  });

  it("falls back to coverage when no item is priced everywhere", () => {
    const items = [
      item("bread", { walmart: 3.0 }),
      item("butter", { walmart: 5.0 }),
      item("eggs", { sobeys: 1.0 }),
    ];
    const p = computeListPricing(items, ["walmart", "sobeys"]);

    expect(p.commonItemIds).toEqual([]);
    // sobeys is cheaper (1.00 vs 8.00) but covers one item to walmart's two.
    expect(p.ranked[0].chain).toBe("walmart");
  });

  it("returns empty baskets for an empty preferred-store list", () => {
    const p = computeListPricing([item("bread", { walmart: 3.0 })], []);
    expect(p.baskets).toEqual([]);
    expect(p.ranked).toEqual([]);
    expect(p.commonItemIds).toEqual([]);
  });

  it("deduplicates repeated preferred chains", () => {
    const p = computeListPricing(
      [item("bread", { walmart: 3.0 })],
      ["walmart", "Walmart"],
    );
    expect(p.baskets).toHaveLength(1);
  });
});

// ── The multi-store plan ───────────────────────

describe("computeListPricing — cheapestSplit", () => {
  it("reports the cheapest per item and how many stops it needs", () => {
    const items = [
      item("bread", { walmart: 3.0, sobeys: 3.5 }),
      item("butter", { walmart: 6.0, sobeys: 5.0 }),
    ];
    const p = computeListPricing(items, ["walmart", "sobeys"]);

    expect(p.cheapestSplit).toEqual({
      total: 8.0, // 3.00 walmart + 5.00 sobeys
      chains: ["sobeys", "walmart"],
      itemCount: 2,
    });
  });

  it("is null when one store is already cheapest for everything", () => {
    const items = [
      item("bread", { walmart: 3.0, sobeys: 3.5 }),
      item("butter", { walmart: 5.0, sobeys: 5.5 }),
    ];
    expect(computeListPricing(items, ["walmart", "sobeys"]).cheapestSplit)
      .toBeNull();
  });

  it("does not count a custom-priced item as a reason to make a stop", () => {
    const items = [
      item("bread", { walmart: 3.0 }),
      item("flowers", null, { customPrice: 8.0 }),
    ];
    // One real chain used, so no split — the flowers cost the same anywhere.
    expect(computeListPricing(items, ["walmart", "sobeys"]).cheapestSplit)
      .toBeNull();
  });
});

// ── The guest preview ──────────────────────────

describe("the guest list demonstrates the defect it was built to fix", () => {
  // The logged-out preview used to price every item at every store, which is
  // both unlike the real catalogue (Sobeys holds 187 of 701 products) and the
  // one shape in which none of this UI appears. Filling those prices back in
  // would quietly return the preview to showing a list where nothing is ever
  // excluded, so the gaps are asserted here.
  const pricing = computeListPricing(
    GUEST_LIST.items as unknown as PricingItem[],
    GUEST_PREFERRED_STORES.map((s) => s.chain),
  );

  it("has a store whose raw total is lowest and whose coverage is worst", () => {
    const cheapest = [...pricing.baskets].sort((a, b) => a.total - b.total)[0];
    expect(cheapest.missing.length).toBeGreaterThan(0);
    // ...and that store is not the one presented as best.
    expect(pricing.ranked[0].chain).not.toBe(cheapest.chain);
  });

  it("carries an item no store can price", () => {
    expect(pricing.unlinkedItemIds.length).toBeGreaterThan(0);
  });

  it("keeps a shared basket to rank on", () => {
    expect(pricing.commonItemIds.length).toBeGreaterThan(0);
    expect(pricing.commonItemIds.length).toBeLessThan(pricing.itemCount);
  });
});
