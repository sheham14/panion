import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import RecipeDetailClient from "@/components/recipes/RecipeDetailClient";
import { GUEST_RECIPE_DETAILS } from "@/lib/guest-data";
import { ensureIngredientGroups } from "@/lib/recipes/match-ingredients";
import type { IngredientPick } from "@/lib/recipes/recipe-shopping";
import {
  planRecipesForUser,
  plannableProductSelect,
} from "@/lib/recipes/load-shopping";

export type RecipeStep = { text: string; timerMinutes: number | null };

export type SerializedIngredient = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  isOptional: boolean;
  productId: string | null;
  inPantry: boolean;
  bestPrice: number | null;
  bestStore: string | null;
  productUnitQuantity: number | null;
  productUnitMeasure: string | null;
  productUnitSize: string | null;
  /** The cheapest way to buy it at the shopper's stores. Absent for guests. */
  pick?: IngredientPick | null;
};

/**
 * What the recipe costs per store, for the ingredients not already in the
 * pantry. Every store states its own coverage (CLAUDE.md rule 12).
 */
export type RecipeShoppingSummary = {
  /** Ingredients being bought: everything not in the pantry. */
  itemCount: number;
  pantryCount: number;
  stores: {
    chain: string;
    total: number;
    covered: number;
    isBest: boolean;
    /** Ingredients this store has no price for. */
    missing: string[];
  }[];
  /** Ingredients with no price at any store. */
  unpriced: string[];
};

export type RecipeDetailData = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  prepTime: number | null;
  cookTime: number | null;
  servings: number;
  steps: RecipeStep[];
  ingredients: SerializedIngredient[];
  shopping?: RecipeShoppingSummary | null;
};

function parseSteps(value: unknown): RecipeStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (s): s is Record<string, unknown> => typeof s === "object" && s !== null,
    )
    .map((s) => ({
      text: typeof s.text === "string" ? s.text : "",
      timerMinutes: typeof s.timerMinutes === "number" ? s.timerMinutes : null,
    }));
}

async function RecipeDetail({ id }: { id: string }) {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get("panion-guest")?.value === "1";

  if (isGuest) {
    const guestRecipe = GUEST_RECIPE_DETAILS[id];
    if (!guestRecipe) redirect("/recipes");
    return <RecipeDetailClient recipe={guestRecipe} isOwner={false} />;
  }

  const { user } = await getAuthenticatedUser();
  if (!user) redirect("/signin");

  // Recipes saved before ingredient matching existed are matched on first
  // view, once. Every later view reads the stored groups.
  const head = await prisma.recipe.findUnique({
    where: { id },
    select: { isActive: true, ingredientsMatchedAt: true, userId: true },
  });
  if (!head || !head.isActive) redirect("/lists");
  // The owner's recipes and the built-in ones only, as `GET /api/recipes/[id]`
  // already enforces. The page didn't, so anyone with a link could read
  // someone else's recipe.
  if (head.userId !== null && head.userId !== user.id) redirect("/recipes");
  if (!head.ingredientsMatchedAt) await ensureIngredientGroups(id);

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: {
        orderBy: { sortOrder: "asc" },
        include: { product: { select: plannableProductSelect } },
      },
    },
  });

  if (!recipe || !recipe.isActive) redirect("/lists");

  const plan = (await planRecipesForUser(user.id, [recipe])).get(recipe.id)!;
  const { picks, pricing, inPantry: inPantryById } = plan;

  const ingredients: SerializedIngredient[] = recipe.ingredients.map((ing) => {
    const pick = picks[ing.id] ?? null;
    return {
      id: ing.id,
      name: ing.name,
      quantity: ing.quantity ? Number(ing.quantity) : null,
      unit: ing.unit ?? null,
      notes: ing.notes ?? null,
      isOptional: ing.isOptional,
      // A group pick stands in for a link, so Add to list carries a real
      // product either way.
      productId: ing.productId ?? pick?.productId ?? null,
      inPantry: inPantryById.get(ing.id) ?? false,
      bestPrice: pick?.cost ?? null,
      bestStore: pick?.storeName ?? null,
      productUnitQuantity: pick?.unitQuantity ?? null,
      productUnitMeasure: pick?.unitMeasure ?? null,
      productUnitSize: pick?.unitSize ?? null,
      pick,
    };
  });

  const nameOf = new Map(recipe.ingredients.map((i) => [i.id, i.name]));
  const shopping: RecipeShoppingSummary = {
    itemCount: pricing.itemCount,
    pantryCount: recipe.ingredients.length - pricing.itemCount,
    stores: pricing.baskets.map((b, i) => ({
      chain: b.chain,
      total: Math.round(b.total * 100) / 100,
      covered: b.covered.length,
      // Only when there is a real comparison: more than one store priced
      // something, and the ranking ran on a shared basket.
      isBest: i === 0 && pricing.ranked.length > 1,
      missing: b.missing.map((m) => nameOf.get(m.itemId) ?? ""),
    })),
    unpriced: pricing.unlinkedItemIds.map((id) => nameOf.get(id) ?? ""),
  };

  const data: RecipeDetailData = {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description ?? null,
    imageUrl: recipe.imageUrl ?? null,
    prepTime: recipe.prepTime ?? null,
    cookTime: recipe.cookTime ?? null,
    servings: recipe.servings ?? 4,
    steps: parseSteps(recipe.instructions),
    ingredients,
    shopping,
  };

  const isOwner = recipe.userId === user.id;

  return <RecipeDetailClient recipe={data} isOwner={isOwner} />;
}

function RecipeDetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-[200px] bg-[#e0e0e0] dark:bg-[#2a3044]" />
      <div className="flex border-b border-[#f0f0f0] dark:border-[#2a3044]">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex-1 py-3 flex flex-col items-center gap-1.5"
          >
            <div className="h-2 w-8 rounded bg-[#f0f0f0] dark:bg-[#2a3044]" />
            <div className="h-3 w-12 rounded bg-[#e8e8e8] dark:bg-[#2e3538]" />
          </div>
        ))}
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-[52px] rounded-xl bg-[#f4f4f4] dark:bg-[#242b2e]"
          />
        ))}
      </div>
    </div>
  );
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<RecipeDetailSkeleton />}>
      <RecipeDetail id={id} />
    </Suspense>
  );
}
