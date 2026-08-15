import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Match Next.js env precedence: .env first, then .env.local overriding it.
//
// Previously this was a bare `import "dotenv/config"`, which loads ONLY `.env`.
// That meant the Prisma CLI and the app resolved *different databases* from the
// same checkout — with `.env` pointing at Neon production, `prisma migrate dev`
// targeted production and offered to reset it, while `npm run dev` used the
// local database. Keep these in sync.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: { url: process.env["DATABASE_URL"] },
});
