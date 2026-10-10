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

function patch(listId: string, body: unknown) {
  return patchItem(
    new NextRequest(`http://localhost/api/lists/${listId}/items`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: listId }) },
  );
}

describe("Linking a list item to a product (PATCH)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function typedInItem() {
    const user = await createTestUser();
    const list = await prisma.list.create({ data: { userId: user.id, name: "Weekly" } });
    const item = await prisma.listItem.create({
      data: { listId: list.id, name: "milk", customPrice: 4.5 },
    });
    setMockSession({ user: { id: user.id } });
    return { list, item };
  }

  it("links a typed-in item, returns its product, and drops the custom price", async () => {
    const product = await ensureTestProduct();
    const { list, item } = await typedInItem();

    const res = await patch(list.id, { itemId: item.id, productId: product.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product).toMatchObject({ id: product.id });
    expect(Array.isArray(body.product.storeProducts)).toBe(true);
    expect(body.customPrice).toBeNull();

    const saved = await prisma.listItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(saved.productId).toBe(product.id);
    expect(saved.name).toBe("milk");
  });

  it("unlinks with null", async () => {
    const product = await ensureTestProduct();
    const { list, item } = await typedInItem();
    await prisma.listItem.update({ where: { id: item.id }, data: { productId: product.id } });

    const res = await patch(list.id, { itemId: item.id, productId: null });
    expect(res.status).toBe(200);
    expect((await res.json()).product).toBeNull();
  });

  it("returns 404 for an unknown product and leaves the item alone", async () => {
    const { list, item } = await typedInItem();

    const res = await patch(list.id, { itemId: item.id, productId: "no_such_product" });
    expect(res.status).toBe(404);
    const saved = await prisma.listItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(saved.productId).toBeNull();
  });

  it("rejects a negative quantity or price", async () => {
    const { list, item } = await typedInItem();
    expect((await patch(list.id, { itemId: item.id, quantity: -2 })).status).toBe(400);
    expect((await patch(list.id, { itemId: item.id, customPrice: -1 })).status).toBe(400);
  });

  it("answers malformed JSON with 400, not a crash", async () => {
    const { list } = await typedInItem();
    expect((await patch(list.id, "{not json")).status).toBe(400);
  });
});
