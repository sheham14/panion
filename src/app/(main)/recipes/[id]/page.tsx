import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import RecipeDetailClient from "@/components/recipes/RecipeDetailClient";
import { GUEST_RECIPE_DETAILS } from "@/lib/guest-data";

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
  estimatedTotal: number | null;
  hasUnlinkedIngredients: boolean;
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

  const { user, error } = await getAuthenticatedUser();
  if (!user) redirect("/signin");

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            include: {
              storeProducts: {
                include: { store: true },
                orderBy: { currentPrice: "asc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!recipe || !recipe.isActive) redirect("/lists");

  // Pantry match — fuzzy case-insensitive contains (no-op until pantry is built)
  const pantryItems = await prisma.pantryItem.findMany({
    where: { userId: user.id },
    select: { name: true },
  });
  const pantryNames = pantryItems.map((p) => p.name.toLowerCase());

  const ingredients: SerializedIngredient[] = recipe.ingredients.map((ing) => {
    const best = ing.product?.storeProducts[0];
    const nameLower = ing.name.toLowerCase();
    const inPantry = pantryNames.some(
      (p) => p.includes(nameLower) || nameLower.includes(p),
    );
    return {
      id: ing.id,
      name: ing.name,
      quantity: ing.quantity ? Number(ing.quantity) : null,
      unit: ing.unit ?? null,
      notes: ing.notes ?? null,
      isOptional: ing.isOptional,
      productId: ing.productId ?? null,
      inPantry,
      bestPrice: best ? Number(best.currentPrice) : null,
      bestStore: best?.store?.name ?? null,
      productUnitQuantity: ing.product?.unitQuantity
        ? Number(ing.product.unitQuantity)
        : null,
      productUnitMeasure: ing.product?.unitMeasure ?? null,
      productUnitSize: ing.product?.unitSize ?? null,
    };
  });

  const linkedPrices = ingredients.filter((i) => i.bestPrice !== null);
  const estimatedTotal =
    linkedPrices.length > 0
      ? linkedPrices.reduce((sum, i) => sum + (i.bestPrice ?? 0), 0)
      : null;

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
    estimatedTotal,
    hasUnlinkedIngredients: ingredients.some((i) => !i.productId),
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
