import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session?.user;
  const isGuest = req.cookies.get("panion-guest")?.value === "1";

  const isAuthPage =
    nextUrl.pathname.startsWith("/signin") ||
    nextUrl.pathname.startsWith("/welcome");
  const isApiRoute = nextUrl.pathname.startsWith("/api");
  const isPublicRoute = ["/privacy", "/feedback", "/terms", "/welcome"].includes(
    nextUrl.pathname,
  );
  const isOnboarding = nextUrl.pathname === "/onboarding";
  const isProfileSettings = nextUrl.pathname.startsWith("/profile-settings");

  if (isApiRoute || isPublicRoute) return NextResponse.next();

  // Real authenticated user
  if (isLoggedIn) {
    if (isAuthPage) return NextResponse.redirect(new URL("/", nextUrl));
    const onboardingCompleted = session?.user?.onboardingCompleted ?? false;
    if (!onboardingCompleted && !isOnboarding)
      return NextResponse.redirect(new URL("/onboarding", nextUrl));
    if (onboardingCompleted && isOnboarding)
      return NextResponse.redirect(new URL("/", nextUrl));
    return NextResponse.next();
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