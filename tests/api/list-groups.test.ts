/**
 * List items bought as a group, through the API: add "any of" a group, pick a
 * product within it, go back to "any", and unlink to plain text.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { setMockSession } from "../setup";
import { resetDb, createTestUser } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import { GET as getList } from "@/../src/app/api/lists/[id]/route";
import { PATCH as patchItem, POST as addItem } from "@/../src/app/api/lists/[id]/items/route";

const GROUP = "test-group-eggs";

function call(
  handler: typeof addItem,
  method: "POST" | "PATCH",
  listId: string,
  body: unknown,
) {
  return handler(
    new NextRequest(`http://localhost/api/lists/${listId}/items`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: listId }) },
  );
}

async function seedGroup() {
  const a = await prisma.store.upsert({
    where: { id: "test_store_grp_a" },
    update: {},
    create: { id: "test_store_grp_a", chain: "Grpmart", name: "Grpmart" },
  });
  const b = await prisma.store.upsert({
    where: { id: "test_store_grp_b" },
    update: {},
    create: { id: "test_store_grp_b", chain: "Grpco", name: "Grpco" },
  });
  const products = [
    { id: "test_grp_dozen_a", name: "Alpha Eggs 12 Count", qty: 12 },
    { id: "test_grp_dozen_b", name: "Beta Eggs 12 Count", qty: 12 },
    { id: "test_grp_six", name: "Gamma Eggs 6 Count", qty: 6 },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: { subcategory: GROUP, isActive: true },
      create: {
        id: p.id,
        name: p.name,
        subcategory: GROUP,
        unitQuantity: p.qty,
        unitMeasure: "unit",
        isActive: true,
      },
    });
  }
  await prisma.storeProduct.deleteMany({
    where: { productId: { in: products.map((p) => p.id) } },
  });
  await prisma.storeProduct.createMany({
    data: [
      { storeId: a.id, productId: "test_grp_dozen_a", currentPrice: 5 },
      { storeId: b.id, productId: "test_grp_dozen_b", currentPrice: 4 },
      // Two 6-packs at Grpmart cost 4.40: cheaper than its own dozen.
      { storeId: a.id, productId: "test_grp_six", currentPrice: 2.2 },
    ],
  });
}

describe("Group-linked list items", () => {
  let listId: string;

  beforeEach(async () => {
    await resetDb();
    await seedGroup();
    const user = await createTestUser();
    setMockSession({ user: { id: user.id } });
    listId = (await prisma.list.create({ data: { userId: user.id, name: "Weekly" } })).id;
  });

  it("adds any of a group, priced by each store's best buy for the same amount", async () => {
    const res = await call(addItem, "POST", listId, { groupSlug: GROUP });
    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item).toMatchObject({ productId: null, groupSlug: GROUP, name: "Test group eggs" });

    const rows = Object.fromEntries(
      item.product.storeProducts.map((sp: { store: { chain: string } }) => [sp.store.chain, sp]),
    );
    expect(rows.Grpmart).toMatchObject({ currentPrice: 4.4, pick: { productId: "test_grp_six", packs: 2 } });
    expect(rows.Grpco).toMatchObject({ currentPrice: 4, pick: { productId: "test_grp_dozen_b", packs: 1 } });
    expect(item.group).toMatchObject({ slug: GROUP, reference: "12 count" });
  });

  it("merges a second add of the same group instead of duplicating it", async () => {
    await call(addItem, "POST", listId, { groupSlug: GROUP });
    const res = await call(addItem, "POST", listId, { groupSlug: GROUP });
    expect(res.status).toBe(200);
    expect(await prisma.listItem.count({ where: { listId } })).toBe(1);
    expect(Number((await prisma.listItem.findFirst({ where: { listId } }))!.quantity)).toBe(2);
  });

  it("404s an unknown group and adds nothing", async () => {
    const res = await call(addItem, "POST", listId, { groupSlug: "no-such-group" });
    expect(res.status).toBe(404);
    expect(await prisma.listItem.count({ where: { listId } })).toBe(0);
  });

  it("keeps a picked product's group, so the shopper can switch later", async () => {
    const res = await call(addItem, "POST", listId, { productId: "test_grp_dozen_a" });
    const item = await res.json();
    expect(item).toMatchObject({ productId: "test_grp_dozen_a", groupSlug: GROUP });
    // A pick is priced as that product, only where it is sold.
    expect(item.product.storeProducts).toHaveLength(1);
    expect(item.group.choices.map((c: { id: string }) => c.id)).toContain("test_grp_dozen_b");
  });

  it("picks a product, goes back to any, and unlinks to plain text", async () => {
    const added = await (await call(addItem, "POST", listId, { groupSlug: GROUP })).json();

    const picked = await (
      await call(patchItem, "PATCH", listId, { itemId: added.id, productId: "test_grp_dozen_b" })
    ).json();
    expect(picked).toMatchObject({ productId: "test_grp_dozen_b", groupSlug: GROUP });

    const any = await (
      await call(patchItem, "PATCH", listId, { itemId: added.id, productId: null })
    ).json();
    expect(any).toMatchObject({ productId: null, groupSlug: GROUP });
    expect(any.product.storeProducts).toHaveLength(2);

    const plain = await (
      await call(patchItem, "PATCH", listId, { itemId: added.id, productId: null, groupSlug: null })
    ).json();
    expect(plain).toMatchObject({ productId: null, groupSlug: null, product: null, group: null });
  });

  it("returns group items resolved when the list is read", async () => {
    await call(addItem, "POST", listId, { groupSlug: GROUP });
    const res = await getList(new NextRequest(`http://localhost/api/lists/${listId}`), {
      params: Promise.resolve({ id: listId }),
    });
    const list = await res.json();
    expect(list.items[0].product.storeProducts).toHaveLength(2);
    expect(list.items[0].group.slug).toBe(GROUP);
  });
});
