/**
 * The Postgres rate limiter that replaced Upstash Redis (2026-10-06).
 *
 * Route-level behaviour — the guest IP ceiling, per-cookie quota — is covered
 * in `ai-rate-limit.test.ts`. These pin the counter itself, in particular the
 * window restart, which Redis did implicitly by letting a key expire.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import { hitRateLimit } from "@/lib/rate-limit";

describe("hitRateLimit", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("counts every hit within a window, starting at 1", async () => {
    expect(await hitRateLimit("t:count", 60)).toBe(1);
    expect(await hitRateLimit("t:count", 60)).toBe(2);
    expect(await hitRateLimit("t:count", 60)).toBe(3);
  });

  it("keeps separate keys separate", async () => {
    await hitRateLimit("t:a", 60);
    await hitRateLimit("t:a", 60);
    expect(await hitRateLimit("t:b", 60)).toBe(1);
  });

  it("does not move the window on later hits", async () => {
    await hitRateLimit("t:fixed", 60);
    const first = await prisma.rateLimit.findUniqueOrThrow({ where: { key: "t:fixed" } });
    await hitRateLimit("t:fixed", 60);
    const second = await prisma.rateLimit.findUniqueOrThrow({ where: { key: "t:fixed" } });
    expect(second.expiresAt.getTime()).toBe(first.expiresAt.getTime());
  });

  it("restarts an expired window at 1, with a fresh expiry", async () => {
    // Yesterday's quota, used up and expired.
    await prisma.rateLimit.create({
      data: { key: "t:expired", count: 15, expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await hitRateLimit("t:expired", 60)).toBe(1);

    const row = await prisma.rateLimit.findUniqueOrThrow({ where: { key: "t:expired" } });
    expect(row.count).toBe(1);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(await hitRateLimit("t:expired", 60)).toBe(2);
  });

  it("counts concurrent hits without losing any", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => hitRateLimit("t:concurrent", 60)),
    );
    expect([...results].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
