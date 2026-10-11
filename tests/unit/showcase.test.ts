/**
 * The logged-out preview and onboarding suggestions — pure, no DB.
 *
 * Both used to be hard-coded fixtures naming products from the fabricated
 * seed. When the seed was deleted, the preview kept quoting invented prices
 * under real store names, and onboarding's watchlist insert failed on the
 * foreign key. They are now built from real catalogue rows chosen by group;
 * these cases pin how a group's product is chosen and what the builders keep.
 */
import { describe, it, expect } from "vitest";
import { pickShowcaseProduct, type ShowcaseProduct } from "@/lib/showcase";
import { buildGuestHome, buildGuestList, buildGuestPantry } from "@/lib/guest-data";
import { computeListPricing, type PricingItem } from "@/lib/list-pricing";
import { groupProduct } from "@/lib/list-groups";

// ── Fixtures ───────────────────────────────────

const STORES = [
  { id: "store_walmart", chain: "walmart", name: "Walmart" },
  { id: "store_dominion", chain: "dominion", name: "Dominion" },
  { id: "store_sobeys", chain: "sobeys", name: "Sobeys" },
];

const NOW = new Date("2026-10-11T12:00:00Z");

function product(
  id: string,
  prices: Record<string, number>,
  opts: { image?: boolean; group?: string; scrapedAt?: Date } = {},
): ShowcaseProduct {
  return {
    id,
    name: `Product ${id}`,
    brand: null,
    category: "dairy",
    subcategory: opts.group ?? id,
    imageUrl: opts.image === false ? null : `https://img.example/${id}.jpg`,
    unitSize: "500g",
    unitMeasure: "g",
    unitQuantity: 500,
    storeProducts: Object.entries(prices).map(([chain, currentPrice]) => {
      const store = STORES.find((s) => s.chain === chain)!;
      return {
        storeId: store.id,
        currentPrice,
        isSale: false,
        lastScrapedAt: opts.scrapedAt ?? NOW,
        store,
      };
    }),
  } as unknown as ShowcaseProduct;
}

// ── Choosing a group's product ─────────────────

describe("pickShowcaseProduct", () => {
  it("prefers the product priced at the most stores", () => {
    const two = product("a", { walmart: 4, dominion: 5 });
    const three = product("b", { walmart: 4, dominion: 5, sobeys: 6 });
    expect(pickShowcaseProduct([two, three])?.id).toBe("b");
  });

  it("never picks a product without a photo, however well covered", () => {
    const bare = product("a", { walmart: 4, dominion: 5, sobeys: 6 }, { image: false });
    const pictured = product("b", { walmart: 4 });
    expect(pickShowcaseProduct([bare, pictured])?.id).toBe("b");
  });

  it("breaks a coverage tie on the most recent price, then on id", () => {
    const old = product("a", { walmart: 4 }, { scrapedAt: new Date("2026-08-01") });
    const fresh = product("b", { walmart: 4 }, { scrapedAt: new Date("2026-08-28") });
    expect(pickShowcaseProduct([old, fresh])?.id).toBe("b");
    expect(pickShowcaseProduct([product("z", { walmart: 4 }), product("m", { walmart: 4 })])?.id)
      .toBe("m");
  });

  it("returns null rather than inventing something when nothing qualifies", () => {
    expect(pickShowcaseProduct([])).toBeNull();
    expect(pickShowcaseProduct([product("a", {}, {})])).toBeNull();
  });
});

// ── The preview screens ────────────────────────

const products = [
  product("milk", { walmart: 4.87, dominion: 4.78, sobeys: 5.39 }, { group: "2-percent-milk" }),
  product("eggs", { walmart: 5.5, dominion: 5.28 }, { group: "large-eggs" }),
  product("butter", { dominion: 6.99, sobeys: 7.49 }, { group: "salted-butter" }),
];

describe("the guest list", () => {
  const list = buildGuestList(products, NOW);
  // What `getGuestList` does through `withGroups`: price "any of" a group.
  const resolved = list.items.map((i) =>
    i.groupSlug && !i.productId
      ? { ...i, product: groupProduct(i.groupSlug, products.filter((p) => p.subcategory === i.groupSlug)) }
      : i,
  );
  const pricing = computeListPricing(
    resolved as unknown as PricingItem[],
    STORES.map((s) => s.chain),
  );

  it("lists every showcase product, linked to its real id", () => {
    expect(list.items.filter((i) => i.productId).map((i) => i.productId))
      .toEqual(["milk", "butter"]);
  });

  it('lists eggs as "any large eggs", for each store to price its own best buy', () => {
    const eggs = list.items.find((i) => i.groupSlug === "large-eggs")!;
    expect(eggs).toMatchObject({ productId: null, name: "Large eggs", product: null });
  });

  it("carries a typed-in item no store can price", () => {
    expect(pricing.unlinkedItemIds).toEqual(["guest-item-unlinked"]);
  });

  it("shows stores missing items rather than pricing everything everywhere", () => {
    expect(pricing.baskets.some((b) => b.missing.length > 0)).toBe(true);
    expect(pricing.commonItemIds.length).toBeLessThan(pricing.itemCount);
  });

  it("keeps each item's group, so a pick can be switched", () => {
    expect(list.items.find((i) => i.productId === "milk")?.groupSlug).toBe("2-percent-milk");
  });
});

describe("the guest home", () => {
  const home = buildGuestHome(products, STORES);

  it("states each store's coverage beside its total", () => {
    const sobeys = home.stores.find((s) => s.chain === "sobeys")!;
    expect(sobeys.covered).toBe(2);
    expect(sobeys.missing).toBe(1);
  });

  it("keeps real price dates instead of stamping them fresh", () => {
    const old = new Date("2026-08-28T00:00:00Z");
    const stale = buildGuestHome(
      [product("milk", { walmart: 4 }, { scrapedAt: old })],
      STORES,
    );
    expect(stale.items[0].prices.walmart?.scrapedAt).toBe(old.toISOString());
  });
});

describe("the guest pantry", () => {
  const pantry = buildGuestPantry(products, NOW);

  it("holds only groups the showcase found, each with its product's photo", () => {
    expect(pantry.map((p) => p.productId)).toEqual(["milk", "eggs", "butter"]);
    expect(pantry.every((p) => p.imageUrl)).toBe(true);
  });

  it("dates items relative to now, so the preview never ages", () => {
    const milk = pantry.find((p) => p.productId === "milk")!;
    expect(milk.expiresAt).toBe(new Date("2026-10-13T12:00:00Z").toISOString());
  });
});
