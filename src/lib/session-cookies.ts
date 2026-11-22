import type { NextRequest, NextResponse } from "next/server";

/**
 * Expire every Auth.js session cookie the request carries on `res`:
 * `authjs.session-token`, and on https `__Secure-authjs.session-token`, plus
 * the `.0`/`.1` chunks a large token is split into.
 *
 * A browser ignores any write to a `__Secure-` cookie, deletion included,
 * unless the write is itself marked Secure. Without the flag, production's
 * cookie would survive and /api/session/end would not end anything.
 */
export function expireSessionCookies(req: NextRequest, res: NextResponse): string[] {
  const cleared: string[] = [];
  for (const { name } of req.cookies.getAll()) {
    if (!name.includes("authjs.session-token")) continue;
    res.cookies.set(name, "", {
      maxAge: 0,
      path: "/",
      ...(name.startsWith("__Secure-") && { secure: true }),
    });
    cleared.push(name);
  }
  return cleared;
}
