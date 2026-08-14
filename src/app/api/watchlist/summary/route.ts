import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { getWatchlistSummary } from "@/lib/watchlist-summary";

export async function GET() {
  // Standardized on the shared helper rather than an inline `auth()` call
  // (audit L1) — the inline form also bypassed the test-suite auth mock.
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const data = await getWatchlistSummary(user.id);
  return NextResponse.json(data);
}
