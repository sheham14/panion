/**
 * The weekly scrape jobs fetch in Inngest steps, and a step's result comes
 * back as JSON. These pin what that changes: dates arrive as strings, batches
 * must merge without duplicates, and a run where most searches failed must
 * not pass for a thin success.
 */
import { describe, it, expect } from "vitest";
import {
  batches,
  mergeBatches,
  mostSearchesFailed,
  revivePcProducts,
  reviveFlyerItems,
} from "@/lib/pricing/weekly-scrape";
import type { NormalizedPcProduct } from "@/lib/pricing/adapters/pcexpress";
import type { NormalizedFlyerItem } from "@/lib/pricing/adapters/flipp";

/** What `step.run` does to a value: through JSON and back. */
const throughStep = <T>(v: T) => JSON.parse(JSON.stringify(v));

describe("batches", () => {
  it("splits into fixed-size batches with a short last one", () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("covers every item exactly once", () => {
    const items = Array.from({ length: 161 }, (_, i) => i);
    expect(batches(items, 8).flat()).toEqual(items);
  });
});

describe("mergeBatches", () => {
  it("keeps the first copy of a product found by two searches", () => {
    const merged = mergeBatches(
      [
        { items: [{ id: "a", via: "milk" }, { id: "b", via: "milk" }], errors: [] },
        { items: [{ id: "a", via: "cream" }], errors: ['"cream": HTTP 500'] },
      ],
      (x) => x.id,
    );
    expect(merged.items).toEqual([{ id: "a", via: "milk" }, { id: "b", via: "milk" }]);
    expect(merged.errors).toEqual(['"cream": HTTP 500']);
  });
});

describe("mostSearchesFailed", () => {
  it("is false for an occasional failed search", () => {
    expect(mostSearchesFailed(160, ["x", "y", "z"])).toBe(false);
  });
  it("is true when more than half failed, as with a rotated API key", () => {
    expect(mostSearchesFailed(160, Array(81).fill("HTTP 401"))).toBe(true);
  });
});

describe("revive after a step", () => {
  it("restores a PC Express sale end date to a Date", () => {
    const end = new Date("2026-11-26T03:59:59Z");
    const product = {
      code: "1_EA", name: "Milk", brand: null, packageSize: "2 L", barcode: null,
      price: 5.49, regularPrice: 6.29, isSale: true, saleEndDate: end,
      imageUrl: null, productUrl: null, inStock: true,
    } as NormalizedPcProduct;

    const [back] = revivePcProducts(throughStep([product]));
    expect(back.saleEndDate).toBeInstanceOf(Date);
    expect(back.saleEndDate?.toISOString()).toBe(end.toISOString());
  });

  it("keeps a missing sale end date null, not 1970", () => {
    const [back] = revivePcProducts(throughStep([{ code: "2_EA", saleEndDate: null }]) as never);
    expect(back.saleEndDate).toBeNull();
  });

  it("restores flyer validity dates", () => {
    const item = {
      flyerItemId: "9", flyerId: null, merchantName: "Sobeys", chain: "sobeys",
      name: "Eggs", price: 3.99, regularPrice: null, unitText: null, imageUrl: null,
      validFrom: new Date("2026-11-19T00:00:00Z"), validTo: null, category: null,
    } as NormalizedFlyerItem;

    const [back] = reviveFlyerItems(throughStep([item]));
    expect(back.validFrom).toBeInstanceOf(Date);
    expect(back.validTo).toBeNull();
  });
});
