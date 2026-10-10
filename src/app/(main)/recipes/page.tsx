import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import RecipesClient from "@/components/recipes/RecipesClient";
import { GUEST_RECIPES } from "@/lib/guest-data";
import { ensureIngredientGroups } from "@/lib/recipes/match-ingredients";
import {
  planRecipesForUser,
  plannableProductSelect,
} from "@/lib/recipes/load-shopping";
import { listItemFor } from "@/lib/recipes/recipe-shopping";

/** Model calls per page view for recipes whose ingredients aren't matched yet. */
const MATCH_PER_VIEW = 3;

async function getRecipes(userId: string) {
  return prisma.recipe.findMany({
    where: {
      // Delete is soft. Without this a deleted recipe came back on reload,
      // and opening it bounced to /lists.
      isActive: true,
      OR: [{ userId }, { userId: null }],
    },
    include: {
      ingredients: {
        select: {
          id: true,
          name: true,
          productId: true,
          quantity: true,
          unit: true,
          groupSlug: true,
          product: { select: plannableProductSelect },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { title: "asc" },
  });
}

export default async function RecipesPage() {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get("panion-guest")?.value === "1";

  if (isGuest) {
    return (
      <RecipesClient initialRecipes={GUEST_RECIPES} currentUserId="" />
    );
  }

  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const userId = session.user.id;
  const recipes = await getRecipes(userId);
  const plans = await planRecipesForUser(userId, recipes);

  // Recipes not matched to product groups yet are matched after the response,
  // a few per view, so the next visit can add products instead of plain text.
  // The recipe page does the same on first open; this covers recipes added
  // and never opened.
  const unmatched = recipes
    .filter((r) => !r.ingredientsMatchedAt && r.ingredients.length > 0)
    .slice(0, MATCH_PER_VIEW)
    .map((r) => r.id);
  if (unmatched.length) {
    after(async () => {
      for (const id of unmatched) {
        try {
          await ensureIngredientGroups(id);
        } catch (err) {
          console.error("[recipes] ingredient matching failed:", err);
        }
      }
    });
  }

  const shapedRecipes = recipes.map((r) => {
    const plan = plans.get(r.id);
    const ingredients = r.ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      productId: ing.productId ?? null,
      quantity: ing.quantity ? Number(ing.quantity) : null,
      unit: ing.unit ?? null,
      productUnitQuantity: ing.product?.unitQuantity
        ? Number(ing.product.unitQuantity)
        : null,
      productUnitMeasure: ing.product?.unitMeasure ?? null,
      productUnitSize: ing.product?.unitSize ?? null,
    }));
    // The same selection the recipe page starts with: what isn't in the
    // pantry. When all of it is, "Add to list" still means "add this recipe".
    const notInPantry = ingredients.filter((ing) => !plan?.inPantry.get(ing.id));
    const toBuy = (notInPantry.length ? notInPantry : ingredients).map((ing) =>
      listItemFor(ing, ing.quantity, plan?.picks[ing.id]),
    );
    return {
      id: r.id,
      userId: r.userId ?? null,
      title: r.title,
      servings: r.servings ?? 4,
      prepMinutes: r.prepTime,
      cookMinutes: r.cookTime,
      estimatedCost: null,
      ingredients,
      toBuy,
    };
  });

  return (
    <RecipesClient initialRecipes={shapedRecipes} currentUserId={userId} />
  );
}
