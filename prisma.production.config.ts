import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

/**
 * Prisma config that **deliberately targets production**.
 *
 *   npx prisma migrate status --config prisma.production.config.ts
 *   npx prisma migrate deploy --config prisma.production.config.ts
 *
 * The default `prisma.config.ts` loads `.env` and then `.env.local` with
 * `override: true`, so every ordinary Prisma command resolves the *local*
 * database (CLAUDE.md rule 2). That is the right default and must stay.
 * Reaching production therefore has to be an explicit, visible act — this
 * file, named in the command line, is that act.
 *
 * `.env.local` is not loaded here, so `DATABASE_URL` stays the Neon URL from
 * `.env`. The guard below refuses to run against anything that is not Neon, so
 * a misconfigured `.env` fails loudly instead of quietly migrating localhost.
 *
 * `migrate deploy` is the only migrate command safe to point here: it applies
 * pending migrations and never resets. Never run `migrate dev` or
 * `migrate reset` with this config.
 */
loadEnv({ path: ".env" });

const url = process.env["DATABASE_URL"];

if (!url) {
  throw new Error("DATABASE_URL is not set in .env — refusing to run.");
}

if (!/neon\.tech/i.test(url)) {
  const host = url.match(/@([^/?]+)/)?.[1] ?? "(unparseable)";
  throw new Error(
    `prisma.production.config.ts expects the Neon production database, but ` +
      `.env resolves to "${host}". Refusing to run. Use the default ` +
      `prisma.config.ts for local work.`,
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
