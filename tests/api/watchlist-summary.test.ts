/**
 * The home summary must not rank a store cheapest on a smaller basket.
 *
 * `getWatchlistSummary()` used to sum prices into `Record<chain, number>` and
 * pick the smallest, so the store missing the most watched products won — the
 * same defect the list page had (CLAUDE.md rule 12) and that
 * `/api/lists/[id]/recommend` was fixed for under audit M3. These tests hit a
 * real database because the bug lived in the shape of the query result, not in
 * arithmetic that a unit test would have seen.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestUser } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import { getWatchlistSummary } from "@/lib/watchlist-summary";

/** A store, its preferred-store link for `userId`, and nothing else. */
async function preferStore(userId: string, chain: string) {
  const store = await prisma.store.upsert({
    where: { id: `test_store_${chain}` },
    update: {},
    create: {
      id: `test_store_${chain}`,
      chain,
      name: `${chain} Test Branch`,
      city: "St. John's",
      province: "NL",
    },
  });
  await prisma.userPreferredStore.create({
    data: { userId, storeId: store.id },
  });
  return store;
}

/** A product priced at the given stores. A missing entry means no row at all. */
async function priceProduct(
  id: string,
  name: string,
  prices: Record<string, number>,
) {
  const product = await prisma.product.upsert({
    where: { id },
    update: {},
    create: { id, name, isActive: true },
  });
  for (const [chain, price] of Object.entries(prices)) {
    await prisma.storeProduct.upsert({
      where: { id: `${id}_${chain}` },
      update: { currentPrice: price, isActive: true },
      create: {
        id: `${id}_${chain}`,
        productId: product.id,
        storeId: `test_store_${chain}`,
        currentPrice: price,
        isActive: true,
      },
    });
  }
  return product;
}

describe("getWatchlistSummary — ranking", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("does not crown the store that is missing the most items", async () => {
    const user = await createTestUser();
    await preferStore(user.id, "walmart");
    await preferStore(user.id, "sobeys");

    // sobeys is dearer on every item it can price, and cannot price the third
    // at all. Its raw total is still the smallest of the two.
    const bread = await priceProduct("t_bread", "Bread", {
      walmart: 3.0,
      sobeys: 3.5,
    });
    const butter = await priceProduct("t_butter", "Butter", {
      walmart: 5.0,
      sobeys: 5.5,
    });
    const eggs = await priceProduct("t_eggs", "Eggs", { walmart: 4.0 });

    for (const p of [bread, butter, eggs]) {
      await prisma.watchlist.create({
        data: { userId: user.id, productId: p.id },
      });
    }

    const summary = await getWatchlistSummary(user.id);
    const walmart = summary.stores.find((s) => s.chain === "walmart")!;
    const sobeys = summary.stores.find((s) => s.chain === "sobeys")!;

    // The raw totals are exactly what they always were, and on those alone the
    // old reducer picked sobeys — the store that cannot fill the basket.
    expect(Number(walmart.total)).toBeCloseTo(12.0);
    expect(Number(sobeys.total)).toBeCloseTo(9.0);

    // On the two items both can price, walmart is cheaper. That is the
    // comparison, and it flips the answer.
    expect(summary.bestStore).toBe("walmart");

    // And the coverage that decided it is reported alongside.
    expect(walmart.covered).toBe(3);
    expect(walmart.missing).toBe(0);
    expect(sobeys.covered).toBe(2);
    expect(sobeys.missing).toBe(1);
    expect(summary.itemCount).toBe(3);
    expect(summary.comparableItemCount).toBe(2);
  });

  it("prefers the store that is dearer per item but covers more", async () => {
    const user = await createTestUser();
    await preferStore(user.id, "walmart");
    await preferStore(user.id, "sobeys");

    // sobeys prices one cheap item; walmart prices both, dearer each.
    const bread = await priceProduct("t_bread2", "Bread", {
      walmart: 3.0,
      sobeys: 2.5,
    });
    const eggs = await priceProduct("t_eggs2", "Eggs", { walmart: 4.0 });

    for (const p of [bread, eggs]) {
      await prisma.watchlist.create({
        data: { userId: user.id, productId: p.id },
      });
    }

    const summary = await getWatchlistSummary(user.id);
    // Raw totals: sobeys 2.50 vs walmart 7.00. The old reducer picked sobeys.
    expect(Number(summary.storeTotals.sobeys)).toBeCloseTo(2.5);
    expect(Number(summary.storeTotals.walmart)).toBeCloseTo(7.0);
    // On the one item both can price, sobeys is cheaper — so it still wins the
    // shared basket. The point is that the decision is made on the shared
    // basket at all, and that the coverage gap is visible beside it.
    expect(summary.stores.find((s) => s.chain === "sobeys")!.missing).toBe(1);
  });

  it("ignores a store the user does not shop at", async () => {
    const user = await createTestUser();
    await preferStore(user.id, "walmart");
    // dominion exists and is cheapest, but is not a preferred store.
    await prisma.store.upsert({
      where: { id: "test_store_dominion" },
      update: {},
      create: {
        id: "test_store_dominion",
        chain: "dominion",
        name: "dominion Test Branch",
        city: "St. John's",
        province: "NL",
      },
    });
    const bread = await priceProduct("t_bread3", "Bread", { walmart: 3.0 });
    await prisma.storeProduct.upsert({
      where: { id: "t_bread3_dominion" },
      update: { currentPrice: 1.0, isActive: true },
      create: {
        id: "t_bread3_dominion",
        productId: bread.id,
        storeId: "test_store_dominion",
        currentPrice: 1.0,
        isActive: true,
      },
    });
    await prisma.watchlist.create({
      data: { userId: user.id, productId: bread.id },
    });

    const summary = await getWatchlistSummary(user.id);
    expect(summary.bestStore).toBe("walmart");
    expect(summary.storeTotals.dominion).toBeUndefined();
  });

  it("returns a null best store for an empty watchlist", async () => {
    const user = await createTestUser();
    await preferStore(user.id, "walmart");

    const summary = await getWatchlistSummary(user.id);
    expect(summary.bestStore).toBeNull();
    expect(summary.itemCount).toBe(0);
    expect(summary.stores[0].covered).toBe(0);
  });
});
