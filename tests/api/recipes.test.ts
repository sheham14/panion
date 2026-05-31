/**
 * Recipe authorization tests (audit fixes S1 + S2).
 * Proves: user A cannot read user B's recipes via the GET endpoints.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockSession } from "../setup";
import { resetDb, createTestUser } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import { GET as listRecipes } from "@/../src/app/api/recipes/route";
import { GET as getRecipe } from "@/../src/app/api/recipes/[id]/route";
import { NextRequest } from "next/server";

async function userRecipe(userId: string, title: string) {
  return prisma.recipe.create({
    data: { userId, title, isActive: true, servings: 2 },
  });
}

async function systemRecipe(title: string) {
  return prisma.recipe.create({
    data: { userId: null, title, isActive: true, servings: 2 },
  });
}

describe("GET /api/recipes — authorization (S1)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    setMockSession(null);
    const res = await listRecipes(new NextRequest("http://localhost/api/recipes"));
    expect(res.status).toBe(401);
  });

  it("returns only the caller's recipes and system recipes — never another user's", async () => {
    const alice = await createTestUser({ email: "alice@example.com" });
    const bob = await createTestUser({ email: "bob@example.com" });
    await userRecipe(alice.id, "Alice's secret pasta");
    await userRecipe(bob.id, "Bob's secret stew");
    await systemRecipe("System Spaghetti");

    setMockSession({ user: { id: alice.id } });
    const res = await listRecipes(new NextRequest("http://localhost/api/recipes"));
    expect(res.status).toBe(200);
    const titles = (await res.json()).map((r: { title: string }) => r.title);

    expect(titles).toContain("Alice's secret pasta");
    expect(titles).toContain("System Spaghetti");
    expect(titles).not.toContain("Bob's secret stew");
  });
});

describe("GET /api/recipes/[id] — authorization (S2)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    const alice = await createTestUser({ email: "alice@example.com" });
    const recipe = await userRecipe(alice.id, "Alice's pasta");

    setMockSession(null);
    const res = await getRecipe(new NextRequest(`http://localhost/api/recipes/${recipe.id}`), {
      params: Promise.resolve({ id: recipe.id }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when user tries to read another user's recipe", async () => {
    const alice = await createTestUser({ email: "alice@example.com" });
    const bob = await createTestUser({ email: "bob@example.com" });
    const bobRecipe = await userRecipe(bob.id, "Bob's secret stew");

    setMockSession({ user: { id: alice.id } });
    const res = await getRecipe(
      new NextRequest(`http://localhost/api/recipes/${bobRecipe.id}`),
      { params: Promise.resolve({ id: bobRecipe.id }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns the recipe when caller owns it", async () => {
    const alice = await createTestUser({ email: "alice@example.com" });
    const recipe = await userRecipe(alice.id, "Alice's pasta");

    setMockSession({ user: { id: alice.id } });
    const res = await getRecipe(
      new NextRequest(`http://localhost/api/recipes/${recipe.id}`),
      { params: Promise.resolve({ id: recipe.id }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Alice's pasta");
  });

  it("allows any authenticated user to read a system recipe", async () => {
    const alice = await createTestUser({ email: "alice@example.com" });
    const sys = await systemRecipe("System Spaghetti");

    setMockSession({ user: { id: alice.id } });
    const res = await getRecipe(
      new NextRequest(`http://localhost/api/recipes/${sys.id}`),
      { params: Promise.resolve({ id: sys.id }) },
    );
    expect(res.status).toBe(200);
  });
});
