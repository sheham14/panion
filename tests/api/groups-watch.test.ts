/**
 * Group cards need to know what is already watched.
 *
 * `/api/groups` had no session awareness, so a group row could not offer the
 * one-tap Watch the flat results have. The only route from a group card to the
 * watchlist was: expand the card, tap through to the product page, watch it
 * there — three taps and a navigation to track the product the card was
 * already recommending.
 *
 * `auth()` is mocked here rather than through `tests/setup.ts`, which mocks
 * `getAuthenticatedUser` — a different door that this route does not use. The
 * signed-in case asserts `isWatched === true`, so if the mock ever stops
 * applying the test fails instead of quietly passing on an all-false response.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, createTestUser } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
}));

vi.mock("@/../auth", () => ({
  auth: async () => mockAuth.session,
}));

import { GET as getGroups } from "@/../src/app/api/groups/route";

type Option = { productId: string; isWatched: boolean };
type Group = { options: Option[]; cheapest: Option | null };

/** Two products in one equivalence group, priced at one store. */
async function seedGroup() {
  const store = await prisma.store.upsert({
    where: { id: "test_store_grp" },
    update: {},
    create: {
      id: "test_store_grp",
      chain: "walmart",
      name: "Walmart Test",
      city: "St. John's",
      province: "NL",
    },
  });

  const made: string[] = [];
  for (const [i, spec] of [
    ["Wonder White Bread", "675g", 3.97],
    ["Country Harvest Whole Wheat Bread", "600g", 4.29],
  ].entries()) {
    const [name, unitSize, price] = spec as [string, string, number];
    const product = await prisma.product.upsert({
      where: { id: `t_grp_${i}` },
      update: { subcategory: "test-bread" },
      create: {
        id: `t_grp_${i}`,
        name,
        unitSize,
        unitMeasure: "g",
        unitQuantity: Number(unitSize.replace("g", "")),
        subcategory: "test-bread",
        isActive: true,
      },
    });
    await prisma.storeProduct.upsert({
      where: { id: `t_grp_sp_${i}` },
      update: { currentPrice: price, isActive: true },
      create: {
        id: `t_grp_sp_${i}`,
        productId: product.id,
        storeId: store.id,
        currentPrice: price,
        isActive: true,
      },
    });
    made.push(product.id);
  }
  return made;
}

const call = async (q: string): Promise<Group[]> => {
  const res = await getGroups(
    new NextRequest(`http://localhost/api/groups?q=${encodeURIComponent(q)}`),
  );
  return (await res.json()).groups ?? [];
};

describe("/api/groups — watch state", () => {
  beforeEach(async () => {
    await resetDb();
    mockAuth.session = null;
  });

  it("marks nothing as watched for a signed-out visitor", async () => {
    await seedGroup();
    const groups = await call("test-bread");

    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      for (const o of g.options) expect(o.isWatched).toBe(false);
    }
  });

  it("marks the watched product, and only that one", async () => {
    const [watchedId, otherId] = await seedGroup();
    const user = await createTestUser();
    await prisma.watchlist.create({
      data: { userId: user.id, productId: watchedId },
    });
    mockAuth.session = { user: { id: user.id } };

    const groups = await call("test-bread");
    const options = groups.flatMap((g) => g.options);

    expect(options.find((o) => o.productId === watchedId)?.isWatched).toBe(true);
    expect(options.find((o) => o.productId === otherId)?.isWatched).toBe(false);
  });

  it("carries the flag on the featured product too", async () => {
    // The card's headline recommendation is the one most likely to be tapped,
    // and it is rendered from `cheapest`, not from `options`.
    const [firstId] = await seedGroup();
    const user = await createTestUser();
    await prisma.watchlist.create({
      data: { userId: user.id, productId: firstId },
    });
    mockAuth.session = { user: { id: user.id } };

    const groups = await call("test-bread");
    const cheapest = groups[0]?.cheapest;
    expect(cheapest).toBeTruthy();
    expect(typeof cheapest!.isWatched).toBe("boolean");
    // Whichever product ranks first, its flag must agree with the watchlist.
    expect(cheapest!.isWatched).toBe(cheapest!.productId === firstId);
  });
});
