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
