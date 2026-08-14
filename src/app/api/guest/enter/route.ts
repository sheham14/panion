import { NextResponse } from "next/server";

const GUEST_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export async function POST() {
  const guestId = crypto.randomUUID();

  const res = NextResponse.json({ ok: true });

  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    // Without this the cookie can still ride a plaintext downgrade (audit M11).
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_TTL_SECONDS,
  };

  res.cookies.set("panion-guest", "1", cookieOpts);
  res.cookies.set("panion-guest-id", guestId, cookieOpts);

  return res;
}
