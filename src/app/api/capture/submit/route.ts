import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { parseCapture } from "@/lib/capture/parse-capture";
import { resolveCaptureToken } from "@/lib/capture/token";

/**
 * Queue a browser capture for review.
 *
 * Called by the bookmarklet from the retailer's own origin, so it is the one
 * endpoint here that answers cross-origin requests. Three properties make that
 * safe:
 *
 *  1. **No credentials.** Authentication is a bearer token in the body, never a
 *     cookie, so `Access-Control-Allow-Origin: *` grants nothing to a hostile
 *     page — it can forge a request but cannot know the secret.
 *  2. **No price is written.** A valid token can only enqueue a payload for a
 *     signed-in moderator to review. Writing still goes through
 *     `/api/capture/import` behind a session and a human confirmation. This is
 *     the important one: captures carry no barcode, so every match is
 *     name-and-size, and that path has produced real mismatches (a bag of
 *     nuggets priced as breasts; four Dempster's loaves collapsed onto one
 *     catalogue row). Removing the paste step is ergonomics. Removing the human
 *     from the match decision would be a different and much worse change.
 *  3. **Bounded.** Rate-limited per token, and the queue is capped.
 *
 * Nothing is fetched here. The payload came from a page a person opened in
 * their own browser — the distinction that makes this legitimate where an
 * automated fetcher is not (DATA-SOURCING.md §1.1).
 */

/** Generous enough for a long capture session, low enough to bound abuse. */
const HOURLY_LIMIT = 120;
/** Pending batches a user may accumulate before they have to review some. */
const MAX_PENDING = 200;
const MAX_BYTES = 4_000_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: CORS });

export async function OPTIONS(req: NextRequest) {
  const headers: Record<string, string> = { ...CORS };

  /*
   * Private Network Access.
   *
   * walmart.ca is a public origin and `localhost` is a private one, so Chrome
   * treats the capture POST as a private-network request: the preflight
   * carries `Access-Control-Request-Private-Network: true` and the response
   * must opt in explicitly, on top of ordinary CORS. Without this the fetch
   * fails before it is sent and the bookmarklet silently falls back to the
   * clipboard — which is exactly how this was found.
   *
   * Echoed only when asked for, so a deployment reached over the public
   * internet never advertises it.
   */
  if (req.headers.get("access-control-request-private-network") === "true") {
    headers["Access-Control-Allow-Private-Network"] = "true";
  }

  return new NextResponse(null, { status: 204, headers });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return json({ error: "Capture too large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Malformed JSON" }, 400);
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const token = typeof record.token === "string" ? record.token : null;
  const capture = record.capture;

  const owner = await resolveCaptureToken(token);
  if (!owner) {
    // Deliberately identical for a missing, malformed, revoked, or demoted
    // token — a caller learns only that it did not work.
    return json({ error: "Invalid capture token" }, 401);
  }

  const key = `capture:submit:${owner.tokenId}:${new Date().getUTCHours()}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, 60 * 60);
  if (used > HOURLY_LIMIT) {
    return json({ error: "Too many captures this hour" }, 429);
  }

  const parsed = parseCapture(capture);
  const isDiagnostic =
    typeof capture === "object" &&
    capture !== null &&
    "diagnostic" in (capture as Record<string, unknown>);

  if (parsed.items.length === 0 && !isDiagnostic) {
    return json({ error: "No usable products in that capture" }, 400);
  }

  const pending = await prisma.captureBatch.count({
    where: { userId: owner.userId, status: "pending" },
  });
  if (pending >= MAX_PENDING) {
    return json(
      { error: `You have ${pending} captures waiting for review. Review some first.` },
      409,
    );
  }

  const capturedAtRaw =
    typeof capture === "object" && capture !== null
      ? (capture as Record<string, unknown>).capturedAt
      : null;
  const capturedAt =
    typeof capturedAtRaw === "string" && !Number.isNaN(Date.parse(capturedAtRaw))
      ? new Date(capturedAtRaw)
      : null;

  const batch = await prisma.captureBatch.create({
    data: {
      userId: owner.userId,
      source: parsed.source,
      url: parsed.url,
      payload: capture as never,
      itemCount: parsed.items.length,
      capturedAt,
    },
    select: { id: true },
  });

  await prisma.captureToken.update({
    where: { id: owner.tokenId },
    data: { lastUsedAt: new Date() },
  });

  return json(
    {
      ok: true,
      batchId: batch.id,
      items: parsed.items.length,
      diagnostic: isDiagnostic,
      pending: pending + 1,
    },
    201,
  );
}
