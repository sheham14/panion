/**
 * AI cost-protection tests (audit fixes S3 + S4).
 * S3: guest IP ceiling survives cookie clears.
 * S4: extract-recipe has a per-user daily cap.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setMockSession } from "../setup";
import { resetDb, createTestUser } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import { POST as askAi } from "@/../src/app/api/ai/ask/route";
import { POST as extractRecipe } from "@/../src/app/api/ai/extract-recipe/route";
import { NextRequest } from "next/server";

function guestRequest(opts: { ip: string; guestId: string; body: object }) {
  const req = new NextRequest("http://localhost/api/ai/ask", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": opts.ip,
      cookie: `panion-guest=1; panion-guest-id=${opts.guestId}`,
    },
    body: JSON.stringify(opts.body),
  });
  return req;
}

describe("Guest AI IP ceiling (S3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("blocks the 16th call from a single IP even with rotated guest cookies", async () => {
    // 5 cookies × 5 calls each = 25 attempts, but the IP cap should fire at #16
    let blocked = false;
    let lastStatus = 0;
    for (let cookieIdx = 0; cookieIdx < 5 && !blocked; cookieIdx++) {
      for (let call = 0; call < 5 && !blocked; call++) {
        const res = await askAi(
          guestRequest({
            ip: "203.0.113.42",
            guestId: `guest-${cookieIdx}`,
            body: { query: "what's for dinner" },
          }),
        );
        lastStatus = res.status;
        if (res.status === 429) {
          blocked = true;
          const body = await res.json();
          expect(body.message).toMatch(/quota exceeded|limit reached/i);
        }
      }
    }
    expect(blocked).toBe(true);
    expect(lastStatus).toBe(429);
  });

  it("a different IP keeps its own quota independently", async () => {
    // Hit IP A 15 times (exhaust IP ceiling)
    for (let i = 0; i < 15; i++) {
      await askAi(guestRequest({ ip: "1.1.1.1", guestId: `gA-${i}`, body: { query: "x" } }));
    }

    // IP B's first request should not be rate-limited by IP A's quota
    const res = await askAi(guestRequest({ ip: "2.2.2.2", guestId: "gB-0", body: { query: "x" } }));
    expect(res.status).not.toBe(429);
  });
});

describe("Extract-recipe daily limit (S4)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns 429 after the 20th call in a single day", async () => {
    const user = await createTestUser({ email: "limit@example.com" });
    setMockSession({ user: { id: user.id } });

    // Pre-seed 20 usage rows for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.featureUsage.createMany({
      data: Array.from({ length: 20 }).map(() => ({
        userId: user.id,
        feature: "extract_recipe",
        usedAt: new Date(),
      })),
    });

    const res = await extractRecipe(
      new NextRequest("http://localhost/api/ai/extract-recipe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageContent: "test recipe text" }),
      }),
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/limit reached/i);
  });

  it("allows the call when usage is below the limit", async () => {
    const user = await createTestUser({ email: "ok@example.com" });
    setMockSession({ user: { id: user.id } });

    const res = await extractRecipe(
      new NextRequest("http://localhost/api/ai/extract-recipe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageContent: "Pasta recipe with garlic" }),
      }),
    );

    expect([200, 201]).toContain(res.status);
    // Usage logged
    const count = await prisma.featureUsage.count({
      where: { userId: user.id, feature: "extract_recipe" },
    });
    expect(count).toBe(1);
  });
});
