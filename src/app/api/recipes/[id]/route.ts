import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

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
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  // Only the creator can edit
  if (recipe.userId !== user!.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    title,
    description,
    imageUrl,
    prepTime,
    cookTime,
    servings,
    instructions,
    ingredients,
  } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Update recipe fields + replace all ingredients
  const updated = await prisma.recipe.update({
    where: { id },
    data: {
      title: title.trim(),
      description: description ?? null,
      imageUrl: imageUrl ?? null,
      prepTime: prepTime ?? null,
      cookTime: cookTime ?? null,
      servings: servings ?? null,
      instructions: instructions ?? null,
      // Replace all ingredients
      ingredients: {
        deleteMany: {},
        create: (ingredients ?? []).map(
          (
            ing: {
              name: string;
              quantity?: number | null;
              unit?: string | null;
              notes?: string | null;
              isOptional?: boolean;
              sortOrder?: number;
            },
            index: number,
          ) => ({
            name: ing.name,
            quantity: ing.quantity ?? null,
            unit: ing.unit ?? null,
            notes: ing.notes ?? null,
            isOptional: ing.isOptional ?? false,
            sortOrder: ing.sortOrder ?? index,
          }),
        ),
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
