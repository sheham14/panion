/**
 * /api/session/end exists to clear a dead session cookie. On https that
 * cookie is `__Secure-`-prefixed, and browsers ignore a deletion of it that is
 * not itself Secure — the first version of the route made exactly that write.
 */
import { describe, it, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { expireSessionCookies } from "@/lib/session-cookies";

function requestWith(cookie: string) {
  return new NextRequest("https://www.panion.dev/api/session/end", {
    headers: { cookie },
  });
}

describe("expireSessionCookies", () => {
  it("expires the production cookie and its chunks with Secure set", () => {
    const req = requestWith(
      "__Secure-authjs.session-token.0=a; __Secure-authjs.session-token.1=b; theme=dark",
    );
    const res = NextResponse.redirect("https://www.panion.dev/signin");

    expect(expireSessionCookies(req, res)).toEqual([
      "__Secure-authjs.session-token.0",
      "__Secure-authjs.session-token.1",
    ]);
    const setCookie = res.headers.getSetCookie();
    expect(setCookie).toHaveLength(2);
    for (const header of setCookie) {
      expect(header).toMatch(/^__Secure-authjs\.session-token\.\d=;/);
      expect(header).toMatch(/Max-Age=0/i);
      expect(header).toMatch(/;\s*Secure/i);
    }
  });

  it("expires the local cookie without Secure, and leaves others alone", () => {
    const req = requestWith("authjs.session-token=a; panion-guest=1");
    const res = NextResponse.redirect("http://localhost:3000/signin");

    expect(expireSessionCookies(req, res)).toEqual(["authjs.session-token"]);
    const [header] = res.headers.getSetCookie();
    expect(header).toMatch(/^authjs\.session-token=;/);
    expect(header).not.toMatch(/Secure/i);
  });
});
