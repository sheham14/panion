/**
 * Pantry ownership tests — proves deleteMany / updateMany are correctly scoped.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockSession } from "../setup";
import { resetDb, createTestUser } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import { DELETE as deleteItem, PATCH as patchItem } from "@/../src/app/api/pantry/[id]/route";
import { NextRequest } from "next/server";

describe("Pantry ownership", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("DELETE on another user's pantry item returns 404 and does not delete it", async () => {
    const alice = await createTestUser({ email: "alice@example.com" });
    const bob = await createTestUser({ email: "bob@example.com" });
    const bobItem = await prisma.pantryItem.create({
      data: { userId: bob.id, name: "Bob's eggs", addedFrom: "manual" },
    });

    setMockSession({ user: { id: alice.id } });
    const res = await deleteItem(
      new NextRequest(`http://localhost/api/pantry/${bobItem.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: bobItem.id }) },
    );
    expect(res.status).toBe(404);

    const stillThere = await prisma.pantryItem.findUnique({ where: { id: bobItem.id } });
    expect(stillThere).not.toBeNull();
  });

  it("PATCH on another user's pantry item returns 404", async () => {
    const alice = await createTestUser({ email: "alice@example.com" });
    const bob = await createTestUser({ email: "bob@example.com" });
    const bobItem = await prisma.pantryItem.create({
      data: { userId: bob.id, name: "Bob's eggs", addedFrom: "manual" },
    });

    setMockSession({ user: { id: alice.id } });
    const res = await patchItem(
      new NextRequest(`http://localhost/api/pantry/${bobItem.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "hijacked" }),
      }),
      { params: Promise.resolve({ id: bobItem.id }) },
    );
    expect(res.status).toBe(404);

    const stillNamed = await prisma.pantryItem.findUnique({ where: { id: bobItem.id } });
    expect(stillNamed?.name).toBe("Bob's eggs");
  });
});

describe("Linking a pantry item to a product", () => {
  beforeEach(async () => {
    await resetDb();
  });

  const json = (url: string, method: string, body: unknown) =>
    new NextRequest(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("POST with an unknown product is a 404, not a 500, and adds nothing", async () => {
    const { POST: addItem } = await import("@/../src/app/api/pantry/route");
    const user = await createTestUser();
    setMockSession({ user: { id: user.id } });

    const res = await addItem(
      json("http://localhost/api/pantry", "POST", { name: "eggs", productId: "no_such_product" }),
    );
    expect(res.status).toBe(404);
    expect(await prisma.pantryItem.count({ where: { userId: user.id } })).toBe(0);
  });

  it("PATCH that links a product returns its photo flag", async () => {
    const { ensureTestProduct } = await import("../helpers/db");
    const product = await ensureTestProduct();
    const user = await createTestUser();
    const item = await prisma.pantryItem.create({
      data: { userId: user.id, name: "eggs", addedFrom: "manual" },
    });
    setMockSession({ user: { id: user.id } });

    const res = await patchItem(
      json(`http://localhost/api/pantry/${item.id}`, "PATCH", { productId: product.id }),
      { params: Promise.resolve({ id: item.id }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("imageUrl", product.imageUrl ?? null);
    const saved = await prisma.pantryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(saved.productId).toBe(product.id);
  });

  it("PATCH with an unknown product is a 404 and leaves the item alone", async () => {
    const user = await createTestUser();
    const item = await prisma.pantryItem.create({
      data: { userId: user.id, name: "eggs", addedFrom: "manual" },
    });
    setMockSession({ user: { id: user.id } });

    const res = await patchItem(
      json(`http://localhost/api/pantry/${item.id}`, "PATCH", { productId: "no_such_product" }),
      { params: Promise.resolve({ id: item.id }) },
    );
    expect(res.status).toBe(404);
    const saved = await prisma.pantryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(saved.productId).toBeNull();
  });
});
