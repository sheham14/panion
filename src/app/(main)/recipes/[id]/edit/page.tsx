import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, redirectToSignIn } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import RecipeForm from "@/components/recipes/RecipeForm";
import type { RecipeFormData } from "@/components/recipes/RecipeForm";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, error } = await getAuthenticatedUser();
  if (error) redirectToSignIn();

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!recipe || !recipe.isActive) redirect("/lists");

  // Only the creator can edit — seeded recipes (userId: null) are view-only
  if (recipe.userId !== user!.id) redirect(`/recipes/${id}`);

  function parseSteps(
    value: unknown,
  ): { id: string; text: string; timerMinutes: string }[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (s): s is Record<string, unknown> =>
          typeof s === "object" && s !== null,
      )
      .map((s, i) => ({
        id: `existing-${i}`,
        text: typeof s.text === "string" ? s.text : "",
        timerMinutes:
          typeof s.timerMinutes === "number" ? String(s.timerMinutes) : "",
      }));
  }

  const initial: RecipeFormData = {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description ?? "",
    imageUrl: recipe.imageUrl ?? "",
    prepTime: recipe.prepTime != null ? String(recipe.prepTime) : "",
    cookTime: recipe.cookTime != null ? String(recipe.cookTime) : "",
    servings: recipe.servings != null ? String(recipe.servings) : "",
    ingredients: recipe.ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      quantity: ing.quantity != null ? String(Number(ing.quantity)) : "",
      unit: ing.unit ?? "",
      notes: ing.notes ?? "",
      isOptional: ing.isOptional,
    })),
    steps: parseSteps(recipe.instructions),
  };

  return <RecipeForm initial={initial} mode="edit" />;
}
