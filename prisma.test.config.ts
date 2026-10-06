import { existsSync, readFileSync } from "fs";
import { parse } from "dotenv";
import { defineConfig } from "prisma/config";

/**
 * Prisma config that **deliberately targets the test database**.
 *
 *   npx prisma db push --config prisma.test.config.ts   (what `npm run test:setup` runs)
 *
 * The default `prisma.config.ts` loads `.env.local` with `override: true`, so
 * a `DATABASE_URL` passed in from outside is silently replaced by the dev
 * database. `test:setup` passed `DATABASE_URL=$TEST_DATABASE_URL` and relied
 * on it, so until 2026-10-06 it pushed the schema to `sentinel_db` and never
 * touched `sentinel_test`. Naming this file is how the test database is
 * reached, the same way `prisma.production.config.ts` is for production.
 *
 * The guard refuses a TEST_DATABASE_URL that is really the dev or production
 * database, since `db push` alters whatever it is pointed at.
 */
const read = (path: string): Record<string, string> =>
  existsSync(path) ? parse(readFileSync(path)) : {};

const production = read(".env");
const local = read(".env.local");

const url = process.env["TEST_DATABASE_URL"] ?? local["TEST_DATABASE_URL"];

if (!url) {
  throw new Error("TEST_DATABASE_URL is not set (see TESTING.md) — refusing to run.");
}

/** Host and database name: what makes two URLs the same database. */
const identity = (raw: string | undefined) => {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return null;
  }
};

for (const [file, other] of [
  [".env", production["DATABASE_URL"]],
  [".env.local", local["DATABASE_URL"]],
] as const) {
  if (identity(other) === identity(url)) {
    throw new Error(
      `TEST_DATABASE_URL is the same database as DATABASE_URL in ${file} ` +
        `(${identity(url)}). Refusing to run — db push would alter it.`,
    );
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
