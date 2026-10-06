/**
 * List ownership tests — proves cross-user list/item modification is blocked.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockSession } from "../setup";
import { resetDb, createTestUser, ensureTestProduct } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import { GET as getList, DELETE as deleteList } from "@/../src/app/api/lists/[id]/route";
import { PATCH as patchItem, POST as addItem } from "@/../src/app/api/lists/[id]/items/route";
import { NextRequest } from "next/server";

function postItem(listId: string, body: unknown) {
  return addItem(
    new NextRequest(`http://localhost/api/lists/${listId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: listId }) },
  );
}

describe("List authorization", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns 404 when user tries to read another user's list", async () => {
    const alice = await createTestUser({ email: "alice@example.com" });
    const bob = await createTestUser({ email: "bob@example.com" });
    const bobList = await prisma.list.create({ data: { userId: bob.id, name: "Bob's list" } });

    setMockSession({ user: { id: alice.id } });
    const res = await getList(
      new NextRequest(`http://localhost/api/lists/${bobList.id}`),
      { params: Promise.resolve({ id: bobList.id }) },
    );
    expect(res.status).toBe(404);
  });

  it("DELETE silently no-ops on another user's list (deleteMany scoped to userId)", async () => {
    const alice = await createTestUser({ email: "alice@example.com" });
    const bob = await createTestUser({ email: "bob@example.com" });
    const bobList = await prisma.list.create({ data: { userId: bob.id, name: "Bob's list" } });

    setMockSession({ user: { id: alice.id } });
    await deleteList(
      new NextRequest(`http://localhost/api/lists/${bobList.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: bobList.id }) },
    );

    // Bob's list still exists
    const stillThere = await prisma.list.findUnique({ where: { id: bobList.id } });
    expect(stillThere).not.toBeNull();
  });

  it("cannot PATCH an item that belongs to another user's list", async () => {
    const alice = await createTestUser({ email: "alice@example.com" });
    const bob = await createTestUser({ email: "bob@example.com" });
    const bobList = await prisma.list.create({ data: { userId: bob.id, name: "Bob's list" } });
    const bobItem = await prisma.listItem.create({
      data: { listId: bobList.id, name: "Bob's apples", quantity: 1, isChecked: false },
    });

    setMockSession({ user: { id: alice.id } });
    const res = await patchItem(
      new NextRequest(`http://localhost/api/lists/${bobList.id}/items`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: bobItem.id, isChecked: true }),
      }),
      { params: Promise.resolve({ id: bobList.id }) },
    );
    expect(res.status).toBe(404);

    // Bob's item is still unchecked
    const stillUnchecked = await prisma.listItem.findUnique({ where: { id: bobItem.id } });
    expect(stillUnchecked?.isChecked).toBe(false);
  });
});

/**
 * Add to list from search, home and the product page sent { productId,
 * quantity } with no name, the route required a name, and the sheet ignored the
 * 400 — so tapping a list did nothing, silently, from three screens.
 */
describe("Adding list items (POST)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("adds a product with no name, naming it from the catalogue", async () => {
    const user = await createTestUser();
    const product = await ensureTestProduct();
    const list = await prisma.list.create({ data: { userId: user.id, name: "Weekly" } });
    setMockSession({ user: { id: user.id } });

    const res = await postItem(list.id, { productId: product.id, quantity: 1 });

    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item.productId).toBe(product.id);
    expect(item.name).toBe(product.name);
  });

  it("returns 404 for an unknown product instead of crashing, and adds nothing", async () => {
    const user = await createTestUser();
    const list = await prisma.list.create({ data: { userId: user.id, name: "Weekly" } });
    setMockSession({ user: { id: user.id } });

    const res = await postItem(list.id, { productId: "no-such-product", name: "Milk" });

    expect(res.status).toBe(404);
    expect(await prisma.listItem.count({ where: { listId: list.id } })).toBe(0);
  });

  it("rejects an item with neither a name nor a product", async () => {
    const user = await createTestUser();
    const list = await prisma.list.create({ data: { userId: user.id, name: "Weekly" } });
    setMockSession({ user: { id: user.id } });

    const res = await postItem(list.id, { quantity: 2 });

    expect(res.status).toBe(400);
  });

  it("still adds a free-text item by name", async () => {
    const user = await createTestUser();
    const list = await prisma.list.create({ data: { userId: user.id, name: "Weekly" } });
    setMockSession({ user: { id: user.id } });

    const res = await postItem(list.id, { name: "Fresh basil", quantity: 1, unit: "bunch" });

    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item.name).toBe("Fresh basil");
    expect(item.productId).toBeNull();
  });
});
