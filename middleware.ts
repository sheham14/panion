import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session?.user;
  const isAuthPage =
    nextUrl.pathname.startsWith("/signin") ||
    nextUrl.pathname.startsWith("/welcome");
  const isApiRoute = nextUrl.pathname.startsWith("/api");
  const isPublicRoute = ["/privacy", "/feedback", "/terms", "/welcome"].includes(
    nextUrl.pathname,
  );
  const isOnboarding = nextUrl.pathname === "/onboarding";

  if (isApiRoute || isPublicRoute) return NextResponse.next();

  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/signin", nextUrl));
  }

  if (isLoggedIn) {
    const onboardingCompleted = session?.user?.onboardingCompleted ?? false;
    if (!onboardingCompleted && !isOnboarding) {
      return NextResponse.redirect(new URL("/onboarding", nextUrl));
    }
    if (onboardingCompleted && isOnboarding) {
      return NextResponse.redirect(new URL("/", nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};