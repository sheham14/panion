/**
 * One-shot script to prepare the test database.
 * Usage: TEST_DATABASE_URL=... npx tsx tests/helpers/setup-test-db.ts
 *
 * What it does:
 *   1. Validates TEST_DATABASE_URL is set
 *   2. Pushes the Prisma schema to it
 *   3. Confirms ready
 */
import { config } from "dotenv";
import { execSync } from "child_process";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../.env.local") });

if (!process.env.TEST_DATABASE_URL) {
  console.error("❌ TEST_DATABASE_URL is not set.");
  console.error("");
  console.error("Setup steps:");
  console.error("  1. Create a Neon branch in your Neon dashboard (or any separate Postgres)");
  console.error("  2. Copy the connection string");
  console.error("  3. Add TEST_DATABASE_URL=... to .env.local");
  console.error("  4. Re-run: npm run test:setup");
  process.exit(1);
}

console.log("→ Pushing schema to test database...");
execSync("npx prisma db push", {
  env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  stdio: "inherit",
});

console.log("✅ Test database is ready. Run `npm test`.");
