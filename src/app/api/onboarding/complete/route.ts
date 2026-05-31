import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  storeIds: z.array(z.string()).min(1, "Select at least one store"),
  watchlistProductIds: z.array(z.string()),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { storeIds, watchlistProductIds } = parsed.data;
  const userId = session.user.id;

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
