import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse, type NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

const GUEST_COOKIES = ["panion-guest", "panion-guest-id"];

/**
 * A guest cookie alongside a real session is always stale: the person signed
 * in after trying guest mode, by some route other than the guest banner. Pages
 * check the guest cookie first and APIs check the session first, so such a
 * person saw guest data while their actions changed their real account — for
 * up to the cookie's 24 hours, with the guest banner hidden because they were
 * signed in. Drop the cookies from this request, so every page and route sees
 * one identity, and from the browser, so it ends here.
 */
function withoutGuestCookies(req: NextRequest, res?: NextResponse) {
  let out = res;
  if (!out) {
    const headers = new Headers(req.headers);
    const kept = req.cookies
      .getAll()
      .filter((c) => !GUEST_COOKIES.includes(c.name))
      .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
      .join("; ");
    if (kept) headers.set("cookie", kept);
    else headers.delete("cookie");
    out = NextResponse.next({ request: { headers } });
  }
  for (const name of GUEST_COOKIES) out.cookies.set(name, "", { maxAge: 0, path: "/" });
  return out;
}

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session?.user;
  const isGuest = req.cookies.get("panion-guest")?.value === "1";

  // Every response for a signed-in request goes through this.
  const proceed = (res?: NextResponse) =>
    isLoggedIn && isGuest ? withoutGuestCookies(req, res) : (res ?? NextResponse.next());

  const isAuthPage =
    nextUrl.pathname.startsWith("/signin") ||
    nextUrl.pathname.startsWith("/welcome");
  const isApiRoute = nextUrl.pathname.startsWith("/api");
  const isPublicRoute = ["/privacy", "/feedback", "/terms", "/welcome"].includes(
    nextUrl.pathname,
  );
  const isOnboarding = nextUrl.pathname === "/onboarding";
  const isProfileSettings = nextUrl.pathname.startsWith("/profile-settings");

  if (isApiRoute || isPublicRoute) return proceed();

  // Real authenticated user
  if (isLoggedIn) {
    if (isAuthPage) return proceed(NextResponse.redirect(new URL("/", nextUrl)));
    const onboardingCompleted = session?.user?.onboardingCompleted ?? false;
    if (!onboardingCompleted && !isOnboarding)
      return proceed(NextResponse.redirect(new URL("/onboarding", nextUrl)));
    if (onboardingCompleted && isOnboarding)
      return proceed(NextResponse.redirect(new URL("/", nextUrl)));
    return proceed();
  }

  // Guest user — let through most routes, block a few
  if (isGuest) {
    if (isOnboarding) return NextResponse.redirect(new URL("/", nextUrl));
    if (isProfileSettings) return NextResponse.redirect(new URL("/", nextUrl));
    return NextResponse.next();
  }

  // Not logged in, not a guest — send to sign in
  if (!isAuthPage) return NextResponse.redirect(new URL("/signin", nextUrl));
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
