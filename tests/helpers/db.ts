import { prisma } from "@/lib/prisma";

/**
 * Truncate all user-facing tables between tests. Order matters — children before parents.
 * Reference data (stores, products) is preserved between tests so they don't need re-seeding.
 */
export async function resetDb() {
  // Order: children → parents, respecting foreign keys.
  await prisma.$transaction([
    prisma.aiChatMessage.deleteMany(),
    prisma.aiChatSession.deleteMany(),
    prisma.featureUsage.deleteMany(),
    prisma.alert.deleteMany(),
    prisma.pushSubscription.deleteMany(),
    prisma.recipeIngredient.deleteMany(),
    prisma.recipe.deleteMany({ where: { userId: { not: null } } }), // keep system recipes
    prisma.listItem.deleteMany(),
    prisma.list.deleteMany(),
    prisma.pantryItem.deleteMany(),
    prisma.watchlist.deleteMany(),
    prisma.priceReport.deleteMany(),
    prisma.consentLog.deleteMany(),
    prisma.userPreferredStore.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export async function createTestUser(overrides: Partial<{ email: string; name: string; onboardingCompleted: boolean }> = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      name: overrides.name ?? "Test User",
      onboardingCompleted: overrides.onboardingCompleted ?? true,
    },
  });
}

/**
 * Ensure at least one product exists for tests that need product references.
 * Returns the first product (creates one if the seed DB is empty).
 */
export async function ensureTestProduct() {
  const existing = await prisma.product.findFirst();
  if (existing) return existing;
  return prisma.product.create({
    data: {
      id: "test_product_milk",
      name: "Test Milk",
      brand: "TestBrand",
      isActive: true,
    },
  });
}
