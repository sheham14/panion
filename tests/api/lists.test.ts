/**
 * List ownership tests — proves cross-user list/item modification is blocked.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockSession } from "../setup";
import { resetDb, createTestUser } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import { GET as getList, DELETE as deleteList } from "@/../src/app/api/lists/[id]/route";
import { PATCH as patchItem } from "@/../src/app/api/lists/[id]/items/route";
import { NextRequest } from "next/server";

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
