import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

/**
 * Grant or revoke an elevated role.
 *
 *   npm run role -- list
 *   npm run role -- grant you@example.com moderator
 *   npm run role -- revoke you@example.com
 *
 * The admin import page reads the role from the database on every request
 * rather than trusting the session, so a change here takes effect immediately.
 *
 * Prints the target database host on start — `.env` is production and
 * `.env.local` is local, and this writes privileges.
 */
const ROLES = ["consumer", "moderator", "store_admin"] as const;
type Role = (typeof ROLES)[number];

async function main() {
  const [cmd, email, role] = process.argv.slice(2);
  const { prisma } = await import("@/lib/prisma");

  const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1];
  console.log(`\n▸ ${host ?? "(unknown DB)"}\n`);

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
