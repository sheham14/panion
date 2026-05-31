import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

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
  const { user, error } = await (
    await import("@/lib/auth-utils")
  ).getAuthenticatedUser();
  if (error) return error;

  const body = await request.json();
  const {
    title,
    description,
    prepTime,
    cookTime,
    servings,
    instructions,
    ingredients,
  } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const recipe = await prisma.recipe.create({
    data: {
      title,
      userId: user!.id,
      description: description ?? null,
      prepTime: prepTime ?? null,
      cookTime: cookTime ?? null,
      servings: servings ?? null,
      instructions: instructions ?? null,
      ingredients: {
        create:
          ingredients?.map(
            (
              ing: {
                productId?: string;
                name: string;
                quantity?: number;
                unit?: string;
                notes?: string;
                isOptional?: boolean;
                sortOrder?: number;
              },
              index: number,
            ) => ({
              productId: ing.productId ?? null,
              name: ing.name,
              quantity: ing.quantity ?? null,
              unit: ing.unit ?? null,
              notes: ing.notes ?? null,
              isOptional: ing.isOptional ?? false,
              sortOrder: ing.sortOrder ?? index,
            }),
          ) ?? [],
      },
    },
    include: { ingredients: true },
  });

  return NextResponse.json(recipe, { status: 201 });
}
