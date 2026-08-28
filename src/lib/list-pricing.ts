// src/lib/list-pricing.ts
/**
 * Pricing a grocery list across stores — including what each store *cannot*
 * price.
 *
 * This used to live inside `ListsClient` and return `Record<chain, number>`.
 * A bare number per chain has nowhere to record an exclusion, so every item a
 * store could not price was dropped in silence. The visible effect was a
 * ranking inverted by absence: the store missing the most items showed the
 * smallest total and won the "Best" badge, and the subtotal was labelled with
 * the count of *every* unchecked item regardless of how many actually priced.
 *
 * So the exclusions are part of the return type now. Anything a store cannot
 * price lands in `missing` with the cheapest price we hold elsewhere; anything
 * no store can price — a typed-in item with no product and no custom price —
 * lands in `unlinkedItemIds`. Nothing leaves the calculation without being
 * counted somewhere.
 *
 * On wording: "missing" here means *we have no price for it at that store*,
 * which is not the same claim as the store not stocking it. Sobeys has 187 of
 * 701 products captured, so most absences are gaps in our data, not gaps on
 * the shelf. Anything rendered from `missing` has to say the weaker thing.
 */
import { calculateEffectivePrice } from "@/lib/unit-convert";

// ── Input shapes ───────────────────────────────
// Structural, not imported from the component, so this stays testable without
// dragging React or Prisma in.

export type PricingStoreProduct = {
  currentPrice: number | null;
  store: { chain: string };
};

export type PricingProduct = {
  unitSize: string | null;
  unitMeasure: string | null;
  unitQuantity: number | null;
  storeProducts: PricingStoreProduct[];
};

export type PricingItem = {
  id: string;
  isChecked: boolean;
  quantity: number | null;
  unit: string | null;
  customPrice: number | null;
  product: PricingProduct | null;
};

// ── Output shapes ──────────────────────────────

export type CoveredEntry = {
  itemId: string;
  price: number;
  /**
   * A price the user typed. It is identical at every store, so it adds the
   * same constant to each basket and never decides a comparison.
   */
  viaCustomPrice: boolean;
};

export type Elsewhere = { chain: string; price: number };

export type MissingEntry = {
  itemId: string;
  /** Cheapest price we hold at any *other* store, or null if we hold none. */
  elsewhere: Elsewhere | null;
};

export type StoreBasket = {
  chain: string;
  /** What the items this store can price would cost there. */
  total: number;
  /**
   * The same store restricted to `commonItemIds` — the only figure that is
   * comparable between stores, because it is the only one where the baskets
   * are identical.
   */
  comparableTotal: number;
  covered: CoveredEntry[];
  missing: MissingEntry[];
};

export type CheapestSplit = {
  total: number;
  chains: string[];
  itemCount: number;
};

export type ListPricing = {
  /** Unchecked items only — the same denominator the totals are built from. */
  itemCount: number;
  /** Every preferred chain, ranked first, zero-coverage chains last. */
  baskets: StoreBasket[];
  /** Only the chains that can price something, in rank order. */
  ranked: StoreBasket[];
  /** Items every ranked chain can price. The shared basket. */
  commonItemIds: string[];
  /** No product linked and no custom price — excluded from every store. */
  unlinkedItemIds: string[];
  /**
   * Cheapest per item across the preferred chains, when that needs more than
   * one stop. Null when a single store already achieves it.
   */
  cheapestSplit: CheapestSplit | null;
};

// ── Helpers ────────────────────────────────────

const chainOf = (sp: PricingStoreProduct): string =>
  sp.store?.chain?.toLowerCase() ?? "";

const quantityOf = (item: PricingItem): number => Number(item.quantity ?? 1);

/**
 * What `item` costs at `chain`, or null if we cannot price it there.
 *
 * Takes the cheapest row when a chain has more than one. The old loop added
 * every matching row to the total instead, so a product carried by two
 * locations of the same chain would have been counted twice. Only one location
 * per chain exists today, which is the only reason that never showed up.
 */
export function priceItemAt(item: PricingItem, chain: string): number | null {
  const product = item.product;
  if (!product) return null;

  const target = chain.toLowerCase();
  const qty = quantityOf(item);
  const unit = item.unit ?? "each";

  let best: number | null = null;
  for (const sp of product.storeProducts) {
    if (chainOf(sp) !== target) continue;
    if (sp.currentPrice === null) continue;
    const effective = calculateEffectivePrice(
      Number(sp.currentPrice),
      product.unitQuantity,
      product.unitMeasure,
      product.unitSize,
      qty,
      unit,
    );
    if (effective === null) continue;
    if (best === null || effective < best) best = effective;
  }
  return best;
}

