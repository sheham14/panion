/**
 * The two checks auth.ts gained from the 2026-10-12 audit: deleted accounts
 * lose their sessions (H1), and magic-link sends are throttled (H3).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestUser } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import {
  accountIsLive,
  magicLinkThrottled,
  MAGIC_LINKS_PER_EMAIL,
  MAGIC_LINKS_PER_IP,
} from "@/lib/auth-guards";

describe("accountIsLive", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("is true for an ordinary account", async () => {
    const user = await createTestUser();
    expect(await accountIsLive(user.id)).toBe(true);
  });

  it("stays true while a deletion request is in its grace period", async () => {
    const user = await createTestUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { deletionRequestedAt: new Date() },
    });
    expect(await accountIsLive(user.id)).toBe(true);
  });

  it("is false once the account is anonymised", async () => {
    const user = await createTestUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), anonymizedAt: new Date() },
    });
    expect(await accountIsLive(user.id)).toBe(false);
  });

  it("is false for a user row that no longer exists", async () => {
    expect(await accountIsLive("no-such-user")).toBe(false);
  });
});

describe("magicLinkThrottled", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it(`allows ${MAGIC_LINKS_PER_EMAIL} links an hour to one address, then stops`, async () => {
    for (let i = 0; i < MAGIC_LINKS_PER_EMAIL; i++) {
      // A different IP each time, so only the address limit can trip.
      expect(await magicLinkThrottled("a@example.com", `10.0.0.${i}`)).toBe(false);
    }
    expect(await magicLinkThrottled("a@example.com", "10.0.0.99")).toBe(true);
  });

  it("treats an address's case and spacing as the same address", async () => {
    for (let i = 0; i < MAGIC_LINKS_PER_EMAIL; i++) {
      await magicLinkThrottled("b@example.com", `10.0.1.${i}`);
    }
    expect(await magicLinkThrottled("  B@Example.COM ", "10.0.1.99")).toBe(true);
  });

  it(`allows ${MAGIC_LINKS_PER_IP} links an hour from one IP, across addresses`, async () => {
    for (let i = 0; i < MAGIC_LINKS_PER_IP; i++) {
      expect(await magicLinkThrottled(`user${i}@example.com`, "10.0.2.1")).toBe(false);
    }
    expect(await magicLinkThrottled("fresh@example.com", "10.0.2.1")).toBe(true);
  });

  it("never stores the address in the clear", async () => {
    await magicLinkThrottled("private@example.com", "10.0.3.1");
    const keys = (await prisma.rateLimit.findMany({ select: { key: true } })).map((r) => r.key);
    expect(keys.some((k) => k.includes("private"))).toBe(false);
    expect(keys.some((k) => k.startsWith("magic-link:email:"))).toBe(true);
  });
});
