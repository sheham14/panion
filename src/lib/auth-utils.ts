import { auth } from "../../auth";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

/**
 * Send a page request that has no session to sign in. Goes through
 * /api/session/end rather than straight to /signin, because a cookie whose
 * account was deleted still looks signed in to middleware and would bounce
 * between /signin and / (see that route).
 */
export function redirectToSignIn(): never {
  redirect("/api/session/end");
}

export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type AuthResult =
  | { user: AuthenticatedUser; error: null }
  | { user: null; error: NextResponse };

export async function getAuthenticatedUser(): Promise<AuthResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    error: null,
  };
}
