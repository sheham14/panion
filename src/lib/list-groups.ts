import { prisma } from "@/lib/prisma";
import { parseQuantity, type UnitBasis } from "@/lib/unit-price";
import { label } from "@/lib/recipes/recipe-shopping";

/**
 * List items bought as a group: "large eggs", not one carton of one brand.
 *
 * A list item used to link one product, so an item added as Great Value cream
 * cheese priced at Walmart only, and changing it meant searching again every
 * time. An item with a `groupSlug` and no `productId` is now "any of these",
 * and each store prices it with its own best buy from the group.
 *
 * Best buy is decided over the same amount at every store — the group's
 * typical size — in whole packages. Picking each store's cheapest package
 * would compare a 6-pack at one store with an 18-pack at another and hand
 * "Best" to whichever sells the smallest box (CLAUDE.md rule 12: compare like
 * with like). A product whose size can't be worked out has no defensible
 * place in that comparison, so it is left out rather than guessed at.
 *
 * The result is shaped like a linked product with one store row per chain,
 * so `computeListPricing()` and the list UI price it with no special case.
 */

/** Past this many packages a size is more likely misread than real. */
const MAX_PACKS = 6;

/** Products offered when the shopper picks a specific one. */
const MAX_CHOICES = 8;

type Size = { qty: number; basis: UnitBasis };

export type GroupMember = {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  unitSize: string | null;
  unitQuantity: unknown;
  unitMeasure: string | null;
  storeProducts: {
    id: string;
    currentPrice: unknown;
    isSale: boolean;
    store: { id: string; chain: string; name: string };
  }[];
};

/** One store's best buy, as a store row the list already knows how to price. */
export type GroupStoreRow = {
  id: string;
  currentPrice: number;
  isActive: true;
  isSale: boolean;
  store: { id: string; chain: string; name: string };
  /** What to buy there to get the reference amount. */
  pick: { productId: string; label: string; packs: number; unitSize: string | null };
};

export type GroupProduct = {
  /** A real member, so a photo or a product link has something to point at. */
  id: string;
  name: string;
  brand: null;
  imageUrl: string | null;
  unitSize: null;
  unitMeasure: null;
  unitQuantity: null;
  storeProducts: GroupStoreRow[];
};

export type GroupChoice = {
  id: string;
  name: string;
  brand: string | null;
  unitSize: string | null;
  bestPrice: number | null;
  bestStore: string | null;
};

export type ItemGroup = {
  slug: string;
  label: string;
  /** The amount every store is priced for, e.g. "454 g"; null when unknown. */
  reference: string | null;
  /** Members to pick from, best value first. */
  choices: GroupChoice[];
};

// ── Sizes ──────────────────────────────────────

/** "N eggs" and friends, which the shared parser does not read from names. */
const COUNT_IN_NAME = /(\d+)\s*(?:eggs?|count|ct|pack|pk|ea)\b/i;

/**
 * A member's size: the structured columns, then the size text, then the name.
 * Many products only state their size in the name ("White Eggs Large 12
 * Count"), and Voilà's "12 per pack" is a count, not a per-unit price.
 */
export function sizeOf(m: Pick<GroupMember, "name" | "unitSize" | "unitQuantity" | "unitMeasure">): Size | null {
  if (m.unitQuantity && m.unitMeasure) {
    const s = parseQuantity(`${Number(m.unitQuantity)} ${m.unitMeasure}`);
    if (s) return s;
  }
  for (const raw of [m.unitSize, m.name]) {
    const s = parseQuantity(raw);
    if (s) return s;
  }
  const count = m.name.match(COUNT_IN_NAME) ?? m.unitSize?.match(/(\d+)\s*per\s+pack/i);
  return count ? { qty: Number(count[1]), basis: "unit" } : null;
}

/**
 * The amount a group item is priced for: the median size among members, in
 * the group's most common measure. The lower median, so it is a size that is
 * actually sold.
 */
export function referenceSize(members: GroupMember[]): Size | null {
  const sizes = members.map(sizeOf).filter((s): s is Size => s !== null);
  if (sizes.length === 0) return null;
  const counts = new Map<UnitBasis, number>();
  for (const s of sizes) counts.set(s.basis, (counts.get(s.basis) ?? 0) + 1);
  const basis = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const qtys = sizes
    .filter((s) => s.basis === basis)
    .map((s) => s.qty)
    .sort((a, b) => a - b);
  return { qty: qtys[Math.floor((qtys.length - 1) / 2)], basis };
}

export function describeSize(size: Size): string {
  const n = (x: number) => String(Math.round(x * 100) / 100);
  if (size.basis === "g") return size.qty >= 1000 ? `${n(size.qty / 1000)} kg` : `${n(size.qty)} g`;
  if (size.basis === "ml") return size.qty >= 1000 ? `${n(size.qty / 1000)} L` : `${n(size.qty)} ml`;
  return `${n(size.qty)} count`;
}

