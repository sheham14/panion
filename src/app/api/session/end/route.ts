import { NextResponse, type NextRequest } from "next/server";
import { auth } from "../../../../../auth";

/**
 * Where a page sends a request whose session cookie no longer holds a session,
 * on its way to /signin.
 *
 * The case that needs it: an account is deleted while its JWT cookie is still
 * valid. `auth()` then reports no session (the `jwt` callback in auth.ts
 * returns null), but a page cannot clear cookies, and middleware, which only
 * decodes the cookie, still sees a signed-in user. A page redirecting straight
 * to /signin would be sent back to / by middleware, and / back to /signin, for
 * ever. A route handler can clear the cookie, which ends the loop.
 *
 * A live session is never touched (it goes home), so a link to this route
 * cannot sign anyone out.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (session?.user?.id) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const res = NextResponse.redirect(new URL("/signin", request.url));
  for (const { name } of request.cookies.getAll()) {
    // authjs.session-token, __Secure-authjs.session-token, and their .0/.1 chunks.
    if (name.includes("authjs.session-token")) {
      res.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
  }
  return res;
}
