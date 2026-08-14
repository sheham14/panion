import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import {
  apiError,
  badRequest,
  serverError,
  tooManyRequests,
} from "@/lib/api-error";
import Anthropic from "@anthropic-ai/sdk";

const DAILY_LIMIT = 20;

type ExtractedIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
};

type ExtractedStep = {
  text: string;
  timerMinutes: number | null;
};

type ExtractedRecipe = {
  title?: string;
  description?: string;
  servings?: number;
  prepTime?: number | null;
  cookTime?: number | null;
  ingredients?: ExtractedIngredient[];
  instructions?: ExtractedStep[];
};

export async function POST(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  // Daily rate limit
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const usageCount = await prisma.featureUsage.count({
    where: {
      userId: user.id,
      feature: "extract_recipe",
      usedAt: { gte: startOfDay },
    },
  });

  if (usageCount >= DAILY_LIMIT) {
    return tooManyRequests(
      `Daily limit reached. You've used your ${DAILY_LIMIT} recipe extractions for today.`,
      { code: "daily_limit" },
    );
  }

  let body: { messageContent?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { messageContent } = body;
  if (!messageContent || typeof messageContent !== "string") {
    return badRequest("messageContent is required");
  }

  // Log usage before the call (count attempts, not just success)
  await prisma.featureUsage.create({
    data: {
      userId: user.id,
      feature: "extract_recipe",
      metadata: { contentLength: messageContent.length },
    },
  });

  const client = new Anthropic();

  let extraction;
  try {
    extraction = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: [
        "Extract the recipe from the provided text and return ONLY a valid JSON object.",
        "No markdown, no backticks, no explanation — raw JSON only.",
        'Schema: { "title": string, "description": string, "servings": number, "prepTime": number | null, "cookTime": number | null, "ingredients": [{ "name": string, "quantity": number | null, "unit": string | null, "notes": string | null }], "instructions": [{ "text": string, "timerMinutes": number | null }] }',
        "If multiple recipes are present, extract only the first/main one.",
        "Infer reasonable values for missing fields. servings should default to 2 if unknown.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `Extract the recipe from this text:\n\n${messageContent.slice(0, 3000)}`,
        },
      ],
    });
  } catch (err) {
    console.error("[extract-recipe] Anthropic error:", err);
    return apiError("Failed to extract recipe", 502, { code: "upstream_error" });
  }

  const raw =
    extraction.content[0].type === "text" ? extraction.content[0].text : "{}";

  let recipeData: ExtractedRecipe;
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    recipeData = JSON.parse(cleaned);
  } catch {
    return serverError("Failed to parse extracted recipe");
  }

  const recipe = await prisma.recipe.create({
    data: {
      userId: user.id,
      title: recipeData.title ?? "AI Recipe",
      description: recipeData.description ?? null,
      servings: recipeData.servings ?? 2,
      prepTime: recipeData.prepTime ?? null,
      cookTime: recipeData.cookTime ?? null,
      instructions: recipeData.instructions ?? [],
      isActive: true,
      ingredients: {
        create: (recipeData.ingredients ?? []).map((ing, index) => ({
          name: ing.name,
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? null,
          notes: ing.notes ?? null,
          isOptional: false,
          sortOrder: index,
        })),
      },
    },
  });

  return NextResponse.json({ recipeId: recipe.id }, { status: 201 });
}
