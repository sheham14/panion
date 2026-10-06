import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Health check.
 *
 * Postgres is the only backing service. It also holds the rate limits that
 * used to live in Redis (`src/lib/rate-limit.ts`), so this one check covers
 * guest AI and every limiter too. That matters: when Redis was a separate
 * service, a Redis outage broke guest AI and the feedback form while every
 * other page looked fine (audit L5).
 */
export async function GET() {
  const db = await prisma.$queryRaw`SELECT 1`.then(
    () => "connected" as const,
    () => "disconnected" as const,
  );
  const healthy = db === "connected";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      database: db,
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
