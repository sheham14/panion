import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { validateBody } from "@/lib/validate";
import { badRequest, forbidden } from "@/lib/api-error";

/**
 * Push services we're willing to store an endpoint for.
 *
 * The server later calls `web-push` against whatever URL is stored, so an
 * unvalidated endpoint is an arbitrary-outbound-request primitive. Restricting
 * to the known browser push services removes that (audit M5).
 */
const ALLOWED_PUSH_HOSTS = [
  "android.googleapis.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "updates-autopush.stage.mozaws.net",
  "notify.windows.com",
  "push.apple.com",
];

const isAllowedEndpoint = (raw: string): boolean => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return ALLOWED_PUSH_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
};

const SubscribeSchema = z.object({
  endpoint: z.string().url().max(2048).refine(isAllowedEndpoint, {
    message: "Endpoint must be a known HTTPS push service URL",
  }),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { data, error: invalid } = await validateBody(req, SubscribeSchema);
  if (invalid) return invalid;

  const { endpoint, keys } = data;

  // `PushSubscription.endpoint` is globally unique, so a bare
  // `upsert({ where: { endpoint } })` let user B post user A's endpoint and
  // have the update branch reassign that row's userId to B — a cross-user
  // write. Check ownership before touching an existing row (audit M5).
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { userId: true },
  });

  if (existing && existing.userId !== user.id) {
    return forbidden("This push endpoint is registered to another account");
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh: keys.p256dh, auth: keys.auth },
    create: {
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  let body: { endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) return badRequest("endpoint is required");

  // Already scoped to the caller, so this cannot delete someone else's row.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
