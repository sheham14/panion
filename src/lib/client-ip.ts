/**
 * The client's IP, for rate-limit keys.
 *
 * Vercel sets `x-real-ip` to the connecting client and overwrites any value a
 * client sends, so it is preferred. The first `x-forwarded-for` hop is
 * whatever the client claimed, so it is only a fallback (local dev, other
 * hosts).
 */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
