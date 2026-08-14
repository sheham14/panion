import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { validateBody } from "@/lib/validate";
import { notFound, forbidden } from "@/lib/api-error";
import { recipeFields, toIngredientCreate } from "../route";

const UpdateRecipeSchema = z.object(recipeFields);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: {
        include: {
          product: {
            include: {
              storeProducts: {
                where: { isActive: true },
                include: {
                  store: { select: { id: true, chain: true, name: true } },
                },
                orderBy: { currentPrice: "asc" },
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!recipe || !recipe.isActive) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  // Only owner or system recipes are accessible
  if (recipe.userId !== null && recipe.userId !== user.id) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  // Calculate estimated cost — sum of cheapest store price per ingredient
  let estimatedCost = 0;
  for (const ing of recipe.ingredients) {
    if (ing.product?.storeProducts?.[0]?.currentPrice) {
      estimatedCost += Number(ing.product.storeProducts[0].currentPrice);
    }
  }

  return NextResponse.json({
    ...recipe,
    estimatedCost: Math.round(estimatedCost * 100) / 100,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;

  const recipe = await prisma.recipe.findUnique({ where: { id } });
  if (!recipe || !recipe.isActive) {
    return notFound("Recipe not found");
  }

  // Only the creator can edit
  if (recipe.userId !== user.id) {
    return forbidden();
  }

  const { data, error: invalid } = await validateBody(request, UpdateRecipeSchema);
  if (invalid) return invalid;

  // Update recipe fields + replace all ingredients.
  //
  // The ingredient map previously omitted `productId`, so every edit silently
  // severed the link to the canonical Product — which is what powers cost
  // estimation. Cost-per-serving quietly broke after the first edit (audit M4).
  // `toIngredientCreate` is shared with POST so the two can't diverge again.
  const updated = await prisma.recipe.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description ?? null,
      imageUrl: data.imageUrl ?? null,
      prepTime: data.prepTime ?? null,
      cookTime: data.cookTime ?? null,
      servings: data.servings ?? null,
      instructions: (data.instructions ?? null) as never,
      ingredients: {
        deleteMany: {},
        create: (data.ingredients ?? []).map(toIngredientCreate),
      },
    },
    include: { ingredients: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json({
    ...updated,
    ingredients: updated.ingredients.map((ing) => ({
      ...ing,
      quantity: ing.quantity ? Number(ing.quantity) : null,
    })),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;

  const recipe = await prisma.recipe.findUnique({ where: { id } });
  if (!recipe || !recipe.isActive) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  if (recipe.userId !== user!.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.recipe.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}
