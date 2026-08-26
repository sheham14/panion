import { config as loadEnv } from "dotenv";

/*
 * Local by default, matching `prisma.config.ts` (CLAUDE.md rule 2).
 * `--production` redirects only DATABASE_URL, and refuses to run if `.env`
 * does not resolve to Neon.
 */
const TARGET_PRODUCTION = process.argv.includes("--production");

loadEnv({ path: ".env" });
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;
loadEnv({ path: ".env.local", override: true });
if (TARGET_PRODUCTION) process.env.DATABASE_URL = PRODUCTION_DATABASE_URL;

if (TARGET_PRODUCTION && !/neon\.tech/i.test(process.env.DATABASE_URL ?? "")) {
  console.error(
    "\n❌ --production expects the Neon database, but .env does not resolve to one. Refusing to run.\n",
  );
  process.exit(1);
}

/**
 * Grant or revoke an elevated role.
 *
 *   npm run role -- list
 *   npm run role -- grant you@example.com moderator
 *   npm run role -- revoke you@example.com
 *   npm run role -- list --production
 *   npm run role -- grant you@example.com moderator --production
 *
 * The admin import page reads the role from the database on every request
 * rather than trusting the session, so a change here takes effect immediately.
 *
 * Prints the target database host on start — this writes privileges, and
 * granting on the wrong database looks like success while leaving the real
 * account unprivileged.
 *
 * A role can only be granted to a row that already exists, and there is no
 * password login (rule 11): sign in with Google on the target deployment
 * first, which creates the `User` row, then grant.
 */
const ROLES = ["consumer", "moderator", "store_admin"] as const;
type Role = (typeof ROLES)[number];

async function main() {
  // Flags are dropped so `--production` cannot be read as the email.
  const [cmd, email, role] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const { prisma } = await import("@/lib/prisma");

  const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1];
  console.log(
    `\n▸ ${TARGET_PRODUCTION ? "PRODUCTION " : ""}${host ?? "(unknown DB)"}\n`,
  );

  if (cmd === "list" || !cmd) {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { email: true, name: true, role: true },
      orderBy: { email: "asc" },
      take: 50,
    });
    for (const u of users) {
      console.log(`  ${String(u.role).padEnd(12)} ${u.email}`);
    }
    console.log(`\nusage: npm run role -- grant <email> <${ROLES.join("|")}>`);
    return;
  }

  if (!email) throw new Error("An email is required");

  if (cmd === "revoke") {
    const u = await prisma.user.update({
      where: { email },
      data: { role: "consumer", managedStoreId: null },
    });
    console.log(`  ${u.email} -> consumer`);
    return;
  }

  if (cmd !== "grant") throw new Error(`Unknown command "${cmd}"`);
  if (!ROLES.includes(role as Role)) {
    throw new Error(`Role must be one of: ${ROLES.join(", ")}`);
  }

  const u = await prisma.user.update({
    where: { email },
    data: { role: role as Role },
  });
  console.log(`  ${u.email} -> ${role}`);
}

main()
  .catch((err) => {
    console.error(`\n✖ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  })
  .then(() => process.exit(0));
