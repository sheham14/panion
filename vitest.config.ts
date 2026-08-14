import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    pool: "forks",
    fileParallelism: false, // serialize so tests share the DB without colliding
    testTimeout: 15_000,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    server: {
      deps: {
        // next-auth imports `next/server` without a file extension. Node's
        // strict ESM resolver refuses that, which is what broke the CI test
        // job (audit H1). Inlining makes Vite transform the package instead of
        // handing it to Node's resolver.
        inline: ["next-auth", "@auth/prisma-adapter"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx", "auth.ts", "auth.config.ts", "middleware.ts"],
      exclude: ["src/app/generated/**", "prisma/generated/**", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
