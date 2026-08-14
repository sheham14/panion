import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { notFound } from "@/lib/api-error";

/**
 * PIPEDA data-subject access request.
 *
 * This is an explicit allow-list, not a strip-list. The previous version used
 * `include` plus `const { accounts, sessions, ...rest } = data as any` — dead
 * code, since the query never included those relations in the first place, and
 * a shape that would silently start leaking OAuth tokens the day someone added
 * `accounts: true`. Whitelisting makes that failure impossible.
 *
 * It also omitted most of what the app actually stores about a person: pantry,
 * recipes, Clove conversations, alerts, push subscriptions, price reports,
 * preferred stores, and the health/dietary profile fields (audit H3).
 */
export async function GET() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const userData = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      // ── Identity & profile ──────────────────────────────────────────────
      id: true,
      email: true,
      emailVerified: true,
      name: true,
      image: true,
      dateOfBirth: true,
      gender: true,
      nationality: true,
      country: true,
      city: true,
      province: true,
      locale: true,
      currency: true,
      role: true,
      createdAt: true,
      updatedAt: true,

      // ── Health & dietary ────────────────────────────────────────────────
      dietaryRestrictions: true,
      allergies: true,
      healthGoal: true,
      activityLevel: true,
      dailyCalorieGoal: true,
      heightCm: true,
      weightKg: true,

      // ── Preferences ─────────────────────────────────────────────────────
      emailNotifications: true,
      pushNotifications: true,
      marketingOptIn: true,
      digestFrequency: true,
      onboardingCompleted: true,

      // ── Compliance state ────────────────────────────────────────────────
      deletionRequestedAt: true,
      deletedAt: true,
      anonymizedAt: true,

      // ── User-owned data ─────────────────────────────────────────────────
      lists: {
        select: {
          id: true,
          name: true,
          isDefault: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: {
              id: true,
              name: true,
              quantity: true,
              unit: true,
              notes: true,
              isChecked: true,
              customPrice: true,
              createdAt: true,
            },
          },
        },
      },
      pantryItems: {
        select: {
          id: true,
          name: true,
          brand: true,
          category: true,
          quantity: true,
          unit: true,
          addedFrom: true,
          expiresAt: true,
          createdAt: true,
        },
      },
      recipes: {
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
          sourceUrl: true,
          prepTime: true,
          cookTime: true,
          servings: true,
          instructions: true,
          createdAt: true,
          ingredients: {
            select: {
              name: true,
              quantity: true,
              unit: true,
              notes: true,
              isOptional: true,
            },
          },
        },
      },
      watchlists: {
        select: {
          id: true,
          productId: true,
          targetPrice: true,
          notifyOnDrop: true,
          notifyOnRise: true,
          createdAt: true,
        },
      },
      alerts: {
        select: {
          id: true,
          type: true,
          channel: true,
          payload: true,
          sentAt: true,
          readAt: true,
          createdAt: true,
        },
      },
      aiChatSessions: {
        select: {
          id: true,
          title: true,
          model: true,
          tokenCount: true,
          createdAt: true,
          messages: {
            select: { role: true, content: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      priceReports: {
        select: {
          id: true,
          storeProductId: true,
          reportedPrice: true,
          notes: true,
          seenAt: true,
          status: true,
          createdAt: true,
        },
      },
      preferredStores: {
        select: { storeId: true, createdAt: true },
      },
      pushSubscriptions: {
        // Endpoint only — the p256dh/auth keys are cryptographic material, not
        // personal data, and echoing them back would be a needless exposure.
        select: { id: true, endpoint: true, createdAt: true },
      },
      consentLogs: {
        select: {
          consentType: true,
          consented: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
        },
      },
      featureUsages: {
        select: { feature: true, usedAt: true, metadata: true },
      },
    },
  });

  if (!userData) return notFound("User not found");

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      format: "panion-data-export-v2",
      data: userData,
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="panion-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
