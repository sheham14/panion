// The logged-out preview, built from real catalogue products (`showcase.ts`).
//
// This file used to be hand-written fixtures: products from the fabricated
// seed with invented prices, shown under real store names and stamped
// "1 day ago". The seed was deleted from production, so none of those ids had
// a row behind them and every tile fell back to an emoji. Prices, photos and
// price dates now come from the catalogue, and stale prices look stale.
//
// Builders are pure so they can be tested without a database; the loaders at
// the bottom feed them. Recipes need nothing here: guests see the built-in
// recipes (`userId: null`) through the same pages signed-in users do.

import {
  loadShowcase,
  loadShowcaseStores,
  type ShowcaseProduct,
} from "@/lib/showcase";
import {
  summarizeWatchlist,
  type PreferredStoreRow,
} from "@/lib/watchlist-summary";
import type { SerializedPantryItem } from "@/app/(main)/pantry/page";
import { groupLabel, withGroups } from "@/lib/list-groups";

type StoreRow = { id: string; chain: string; name: string };

const DAY = 86_400_000;
const daysFromNow = (now: Date, n: number) => new Date(now.getTime() + n * DAY);

/** How many showcase products the preview watches on the home page. */
const WATCHED = 6;

function preferredRows(stores: StoreRow[]): PreferredStoreRow[] {
  return stores.map((s) => ({ storeId: s.id, store: { chain: s.chain, name: s.name } }));
}

// ─── HOME ────────────────────────────────────────────────────────────────────

export function buildGuestHome(products: ShowcaseProduct[], stores: StoreRow[]) {
  const watched = products.slice(0, WATCHED).map((product, i) => ({
    id: `guest-w${i + 1}`,
    notifyOnDrop: i < 3,
    notifyOnRise: false,
    product: { ...product, category: product.category ?? null },
  }));
  return summarizeWatchlist(watched, preferredRows(stores));
}

// ─── LIST ────────────────────────────────────────────────────────────────────

const GUEST_LIST_ID = "guest-list-1";

/**
 * Groups the preview lists as "any of" rather than one product, so it shows
 * each store's own best buy — the way a recipe adds them.
 */
const ANY_OF_GROUPS = new Set(["large-eggs"]);

/**
 * Every showcase product, plus one typed-in item with no product behind it.
 * Real lists grow those, and they are why the list total has a "not counted"
 * bucket, so the preview carries one. Each item keeps its group; the ones in
 * `ANY_OF_GROUPS` are "any of" it, and `getGuestList` prices them.
 */
export function buildGuestList(products: ShowcaseProduct[], now: Date) {
  const timestamps = {
    createdAt: daysFromNow(now, -3),
    updatedAt: daysFromNow(now, -1),
  };
  const linked = products.map((product, i) => {
    const anyOf = !!product.subcategory && ANY_OF_GROUPS.has(product.subcategory);
    return {
    id: `guest-item-${i + 1}`,
    listId: GUEST_LIST_ID,
    productId: anyOf ? null : product.id,
    groupSlug: product.subcategory,
    name: anyOf ? groupLabel(product.subcategory!) : product.name,
    quantity: 1,
    unit: null,
    notes: null,
    customPrice: null,
    isChecked: false,
    sortOrder: i,
    ...timestamps,
    product: anyOf ? null : product,
    };
  });
  const unlinked = {
    id: "guest-item-unlinked",
    listId: GUEST_LIST_ID,
    productId: null,
    groupSlug: null,
    name: "Birthday candles",
    quantity: 1,
    unit: null,
    notes: null,
    customPrice: null,
    isChecked: false,
    sortOrder: linked.length,
    ...timestamps,
    product: null,
  };
  return {
    id: GUEST_LIST_ID,
    name: "Weekly Shop",
    userId: "guest",
    ...timestamps,
    items: [...linked, unlinked],
  };
}

// ─── PANTRY ──────────────────────────────────────────────────────────────────

/**
 * What the preview pantry holds, by group, with the details a real pantry
 * would carry: one item close to expiry, and items of different ages.
 */
const PANTRY = [
  { group: "2-percent-milk", quantity: 1, unit: "L", expiresIn: 2, addedAgo: 5 },
  { group: "large-eggs", quantity: 6, unit: null, expiresIn: 12, addedAgo: 8 },
  { group: "salted-butter", quantity: 1, unit: null, expiresIn: 40, addedAgo: 21 },
  { group: "block-cheddar-cheese", quantity: 1, unit: null, expiresIn: 18, addedAgo: 10 },
  { group: "spaghetti-pasta", quantity: 500, unit: "g", expiresIn: null, addedAgo: 60 },
  { group: "ground-coffee", quantity: 1, unit: null, expiresIn: null, addedAgo: 14 },
] as const;

export function buildGuestPantry(
  products: ShowcaseProduct[],
  now: Date,
): SerializedPantryItem[] {
  const byGroup = new Map(products.map((p) => [p.subcategory, p]));
  return PANTRY.flatMap((entry, i) => {
    const product = byGroup.get(entry.group);
    if (!product) return [];
    const createdAt = daysFromNow(now, -entry.addedAgo);
    return [
      {
        id: `guest-pantry-${i + 1}`,
        name: product.name,
        brand: product.brand,
        category: product.category ?? null,
        quantity: entry.quantity,
        unit: entry.unit,
        productId: product.id,
        imageUrl: product.imageUrl,
        expiresAt:
          entry.expiresIn === null ? null : daysFromNow(now, entry.expiresIn).toISOString(),
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        addedFrom: "manual",
      },
    ];
  });
}

// ─── LOADERS ─────────────────────────────────────────────────────────────────

export async function getGuestHome() {
  const [products, stores] = await Promise.all([loadShowcase(), loadShowcaseStores()]);
  return buildGuestHome(products, stores);
}

export async function getGuestList() {
  const [products, stores] = await Promise.all([loadShowcase(), loadShowcaseStores()]);
  const list = buildGuestList(products, new Date());
  return {
    list: { ...list, items: await withGroups(list.items) },
    preferredStores: stores.map((s) => ({ chain: s.chain, name: s.name })),
  };
}

export async function getGuestPantry() {
  return buildGuestPantry(await loadShowcase(), new Date());
}

/** The preview pantry as Clove is told it, so the chat and the page agree. */
export async function getGuestPantryForClove() {
  return (await getGuestPantry()).map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
  }));
}
