import { requireElevatedRole } from "@/lib/admin/require-role";

/**
 * Throws on purpose, so a moderator can confirm server errors reach Sentry.
 *
 * Production went weeks with Sentry silently off (no DSN), and nothing showed
 * it. After changing the DSN or the Sentry setup, open this while signed in
 * and look for the error in the dashboard. Moderators and store admins only,
 * so nobody else can fill the dashboard with test noise.
 */
export async function GET() {
  const { error } = await requireElevatedRole();
  if (error) return error;

  throw new Error(
    `Sentry test error (${new Date().toISOString()}) — thrown on purpose by /api/admin/sentry-test, safe to ignore`,
  );
}
