/**
 * Watchlist tests — upsert behavior, ownership scoping.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockSession } from "../setup";
import { resetDb, createTestUser, ensureTestProduct } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import { POST as addWatch } from "@/../src/app/api/watchlist/route";
import { DELETE as removeWatch } from "@/../src/app/api/watchlist/[productId]/route";
import { NextRequest } from "next/server";

describe("Watchlist", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("upserts: adding the same product twice does not create duplicates", async () => {
    const user = await createTestUser();
    const product = await ensureTestProduct();
    setMockSession({ user: { id: user.id } });

    const buildReq = (price: number) =>
      new NextRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: product.id, targetPrice: price }),
      });

    await addWatch(buildReq(4.99));
    await addWatch(buildReq(3.99)); // second call should UPDATE, not insert

    const count = await prisma.watchlist.count({ where: { userId: user.id, productId: product.id } });
    expect(count).toBe(1);

    const entry = await prisma.watchlist.findFirst({ where: { userId: user.id, productId: product.id } });
    expect(Number(entry?.targetPrice)).toBe(3.99); // most recent wins
  });

  it("DELETE only removes the caller's watch entry, not another user's", async () => {
    const alice = await createTestUser({ email: "alice@example.com" });
    const bob = await createTestUser({ email: "bob@example.com" });
    const product = await ensureTestProduct();

    await prisma.watchlist.create({ data: { userId: alice.id, productId: product.id } });
    await prisma.watchlist.create({ data: { userId: bob.id, productId: product.id } });

    setMockSession({ user: { id: alice.id } });
    await removeWatch(
      new NextRequest(`http://localhost/api/watchlist/${product.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ productId: product.id }) },
    );

    const aliceStill = await prisma.watchlist.findFirst({ where: { userId: alice.id } });
    const bobStill = await prisma.watchlist.findFirst({ where: { userId: bob.id } });
    expect(aliceStill).toBeNull();
    expect(bobStill).not.toBeNull(); // Bob's entry untouched
  });
});
