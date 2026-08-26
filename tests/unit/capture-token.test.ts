import { describe, it, expect } from "vitest";
import { generateCaptureToken, hashCaptureToken } from "@/lib/capture/token";
import { bookmarkletHref, BOOKMARKLET_SOURCE } from "@/lib/capture/bookmarklet";

/**
 * The token is what lets the bookmarklet post from walmart.ca, so its
 * properties are security properties: unguessable, never stored in the clear,
 * and absent from the bookmark unless deliberately armed.
 */

describe("generateCaptureToken", () => {
  it("produces a long, url-safe, non-repeating secret", () => {
    const a = generateCaptureToken();
    const b = generateCaptureToken();
    expect(a).not.toBe(b);
    // 32 random bytes in base64url — no padding, no characters needing escaping.
    expect(a.length).toBeGreaterThanOrEqual(42);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashCaptureToken", () => {
  it("is a stable sha256 hex digest", () => {
    const token = "example-token-value";
    expect(hashCaptureToken(token)).toBe(hashCaptureToken(token));
    expect(hashCaptureToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not embed the plaintext", () => {
    // The stored value must not reveal the secret it stands for.
    expect(hashCaptureToken("hunter2")).not.toContain("hunter2");
    expect(hashCaptureToken("a")).not.toBe(hashCaptureToken("b"));
  });
});

describe("bookmarkletHref", () => {
  it("leaves the placeholders unbound when nothing is supplied", () => {
    const href = decodeURIComponent(bookmarkletHref());
    // Unarmed, it must fall back to the clipboard rather than post anywhere.
    expect(href).toContain("var TOKEN = null");
    expect(href).toContain("var ENDPOINT = null");
    expect(href).not.toContain("__TOKEN__");
    expect(href).not.toContain("__ENDPOINT__");
  });

  it("arms with the token and this deployment's own endpoint", () => {
    const href = decodeURIComponent(
      bookmarkletHref({ token: "s3cret-token", origin: "http://localhost:3000" }),
    );
    expect(href).toContain('var TOKEN = "s3cret-token"');
    expect(href).toContain('var ENDPOINT = "http://localhost:3000/api/capture/submit"');
  });

  it("omits the endpoint when only a token is known", () => {
    // Without somewhere to send it, the token must not be embedded uselessly
    // in a bookmark that then falls back to the clipboard anyway.
    const href = decodeURIComponent(bookmarkletHref({ token: "abc" }));
    expect(href).toContain("var ENDPOINT = null");
  });

  it("is a javascript: url that survives encoding", () => {
    const href = bookmarkletHref({ token: "t", origin: "https://panion.app" });
    expect(href.startsWith("javascript:")).toBe(true);
    // Characters that would break an href attribute must not appear raw.
    expect(href).not.toContain('"');
    expect(href).not.toContain(" ");
  });
});

describe("bookmarklet source", () => {
  it("is syntactically valid JavaScript", () => {
    // The source lives inside a template literal, so a stray backtick in a
    // comment silently terminates the string and mangles everything after it.
    // `new Function` compiles without executing, so undefined browser globals
    // are irrelevant — this only asks whether it parses.
    expect(() => new Function(BOOKMARKLET_SOURCE)).not.toThrow();
    // Same check on what actually ships, after collapsing and substitution.
    const armed = decodeURIComponent(
      bookmarkletHref({ token: "t", origin: "https://example.test" }),
    ).replace(/^javascript:/, "");
    expect(() => new Function(armed)).not.toThrow();
  });

  it("never writes prices — it only posts to the review queue", () => {
    // Auto-submit is an ergonomic change. If this ever points at the import
    // endpoint it would bypass the human match review, which is the one thing
    // standing between a name-and-size guess and a wrong price.
    expect(BOOKMARKLET_SOURCE).not.toContain("/api/capture/import");
    expect(BOOKMARKLET_SOURCE).toContain("credentials: 'omit'");
  });

  it("falls back to the clipboard when it cannot reach Panion", () => {
    expect(BOOKMARKLET_SOURCE).toContain("copyInstead");
    expect(BOOKMARKLET_SOURCE).toContain("Could not reach Panion");
  });

  it("posts as a CORS simple request, so no preflight can meet a redirect", () => {
    // panion.dev 307-redirects to www.panion.dev. A preflight that meets a
    // redirect is a hard error by spec, which is what made auto-submit fail
    // silently in production while working locally. text/plain keeps the POST
    // preflight-free; the endpoint reads the body with req.text() anyway.
    expect(BOOKMARKLET_SOURCE).toContain("'Content-Type': 'text/plain;charset=UTF-8'");
    expect(BOOKMARKLET_SOURCE).not.toContain("'Content-Type': 'application/json'");
  });

  it("styles the toast through the CSSOM, not a style attribute", () => {
    // A retailer serving style-src without 'unsafe-inline' strips a style
    // attribute, leaving the toast unstyled and below the fold — which reads
    // as the bookmarklet having done nothing at all.
    expect(BOOKMARKLET_SOURCE).not.toContain("setAttribute('style'");
    expect(BOOKMARKLET_SOURCE).toContain("s.setProperty('position','fixed')");
  });
});
