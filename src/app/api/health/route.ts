import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

/**
 * Health check.
 *
 * Previously pinged Postgres only, so a Redis outage — which breaks guest AI
 * and every rate limit — was invisible to monitoring (audit L5).
 */
export async function GET() {
  const [db, cache] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  const database = db.status === "fulfilled" ? "connected" : "disconnected";
  const cacheStatus = cache.status === "fulfilled" ? "connected" : "disconnected";
  const healthy = database === "connected" && cacheStatus === "connected";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      database,
      cache: cacheStatus,
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
