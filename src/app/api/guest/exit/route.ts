import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.redirect(
    new URL("/signin", process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  );

  res.cookies.set("panion-guest", "", { maxAge: 0, path: "/" });
  res.cookies.set("panion-guest-id", "", { maxAge: 0, path: "/" });

  return res;
}