/**
 * Cheapest price for `item` at any store other than `excludeChain`.
 *
 * Deliberately searches the whole catalogue rather than the user's preferred
 * stores: "we have no price for this anywhere" and "Dominion has it for $4.29"
 * are different answers, and the second is worth showing even for a store the
 * user did not pick. The chain is always named, so it cannot be mistaken for a
 * preferred-store price.
 */
export function cheapestElsewhere(
  item: PricingItem,
  excludeChain: string,
): Elsewhere | null {
  const product = item.product;
  if (!product) return null;

  const exclude = excludeChain.toLowerCase();
  const seen = new Set<string>();
  for (const sp of product.storeProducts) {
    const chain = chainOf(sp);
    if (chain && chain !== exclude) seen.add(chain);
  }

  let best: Elsewhere | null = null;
  for (const chain of seen) {
    const price = priceItemAt(item, chain);
    if (price === null) continue;
    if (best === null || price < best.price) best = { chain, price };
  }
  return best;
}

// ── The calculation ────────────────────────────

export function computeListPricing(
  items: PricingItem[],
  preferredChains: string[],
): ListPricing {
  const chains = [...new Set(preferredChains.map((c) => c.toLowerCase()))];
  const active = items.filter((i) => !i.isChecked);

  const unlinkedItemIds = active
    .filter((i) => !i.product && i.customPrice === null)
    .map((i) => i.id);

  const baskets: StoreBasket[] = chains.map((chain) => {
    const covered: CoveredEntry[] = [];
    const missing: MissingEntry[] = [];

    for (const item of active) {
      if (!item.product) {
        // A typed-in item with a price the user set applies at every store.
        // One with no price at all is a list-level gap, not this store's
        // fault, so it is not held against this basket's coverage.
        if (item.customPrice !== null) {
          covered.push({
            itemId: item.id,
            price: item.customPrice * quantityOf(item),
            viaCustomPrice: true,
          });
        }
        continue;
      }

      const price = priceItemAt(item, chain);
      if (price === null) {
        missing.push({
          itemId: item.id,
          elsewhere: cheapestElsewhere(item, chain),
        });
      } else {
        covered.push({ itemId: item.id, price, viaCustomPrice: false });
      }
    }

    const total = covered.reduce((sum, c) => sum + c.price, 0);
    return { chain, total, comparableTotal: 0, covered, missing };
  });

  // Only chains that can price something take part in the shared basket. A
  // chain covering nothing would otherwise empty `commonItemIds` and take the
  // comparison down with it.
  const contributing = baskets.filter((b) => b.covered.length > 0);

  const commonItemIds =
    contributing.length > 0
      ? active
          .map((i) => i.id)
          .filter((id) =>
            contributing.every((b) => b.covered.some((c) => c.itemId === id)),
          )
      : [];

  const common = new Set(commonItemIds);
  for (const basket of baskets) {
    basket.comparableTotal = basket.covered
      .filter((c) => common.has(c.itemId))
      .reduce((sum, c) => sum + c.price, 0);
  }

  // Rank on the shared basket when there is one — it is the only comparison
  // where the stores are being asked the same question. With no shared basket
  // there is nothing honest to compare on, so fall back to coverage and let
  // price break the tie.
  const ranked = [...contributing].sort((a, b) => {
    if (commonItemIds.length > 0) {
      return (
        a.comparableTotal - b.comparableTotal ||
        a.total - b.total ||
        a.chain.localeCompare(b.chain)
      );
    }
    return (
      b.covered.length - a.covered.length ||
      a.total - b.total ||
      a.chain.localeCompare(b.chain)
    );
  });

  const empty = baskets
    .filter((b) => b.covered.length === 0)
    .sort((a, b) => a.chain.localeCompare(b.chain));

  return {
    itemCount: active.length,
    baskets: [...ranked, ...empty],
    ranked,
    commonItemIds,
    unlinkedItemIds,
    cheapestSplit: computeCheapestSplit(active, chains),
  };
}

/**
 * Cheapest price per item across the preferred chains, and how many stores
 * that takes. Returned only when it needs more than one stop, since otherwise
 * it is just the winning store's total said twice.
 */
function computeCheapestSplit(
  active: PricingItem[],
  chains: string[],
): CheapestSplit | null {
  const used = new Set<string>();
  let total = 0;
  let itemCount = 0;

  for (const item of active) {
    if (!item.product) {
      // Costs the same wherever you go, so it adds no stop.
      if (item.customPrice !== null) {
        total += item.customPrice * quantityOf(item);
        itemCount += 1;
      }
      continue;
    }

    let bestChain: string | null = null;
    let bestPrice = Infinity;
    for (const chain of chains) {
      const price = priceItemAt(item, chain);
      if (price !== null && price < bestPrice) {
        bestPrice = price;
        bestChain = chain;
      }
    }
    if (bestChain === null) continue;

    used.add(bestChain);
    total += bestPrice;
    itemCount += 1;
  }

  if (used.size < 2) return null;
  return { total, chains: [...used].sort(), itemCount };
}
