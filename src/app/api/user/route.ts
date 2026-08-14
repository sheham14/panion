import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import {
  validateBody,
  boundedString,
  tagArray,
  idSchema,
  MAX_NAME_LENGTH,
} from "@/lib/validate";
import { notFound } from "@/lib/api-error";

export async function GET() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const userData = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      dietaryRestrictions: true,
      allergies: true,
      emailNotifications: true,
      pushNotifications: true,
      marketingOptIn: true,
      digestFrequency: true,
      onboardingCompleted: true,
      createdAt: true,
      preferredStores: {
        select: {
          storeId: true,
          store: { select: { id: true, chain: true, name: true } },
        },
      },
    },
  });

  if (!userData) return notFound("User not found");

  return NextResponse.json(userData);
}

/**
 * `allergies` and `dietaryRestrictions` are interpolated directly into Clove's
 * system prompt, so an uncapped array here is both a token-cost vector and the
 * widest prompt-injection surface in the app — a user could set an "allergy" to
 * a paragraph of instructions. `tagArray` bounds count and per-item length
 * (audit H4 + H6).
 */
const UpdateUserSchema = z
  .object({
    name: boundedString(MAX_NAME_LENGTH),
    dietaryRestrictions: tagArray,
    allergies: tagArray,
    preferredStores: z.array(idSchema).max(20),
    emailNotifications: z.boolean(),
    pushNotifications: z.boolean(),
    marketingOptIn: z.boolean(),
    digestFrequency: z.enum(["immediate", "daily", "weekly", "none"]),
  })
  .partial();

export async function PATCH(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { data, error: invalid } = await validateBody(request, UpdateUserSchema);
  if (invalid) return invalid;

  const { preferredStores, ...userFields } = data;

  // Update user fields
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: userFields,
    select: {
      id: true,
      email: true,
      name: true,
      dietaryRestrictions: true,
      allergies: true,
      emailNotifications: true,
      pushNotifications: true,
      marketingOptIn: true,
      digestFrequency: true,
    },
  });

  // Handle preferred stores separately — replace the set in one transaction.
  // Uses createMany rather than N individual creates, matching the onboarding
  // route (audit M6).
  if (preferredStores !== undefined) {
    const storeIds = Array.from(new Set(preferredStores));
    await prisma.$transaction([
      prisma.userPreferredStore.deleteMany({ where: { userId: user.id } }),
      ...(storeIds.length
        ? [
            prisma.userPreferredStore.createMany({
              data: storeIds.map((storeId) => ({ userId: user.id, storeId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  return NextResponse.json(updated);
}
