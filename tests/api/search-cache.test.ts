/**
 * Search responses carry the caller's watchlist (`isWatched`), and the CDN's
 * cache key ignores the session cookie. Both routes were `public,
 * s-maxage=300`, so one shopper's watchlist could be served to another.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../auth", () => ({ auth: vi.fn(async () => null) }));

import { GET as searchProducts } from "@/../src/app/api/products/route";
import { GET as searchGroups } from "@/../src/app/api/groups/route";

describe("search caching", () => {
  it("products are never cached for sharing", async () => {
    const res = await searchProducts(new NextRequest("http://localhost/api/products?q=milk"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("groups are never cached for sharing", async () => {
    const res = await searchGroups(new NextRequest("http://localhost/api/groups?q=milk"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
