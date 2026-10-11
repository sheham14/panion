/**
 * Suggested pantry categories. A stand-in model answers, so these run without
 * a network call and without the real provider.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestUser } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import { categorizeNames, categorizePantry } from "@/lib/pantry/categorize";
import type { Complete } from "@/lib/ai/complete";

const reply = (text: string | null): Complete => async () => text;

describe("categorizeNames", () => {
  it("reads one category per item, in order", async () => {
    const out = await categorizeNames(
      ["Butter", "Bananas"],
      reply('[{"i":0,"category":"dairy"},{"i":1,"category":"produce"}]'),
    );
    expect(out).toEqual(["dairy", "produce"]);
  });

  it("drops a category that isn't on the list instead of guessing", async () => {
    const out = await categorizeNames(["Butter"], reply('[{"i":0,"category":"fridge"}]'));
    expect(out).toEqual([null]);
  });

  it("returns null, not a guess, for an unusable or failed answer", async () => {
    expect(await categorizeNames(["Butter"], reply("I can't help with that"))).toBeNull();
    expect(await categorizeNames(["Butter"], reply(null))).toBeNull();
    const failing: Complete = async () => {
      throw new Error("down");
    };
    expect(await categorizeNames(["Butter"], failing)).toBeNull();
  });
});

describe("categorizePantry", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("uses a linked product's category and asks the model only about the rest", async () => {
    const user = await createTestUser();
    const product = await prisma.product.upsert({
      where: { id: "test_product_cat_milk" },
      update: { category: "dairy" },
      create: { id: "test_product_cat_milk", name: "Cat Milk", category: "dairy", isActive: true },
    });
    await prisma.pantryItem.createMany({
      data: [
        { userId: user.id, name: "Cat Milk", productId: product.id },
        { userId: user.id, name: "Bananas" },
      ],
    });
    const asked: string[] = [];
    const model: Complete = async ({ prompt }) => {
      asked.push(prompt);
      return '[{"i":0,"category":"produce"}]';
    };

    expect(await categorizePantry(user.id, model)).toBe(2);
    const byName = Object.fromEntries(
      (await prisma.pantryItem.findMany({ where: { userId: user.id } })).map((i) => [i.name, i.category]),
    );
    expect(byName).toEqual({ "Cat Milk": "dairy", Bananas: "produce" });
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toContain("Cat Milk");
  });

  it("never touches a category the shopper set", async () => {
    const user = await createTestUser();
    await prisma.pantryItem.create({
      data: { userId: user.id, name: "Bananas", category: "snacks_candy" },
    });
    expect(await categorizePantry(user.id, reply('[{"i":0,"category":"produce"}]'))).toBe(0);
    const item = await prisma.pantryItem.findFirst({ where: { userId: user.id } });
    expect(item?.category).toBe("snacks_candy");
  });

  it("leaves items uncategorised when the model fails, so a later visit retries", async () => {
    const user = await createTestUser();
    await prisma.pantryItem.create({ data: { userId: user.id, name: "Bananas" } });
    expect(await categorizePantry(user.id, reply(null))).toBe(0);
    const item = await prisma.pantryItem.findFirst({ where: { userId: user.id } });
    expect(item?.category).toBeNull();
  });
});
