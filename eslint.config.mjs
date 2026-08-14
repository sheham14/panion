import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * ESLint 9 flat config.
 *
 * Replaces `.eslintrc.json`: ESLint 9 no longer reads the legacy format, and
 * Next 16 removed the `next lint` command — so `npm run lint` was failing on
 * both counts. `eslint-config-next` 16 exports native flat-config arrays, so
 * these spread in directly (no `FlatCompat` shim).
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/generated/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
