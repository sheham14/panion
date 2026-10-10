/**
 * `planRecipesForUser` is what lets the recipes index add real products: it
 * used to add every group-matched ingredient as plain text, because only the
 * recipe page planned them. Runs against the test database.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, createTestUser } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import {
  planRecipesForUser,
  plannableProductSelect,
} from "@/lib/recipes/load-shopping";

const STORE_ID = "test_store_plans";
const PRODUCT_ID = "test_product_plans_mozz";
const GROUP = "test-plans-mozzarella";

async function seedPricedGroupMember() {
  await prisma.store.upsert({
    where: { id: STORE_ID },
    update: {},
    create: { id: STORE_ID, chain: "Testmart", name: "Testmart Plans" },
  });
  await prisma.product.upsert({
    where: { id: PRODUCT_ID },
    update: {},
    create: {
      id: PRODUCT_ID,
      name: "Shredded Mozzarella",
      brand: "Testbrand",
      subcategory: GROUP,
      unitSize: "320g",
      unitQuantity: 320,
      unitMeasure: "g",
      isActive: true,
    },
  });
  await prisma.storeProduct.deleteMany({ where: { productId: PRODUCT_ID } });
  await prisma.storeProduct.create({
    data: { storeId: STORE_ID, productId: PRODUCT_ID, currentPrice: 5.49 },
  });
}

async function loadRecipe(id: string) {
  return prisma.recipe.findUniqueOrThrow({
    where: { id },
    include: {
      ingredients: { include: { product: { select: plannableProductSelect } } },
    },
  });
}

describe("planRecipesForUser", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPricedGroupMember();
  });

  afterAll(async () => {
    await prisma.storeProduct.deleteMany({ where: { productId: PRODUCT_ID } });
    await prisma.product.deleteMany({ where: { id: PRODUCT_ID } });
    await prisma.store.deleteMany({ where: { id: STORE_ID } });
  });

  it("picks a group member for an unlinked ingredient, at the shopper's store", async () => {
    const user = await createTestUser();
    await prisma.userPreferredStore.create({
      data: { userId: user.id, storeId: STORE_ID },
    });
    const recipe = await prisma.recipe.create({
      data: {
        userId: user.id,
        title: "Pizza",
        isActive: true,
        ingredientsMatchedAt: new Date(),
        ingredients: {
          create: [
            { name: "mozzarella", quantity: 600, unit: "g", groupSlug: GROUP, sortOrder: 0 },
            { name: "basil", sortOrder: 1 },
          ],
        },
      },
    });

    const plan = (await planRecipesForUser(user.id, [await loadRecipe(recipe.id)])).get(recipe.id)!;
    const mozz = (await loadRecipe(recipe.id)).ingredients.find((i) => i.name === "mozzarella")!;
    const basil = (await loadRecipe(recipe.id)).ingredients.find((i) => i.name === "basil")!;

    expect(plan.picks[mozz.id]).toMatchObject({
      productId: PRODUCT_ID,
      chain: "testmart",
      packs: 2,
      cost: 10.98,
    });
    expect(plan.picks[basil.id]).toBeNull();
  });

  it("marks ingredients already in the pantry", async () => {
    const user = await createTestUser();
    await prisma.pantryItem.create({ data: { userId: user.id, name: "Mozzarella" } });
    const recipe = await prisma.recipe.create({
      data: {
        userId: user.id,
        title: "Pizza",
        isActive: true,
        ingredients: { create: [{ name: "mozzarella", groupSlug: GROUP, sortOrder: 0 }] },
      },
    });
    const loaded = await loadRecipe(recipe.id);

    const plan = (await planRecipesForUser(user.id, [loaded])).get(recipe.id)!;
    expect(plan.inPantry.get(loaded.ingredients[0].id)).toBe(true);
  });
});
