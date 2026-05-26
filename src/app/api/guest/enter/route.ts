import { NextResponse } from "next/server";

const GUEST_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export async function POST() {
  const guestId = crypto.randomUUID();

  const res = NextResponse.json({ ok: true });

  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: GUEST_TTL_SECONDS,
  };

  res.cookies.set("panion-guest", "1", cookieOpts);
  res.cookies.set("panion-guest-id", guestId, cookieOpts);

  return res;
}
