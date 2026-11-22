import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * The two checks auth.ts makes that the audit of 2026-10-12 found missing.
 * Kept out of auth.ts so they can be tested without NextAuth.
 */

/** Magic-link sends allowed per hour, per address and per IP (audit H3). */
export const MAGIC_LINK_WINDOW_SECONDS = 60 * 60;
export const MAGIC_LINKS_PER_EMAIL = 5;
export const MAGIC_LINKS_PER_IP = 20;

/**
 * Count one magic-link send and say whether it is over the limit. Every send
 * is a SendGrid email to an address nobody has proven they own, and a new
 * address is a new account with fresh AI quotas.
 *
 * The address is hashed, so the rate-limit table never holds it in the clear.
 */
export async function magicLinkThrottled(email: string, ip: string): Promise<boolean> {
  const address = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const [byEmail, byIp] = await Promise.all([
    hitRateLimit(`magic-link:email:${address}`, MAGIC_LINK_WINDOW_SECONDS),
    hitRateLimit(`magic-link:ip:${ip}`, MAGIC_LINK_WINDOW_SECONDS),
  ]);
  return byEmail > MAGIC_LINKS_PER_EMAIL || byIp > MAGIC_LINKS_PER_IP;
}

/**
 * Whether a session's user may still use it (audit H1). Sessions are JWTs, so
 * deleting `Session` rows, as `anonymizeUser` does, ends nothing; a deleted
 * user kept a working session for up to 30 days. False for a deleted or
 * anonymised account, and for a user row that no longer exists.
 */
export async function accountIsLive(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletedAt: true, anonymizedAt: true },
  });
  return !!user && !user.deletedAt && !user.anonymizedAt;
}
