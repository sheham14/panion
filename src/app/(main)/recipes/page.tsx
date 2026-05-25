import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import RecipesClient from "@/components/recipes/RecipesClient";
import { GUEST_RECIPES } from "@/lib/guest-data";

async function getRecipes(userId: string) {
  return prisma.recipe.findMany({
    where: {
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
          product: {
            select: {
              unitQuantity: true,
              unitMeasure: true,
              unitSize: true,
            },
          },
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

  const shapedRecipes = recipes.map((r) => ({
    id: r.id,
    userId: r.userId ?? null,
    title: r.title,
    servings: r.servings ?? 4,
    prepMinutes: r.prepTime,
    cookMinutes: r.cookTime,
    estimatedCost: null,
    ingredients: r.ingredients.map((ing) => ({
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
    })),
  }));

  return (
    <RecipesClient initialRecipes={shapedRecipes} currentUserId={userId} />
  );
}
