import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Capture tokens — the bookmarklet's credential.
 *
 * The bookmarklet runs on walmart.ca and posts to Panion, which is cross-site.
 * A session cookie cannot carry that request: NextAuth sets SameSite, so the
 * browser deliberately withholds it. A bearer secret in the request *body* is
 * the alternative, and it has a security property the cookie lacks — the
 * endpoint accepts no credentials at all, so opening it to other origins adds
 * no CSRF surface. A malicious page can forge a request but cannot know the
 * secret, and a request without the secret does nothing.
 *
 * Only the SHA-256 hash is stored. The plaintext is shown once and thereafter
 * exists only inside the bookmark. A leaked token can queue captures for review
 * — it cannot write prices, because writing still requires a signed-in
 * moderator to confirm the batch.
 */

/** 32 bytes of base64url — ~256 bits. */
export function generateCaptureToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashCaptureToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare of two hex digests. */
function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

export type CaptureTokenOwner = {
  userId: string;
  tokenId: string;
  role: string;
  managedStoreId: string | null;
};

/**
 * Resolve a plaintext token to its owner, or null.
 *
 * The role is re-read from the database on every call — the same rule the
 * session path follows, so a demotion takes effect immediately rather than
 * when some cached claim expires.
 */
export async function resolveCaptureToken(
  token: string | null | undefined,
): Promise<CaptureTokenOwner | null> {
  if (!token || typeof token !== "string") return null;
  // Cheap shape check before touching the database.
  if (token.length < 20 || token.length > 200) return null;

  const hash = hashCaptureToken(token);

  const row = await prisma.captureToken.findUnique({
    where: { tokenHash: hash },
    select: {
      id: true,
      tokenHash: true,
      revokedAt: true,
      user: {
        select: { id: true, role: true, managedStoreId: true, deletedAt: true },
      },
    },
  });

  if (!row || row.revokedAt !== null) return null;
  // The lookup was already by unique hash; this only guards against a future
  // refactor that widens the query.
  if (!hashesEqual(row.tokenHash, hash)) return null;

  const user = row.user;
  if (!user || user.deletedAt !== null) return null;
  if (user.role !== "moderator" && user.role !== "store_admin") return null;

  return {
    userId: user.id,
    tokenId: row.id,
    role: user.role,
    managedStoreId: user.managedStoreId,
  };
}

/** Replaces any existing token for this user. Returns the plaintext once. */
export async function issueCaptureToken(
  userId: string,
  label?: string,
): Promise<string> {
  const token = generateCaptureToken();

  await prisma.$transaction([
    prisma.captureToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.captureToken.create({
      data: {
        userId,
        tokenHash: hashCaptureToken(token),
        hint: token.slice(-4),
        label: label ?? null,
      },
    }),
  ]);

  return token;
}
