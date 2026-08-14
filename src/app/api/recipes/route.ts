import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import {
  validateBody,
  boundedString,
  idSchema,
  quantitySchema,
  MAX_NAME_LENGTH,
} from "@/lib/validate";

/** One ingredient. `productId` is what powers cost-per-serving. */
export const ingredientSchema = z.object({
  productId: idSchema.nullish(),
  name: boundedString(MAX_NAME_LENGTH),
  quantity: quantitySchema.nullish(),
  unit: z.string().trim().max(32).nullish(),
  notes: z.string().trim().max(200).nullish(),
  isOptional: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(500).optional(),
});

/** Shared by POST here and PATCH on `[id]` so the two can't drift. */
export const recipeFields = {
  title: boundedString(200),
  description: z.string().trim().max(4000).nullish(),
  imageUrl: z.string().url().max(2048).nullish(),
  prepTime: z.number().int().min(0).max(10_000).nullish(),
  cookTime: z.number().int().min(0).max(10_000).nullish(),
  servings: z.number().int().min(1).max(100).nullish(),
  instructions: z.unknown().nullish(),
  ingredients: z.array(ingredientSchema).max(100).optional(),
};

const CreateRecipeSchema = z.object(recipeFields);

/** Maps a validated ingredient onto the Prisma create shape. */
export const toIngredientCreate = (
  ing: z.infer<typeof ingredientSchema>,
  index: number,
) => ({
  productId: ing.productId ?? null,
  name: ing.name,
  quantity: ing.quantity ?? null,
  unit: ing.unit ?? null,
  notes: ing.notes ?? null,
  isOptional: ing.isOptional ?? false,
  sortOrder: ing.sortOrder ?? index,
});

export async function GET(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const maxTime = searchParams.get("maxTime");

  const recipes = await prisma.recipe.findMany({
    where: {
      isActive: true,
      // Only the user's own recipes + system recipes (userId: null)
      OR: [{ userId: user.id }, { userId: null }],
      ...(q && {
        AND: [
          {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          },
        ],
      }),
      ...(maxTime && {
        prepTime: { lte: parseInt(maxTime) },
        cookTime: { lte: parseInt(maxTime) },
      }),
    },
    include: {
      ingredients: {
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { ingredients: true } },
    },
    orderBy: { title: "asc" },
  });

  return NextResponse.json(
    recipes.map((recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.map((ing) => ({
        ...ing,
        quantity: ing.quantity ? Number(ing.quantity) : null,
      })),
    })),
  );
}

export async function POST(request: NextRequest) {
  // Was a dynamic `await import("@/lib/auth-utils")` mid-function even though
  // the static import is right at the top of the file (audit L2).
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { data, error: invalid } = await validateBody(request, CreateRecipeSchema);
  if (invalid) return invalid;

  const recipe = await prisma.recipe.create({
    data: {
      title: data.title,
      userId: user.id,
      description: data.description ?? null,
      imageUrl: data.imageUrl ?? null,
      prepTime: data.prepTime ?? null,
      cookTime: data.cookTime ?? null,
      servings: data.servings ?? null,
      instructions: (data.instructions ?? null) as never,
      ingredients: {
        create: (data.ingredients ?? []).map(toIngredientCreate),
      },
    },
    include: { ingredients: true },
  });

  return NextResponse.json(recipe, { status: 201 });
}
