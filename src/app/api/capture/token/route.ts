import { NextResponse } from "next/server";
import { requireElevatedRole } from "@/lib/admin/require-role";
import { issueCaptureToken } from "@/lib/capture/token";

/**
 * Issue a capture token for the signed-in moderator.
 *
 * Behind a session and an elevated role, unlike `/api/capture/submit` which the
 * token itself authenticates. Issuing revokes any previous token for the user,
 * so a lost bookmark is retired simply by generating another — and the
 * plaintext is returned exactly once, here.
 */
export async function POST() {
  const { user, error } = await requireElevatedRole();
  if (error) return error;

  const token = await issueCaptureToken(user.id);

  return NextResponse.json({ token });
}
