import { prisma } from "@/lib/prisma";

/**
 * Fixed-window rate limiting on Postgres, for limits with no user row to count
 * against — guest Clove, the public feedback form, capture auto-submit.
 *
 * Replaces Upstash Redis. That database was deleted after August, and because
 * every guest and feedback request incremented a counter before doing anything
 * else, both returned 500s in production for weeks without anything reporting
 * it. Signed-in limits already count `FeatureUsage` rows; this is the same
 * database, so it adds no new way for a request to fail.
 *
 * Semantics match the Redis code it replaced (`incr`, then `expire` on the
 * first hit): a window opens on a key's first hit and lasts `windowSeconds`.
 */

/** Delete expired windows on roughly one call in a hundred. */
const SWEEP_PROBABILITY = 0.01;

/**
 * Record one hit against `key` and return the number of hits in the current
 * window, this one included. Callers compare it to their limit.
 */
export async function hitRateLimit(
  key: string,
  windowSeconds: number,
): Promise<number> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowSeconds * 1000);

  // A native INSERT … ON CONFLICT DO UPDATE, so concurrent hits on one key
  // can't lose an increment.
  const row = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, expiresAt },
    update: { count: { increment: 1 } },
  });

  if (Math.random() < SWEEP_PROBABILITY) {
    // Housekeeping only: an expired row is restarted whenever its key comes
    // back, so a failed sweep never affects a limit.
    await prisma.rateLimit
      .deleteMany({ where: { expiresAt: { lt: now } } })
      .catch(() => {});
  }

  if (row.expiresAt > now) return row.count;

  // The window this key was counting has ended, so this hit opens a new one.
  // Conditional on the expiry so two requests can't both restart it.
  const restarted = await prisma.rateLimit.updateMany({
    where: { key, expiresAt: { lte: now } },
    data: { count: 1, expiresAt },
  });
  if (restarted.count === 1) return 1;

  // Either another request restarted the window between the two statements
  // (and its reset discarded this hit's increment), or a sweep deleted the
  // expired row in between. An upsert covers both: count this hit in the
  // window that now exists, or open one if none does.
  const current = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, expiresAt },
    update: { count: { increment: 1 } },
  });
  return current.count;
}
