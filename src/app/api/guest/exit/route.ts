import { NextResponse } from "next/server";

/**
 * Leaves guest mode by clearing its cookies. The caller navigates.
 *
 * This used to answer with a redirect to `NEXTAUTH_URL` (`https://panion.dev`),
 * a different origin from `www.panion.dev` where the app runs. A `fetch` that
 * follows a cross-origin redirect fails, so the guest banner's "Sign in" threw
 * before it navigated: the button did nothing, though the cookies had cleared.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("panion-guest", "", { maxAge: 0, path: "/" });
  res.cookies.set("panion-guest-id", "", { maxAge: 0, path: "/" });
  return res;
}