export const groupLabel = (slug: string): string => {
  const words = slug.replace(/-/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// ── Best buys ──────────────────────────────────

/**
 * Packages of `member` needed to cover `reference`, or null when the member
 * can't take part: no size, a different measure, or an implausible count.
 * With no reference at all, every member is one package.
 */
function packsFor(member: GroupMember, reference: Size | null): number | null {
  if (!reference) return 1;
  const size = sizeOf(member);
  if (!size || size.basis !== reference.basis || size.qty <= 0) return null;
  const packs = Math.ceil(reference.qty / size.qty - 1e-9);
  return packs <= MAX_PACKS ? packs : null;
}

/** Each chain's cheapest way to buy the reference amount from the group. */
export function bestBuysByChain(
  members: GroupMember[],
  reference: Size | null,
): Map<string, GroupStoreRow> {
  const best = new Map<string, GroupStoreRow>();
  for (const member of members) {
    const packs = packsFor(member, reference);
    if (packs === null) continue;
    for (const row of member.storeProducts) {
      if (row.currentPrice === null || row.currentPrice === undefined) continue;
      const chain = row.store.chain.toLowerCase();
      const cost = Math.round(Number(row.currentPrice) * packs * 100) / 100;
      const current = best.get(chain);
      if (
        current &&
        (current.currentPrice < cost ||
          (current.currentPrice === cost && current.pick.productId <= member.id))
      ) {
        continue;
      }
      best.set(chain, {
        id: row.id,
        currentPrice: cost,
        isActive: true,
        isSale: row.isSale,
        store: row.store,
        pick: { productId: member.id, label: label(member), packs, unitSize: member.unitSize },
      });
    }
  }
  return best;
}

/** The group as a product with one store row per chain, or null if nothing prices. */
export function groupProduct(slug: string, members: GroupMember[]): GroupProduct | null {
  const rows = [...bestBuysByChain(members, referenceSize(members)).values()].sort(
    (a, b) => a.currentPrice - b.currentPrice,
  );
  if (rows.length === 0) return null;
  const face = members.find((m) => m.id === rows[0].pick.productId) ?? null;
  return {
    id: rows[0].pick.productId,
    name: groupLabel(slug),
    brand: null,
    imageUrl: face?.imageUrl ?? null,
    unitSize: null,
    unitMeasure: null,
    unitQuantity: null,
    storeProducts: rows,
  };
}

/** The group's members to pick from: comparable sizes by unit price, then the rest. */
export function describeGroup(slug: string, members: GroupMember[]): ItemGroup {
  const reference = referenceSize(members);
  const ranked = members
    .map((m) => {
      const prices = m.storeProducts
        .filter((sp) => sp.currentPrice !== null && sp.currentPrice !== undefined)
        .map((sp) => ({ price: Number(sp.currentPrice), chain: sp.store.chain }));
      const cheapest = prices.reduce<{ price: number; chain: string } | null>(
        (a, b) => (a === null || b.price < a.price ? b : a),
        null,
      );
      const size = sizeOf(m);
      const perUnit =
        cheapest && size && reference && size.basis === reference.basis
          ? cheapest.price / size.qty
          : Infinity;
      return { m, cheapest, perUnit };
    })
    .filter((r) => r.cheapest !== null)
    .sort((a, b) => a.perUnit - b.perUnit || a.cheapest!.price - b.cheapest!.price);

  return {
    slug,
    label: groupLabel(slug),
    reference: reference ? describeSize(reference) : null,
    choices: ranked.slice(0, MAX_CHOICES).map(({ m, cheapest }) => ({
      id: m.id,
      name: label(m),
      brand: m.brand,
      unitSize: m.unitSize,
      bestPrice: cheapest!.price,
      bestStore: cheapest!.chain,
    })),
  };
}

// ── Loading ────────────────────────────────────

/** Priced members of each group, one query. */
export async function loadGroupMembers(slugs: string[]): Promise<Map<string, GroupMember[]>> {
  const byGroup = new Map<string, GroupMember[]>();
  if (slugs.length === 0) return byGroup;
  const members = await prisma.product.findMany({
    where: { isActive: true, subcategory: { in: slugs } },
    select: {
      id: true,
      name: true,
      brand: true,
      imageUrl: true,
      unitSize: true,
      unitQuantity: true,
      unitMeasure: true,
      subcategory: true,
      storeProducts: {
        where: { isActive: true, currentPrice: { not: null } },
        select: {
          id: true,
          currentPrice: true,
          isSale: true,
          store: { select: { id: true, chain: true, name: true } },
        },
      },
    },
  });
  for (const m of members) {
    if (m.storeProducts.length === 0) continue;
    const slug = m.subcategory as string;
    byGroup.set(slug, [...(byGroup.get(slug) ?? []), m]);
  }
  return byGroup;
}

/** Whether any active product belongs to the group. */
export async function groupExists(slug: string): Promise<boolean> {
  const found = await prisma.product.findFirst({
    where: { isActive: true, subcategory: slug },
    select: { id: true },
  });
  return found !== null;
}

/**
 * List items with their groups resolved. An item bought as "any of" its group
 * gets the group's per-store best buys as its product; a picked product keeps
 * its own rows. Every group item carries `group`, so the edit sheet can offer
 * the other members.
 */
export async function withGroups<
  T extends { groupSlug: string | null; productId: string | null; product: unknown },
>(items: T[]): Promise<(T & { group: ItemGroup | null })[]> {
  const slugs = [...new Set(items.map((i) => i.groupSlug).filter((s): s is string => !!s))];
  const members = await loadGroupMembers(slugs);
  return items.map((item) => {
    if (!item.groupSlug) return { ...item, group: null };
    const ms = members.get(item.groupSlug) ?? [];
    return {
      ...item,
      product: item.productId ? item.product : groupProduct(item.groupSlug, ms),
      group: describeGroup(item.groupSlug, ms),
    };
  });
}
