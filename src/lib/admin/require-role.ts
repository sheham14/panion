import { NextResponse } from "next/server";
import { getAuthenticatedUser, type AuthenticatedUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { forbidden } from "@/lib/api-error";

/**
 * Role gate for admin-only endpoints.
 *
 * `getAuthenticatedUser()` only proves *who* the caller is — the session
 * carries no role, so the role has to be read from the database on every
 * privileged call. Trusting a session claim here would let a stale token keep
 * write access after a demotion.
 *
 * There is no `admin` value in `UserRole` (it is `consumer | moderator |
 * store_admin`), so price entry is gated on the two non-consumer roles.
 */
export type ElevatedRole = "moderator" | "store_admin";

const ELEVATED: readonly ElevatedRole[] = ["moderator", "store_admin"];

export type RoleResult =
  | {
      user: AuthenticatedUser;
      role: ElevatedRole;
      /** Set for `store_admin` — the only store they may write to. */
      managedStoreId: string | null;
      error: null;
    }
  | { user: null; role: null; managedStoreId: null; error: NextResponse };

const deny = (error: NextResponse): RoleResult => ({
  user: null,
  role: null,
  managedStoreId: null,
  error,
});

/**
 * Require an elevated role, returning the caller's store scope.
 *
 * A `store_admin` is deliberately scoped to `managedStoreId`: the whole point
 * of that role is a partner store maintaining its own prices, and it must not
 * be able to write a competitor's.
 */
export async function requireElevatedRole(): Promise<RoleResult> {
  const { user, error } = await getAuthenticatedUser();
  if (error) return deny(error);

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, managedStoreId: true, deletedAt: true },
  });

  // A soft-deleted account keeps its row until the purge job runs; it must not
  // keep its privileges in the meantime.
  if (!record || record.deletedAt !== null) {
    return deny(forbidden("Not permitted"));
  }

  if (!ELEVATED.includes(record.role as ElevatedRole)) {
    return deny(forbidden("Not permitted"));
  }

  return {
    user,
    role: record.role as ElevatedRole,
    managedStoreId: record.managedStoreId,
    error: null,
  };
}

/**
 * Whether this caller may write prices for `storeId`.
 *
 * Moderators may write anywhere; a store admin only to the store they manage.
 */
export function canWriteStore(
  role: ElevatedRole,
  managedStoreId: string | null,
  storeId: string,
): boolean {
  if (role === "moderator") return true;
  return managedStoreId !== null && managedStoreId === storeId;
}
