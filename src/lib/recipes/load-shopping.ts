import { prisma } from "@/lib/prisma";
import {
  planRecipeShopping,
  type RecipeShopping,
  type ShoppingProduct,
} from "@/lib/recipes/recipe-shopping";

/**
 * The database side of `planRecipeShopping`: the shopper's pantry and stores,
 * and every priced member of the groups the recipes' ingredients are bought
 * as. Shared by the recipe page and the recipes index, so "Add to list" adds
 * the same products from both — the index used to add plain text.
 *
 * Reads stored groups only. Matching ingredients to groups is a model call,
 * made when a recipe is saved or first opened (`ensureIngredientGroups`);
 * an ingredient not matched yet is planned as unpriced, not matched here.
 */

/** Store rows with a live price, shaped for pricing. */
const pricedRows = {
  where: { isActive: true, currentPrice: { not: null } },
  select: {
    currentPrice: true,
    isSale: true,
    store: { select: { name: true, chain: true } },
  },
} as const;

/** Select a recipe ingredient's linked product with this, so it can be planned. */
export const plannableProductSelect = {
  id: true,
  name: true,
  brand: true,
  unitSize: true,
  unitQuantity: true,
  unitMeasure: true,
  storeProducts: pricedRows,
} as const;

type PricedProduct = {
  id: string;
  name: string;
  brand: string | null;
  unitSize: string | null;
  unitQuantity: unknown;
  unitMeasure: string | null;
  storeProducts: {
    currentPrice: unknown;
    isSale: boolean;
    store: { name: string; chain: string };
  }[];
};

export type PlannableRecipe = {
  id: string;
  ingredients: {
    id: string;
    name: string;
    quantity: unknown;
    unit: string | null;
    productId: string | null;
    groupSlug: string | null;
    product: PricedProduct | null;
  }[];
};

export type RecipePlan = RecipeShopping & {
  /** By ingredient id. A fuzzy name match against the shopper's pantry. */
  inPantry: Map<string, boolean>;
};

function toShoppingProduct(p: PricedProduct): ShoppingProduct {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    unitSize: p.unitSize,
    unitQuantity: p.unitQuantity ? Number(p.unitQuantity) : null,
    unitMeasure: p.unitMeasure,
    prices: p.storeProducts.map((sp) => ({
      price: Number(sp.currentPrice),
      isSale: sp.isSale,
      storeName: sp.store.name,
      chain: sp.store.chain.toLowerCase(),
    })),
  };
}

/** Plans every recipe given, with one query each for pantry, groups and stores. */
export async function planRecipesForUser(
  userId: string,
  recipes: PlannableRecipe[],
): Promise<Map<string, RecipePlan>> {
  const plans = new Map<string, RecipePlan>();
  if (recipes.length === 0) return plans;

  const pantryItems = await prisma.pantryItem.findMany({
    where: { userId },
    select: { name: true },
  });
  const pantryNames = pantryItems.map((p) => p.name.toLowerCase());
  const isInPantry = (name: string) => {
    const nameLower = name.toLowerCase();
    return pantryNames.some((p) => p.includes(nameLower) || nameLower.includes(p));
  };

  const slugs = [
    ...new Set(
      recipes.flatMap((r) =>
        r.ingredients
          .filter((i) => !i.productId && i.groupSlug)
          .map((i) => i.groupSlug as string),
      ),
    ),
  ];
  const members = slugs.length
    ? await prisma.product.findMany({
        where: { isActive: true, subcategory: { in: slugs } },
        select: { ...plannableProductSelect, subcategory: true },
      })
    : [];
  const membersByGroup = new Map<string, ShoppingProduct[]>();
  for (const m of members) {
    if (m.storeProducts.length === 0) continue;
    const slug = m.subcategory as string;
    membersByGroup.set(slug, [...(membersByGroup.get(slug) ?? []), toShoppingProduct(m)]);
  }

  // The shopper's stores, as the list page uses them. With none chosen, price
  // at every active store rather than show nothing.
  const preferred = await prisma.userPreferredStore.findMany({
    where: { userId },
    select: { store: { select: { chain: true } } },
  });
  const chains = preferred.length
    ? preferred.map((p) => p.store.chain.toLowerCase())
    : (
        await prisma.store.findMany({
          where: { isActive: true },
          select: { chain: true },
          distinct: ["chain"],
        })
      ).map((s) => s.chain.toLowerCase());

  for (const recipe of recipes) {
    const inPantry = new Map(
      recipe.ingredients.map((ing) => [ing.id, isInPantry(ing.name)] as const),
    );
    const plan = planRecipeShopping(
      recipe.ingredients.map((ing) => ({
        id: ing.id,
        name: ing.name,
        quantity: ing.quantity ? Number(ing.quantity) : null,
        unit: ing.unit ?? null,
        inPantry: inPantry.get(ing.id) ?? false,
        linked:
          ing.product && ing.product.storeProducts.length > 0
            ? toShoppingProduct(ing.product)
            : null,
        groupSlug: ing.groupSlug,
      })),
      membersByGroup,
      chains,
    );
    plans.set(recipe.id, { ...plan, inPantry });
  }
  return plans;
}
