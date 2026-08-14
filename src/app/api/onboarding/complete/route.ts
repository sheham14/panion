import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { validateBody, idSchema } from "@/lib/validate";

const schema = z.object({
  storeIds: z.array(idSchema).min(1, "Select at least one store").max(20),
  watchlistProductIds: z.array(idSchema).max(100),
});

export async function POST(req: Request) {
  // Standardized on the shared auth helper (audit L1).
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { data: parsed, error: invalid } = await validateBody(req, schema);
  if (invalid) return invalid;

  const { storeIds, watchlistProductIds } = parsed;
  const userId = user.id;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Delete existing preferred stores
      await tx.userPreferredStore.deleteMany({ where: { userId } });

      // 2. Create new ones
      await tx.userPreferredStore.createMany({
        data: storeIds.map((storeId) => ({ userId, storeId })),
      });

      // 3. Watchlist items
      await tx.watchlist.createMany({
        data: watchlistProductIds.map((productId) => ({ userId, productId })),
        skipDuplicates: true,
      });

      // 4. Mark onboarding complete
      await tx.user.update({
        where: { id: userId },
        data: { onboardingCompleted: true },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Onboarding complete error:", error);
    return NextResponse.json(
      { error: "Failed to save onboarding data" },
      { status: 500 },
    );
  }
}
