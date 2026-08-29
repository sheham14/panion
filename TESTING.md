# Testing — Panion

## Philosophy

This codebase doesn't chase coverage. The test suite is small and deliberate, focused on the **security boundary** — the points where a bug means data exposure, money loss, or broken trust. Tests like "does this getter return a string" are deliberately absent; the type system already proves them.

## What's covered

| Test file | Proves |
|---|---|
| [tests/api/recipes.test.ts](tests/api/recipes.test.ts) | User A can't read user B's recipes via `/api/recipes` (S1) or `/api/recipes/[id]` (S2) |
| [tests/api/ai-rate-limit.test.ts](tests/api/ai-rate-limit.test.ts) | Guest AI IP ceiling survives cookie clears (S3); extract-recipe hits a daily cap (S4) |
| [tests/api/lists.test.ts](tests/api/lists.test.ts) | List + list-item operations are scoped to the owner |
| [tests/api/watchlist.test.ts](tests/api/watchlist.test.ts) | Watchlist upsert dedupes; DELETE only affects the caller's row |
| [tests/api/pantry.test.ts](tests/api/pantry.test.ts) | Pantry mutations are scoped to the owner |
| [tests/unit/unit-convert.test.ts](tests/unit/unit-convert.test.ts) | Pure unit-conversion logic (no DB) |
| [tests/unit/unit-price.test.ts](tests/unit/unit-price.test.ts) | Unit pricing, multipack quantities, ranking, comparable basis |
| [tests/unit/list-pricing.test.ts](tests/unit/list-pricing.test.ts) | A list total never ranks a store cheapest on a smaller basket, and every excluded item lands in a named bucket |
| [tests/api/watchlist-summary.test.ts](tests/api/watchlist-summary.test.ts) | The home summary ranks on the shared basket — a store dearer per item but missing one no longer wins on its smaller total |
| [tests/api/groups-watch.test.ts](tests/api/groups-watch.test.ts) | `/api/groups` marks what the signed-in user already watches (mocks `auth()` itself; asserts the `true` case so a mis-resolved mock fails loudly) |
| [tests/unit/pricing-match.test.ts](tests/unit/pricing-match.test.ts) | One case per real mismatch the matcher had to be tightened against (rule 8) |
| [tests/unit/pricing-adapters.test.ts](tests/unit/pricing-adapters.test.ts) | PC Express response parsing and normalisation |
| [tests/unit/parse-capture.test.ts](tests/unit/parse-capture.test.ts) | Browser-capture parsing, pinned to real Walmart and Voilà markup |
| [tests/unit/verify-matches.test.ts](tests/unit/verify-matches.test.ts) | The model verifier — failure is never approval |
| [tests/unit/capture-token.test.ts](tests/unit/capture-token.test.ts) | The bearer secret that lets the bookmarklet post cross-site |
| [tests/unit/capture-source-store.test.ts](tests/unit/capture-source-store.test.ts) | A queued batch is pinned to the store its source implies |
| [tests/unit/capture-worklist.test.ts](tests/unit/capture-worklist.test.ts) | The worklist is built from products the selected store is missing |
| [tests/components/MarkdownText.test.tsx](tests/components/MarkdownText.test.tsx) | Clove's reply renderer keeps a numbered list as one list — blank lines and description lines used to split it, so every recipe option rendered as "1." |
| [tests/components/GuestBanner.test.tsx](tests/components/GuestBanner.test.tsx) | GuestBanner renders conditionally based on session state |

S1–S4 reference the findings in [OPUS_AUDIT.md](OPUS_AUDIT.md). Each test corresponds to a real security concern that was identified and fixed.

The security boundary is not the only thing worth a test. The pricing tests
exist for a different reason: a wrong number is quiet. Nothing throws when a
subtotal omits half a list or a misparsed size prices butter at $1090/100g, so
those faults are only ever caught by an assertion that says what the number was
supposed to mean.

## Stack

- **Vitest** — fast, ESM-native, drop-in TypeScript support
- **@testing-library/react** + **jsdom** — for the one component test
- **Real Postgres** via a dedicated test database — integration tests hit actual Prisma queries, not mocked promises
- **Mocked externals** — Anthropic SDK, Redis (in-memory), SendGrid. No real API calls during tests, no token spend, no email sent.
- **Mocked `getAuthenticatedUser`** — tests inject the session they want via `setMockSession()` from `tests/setup.ts`

## Local setup

Either option works — Docker is quicker and costs nothing.

### Option A — Docker (recommended)

1. **Start Postgres**:
   ```
   docker compose up -d
   ```

2. **Create the test database** (once):
   ```
   docker exec sentinel_postgres psql -U sentinel -d sentinel_db -c "CREATE DATABASE sentinel_test"
   ```

3. **Add the URL to `.env.local`**:
   ```
   TEST_DATABASE_URL="postgresql://sentinel:sentinel_dev@localhost:5432/sentinel_test?schema=public"
   ```

### Option B — Neon branch

1. Neon dashboard → your project → "Branches" → "New branch" from main. Copy the connection string.
2. Set it as `TEST_DATABASE_URL` in `.env.local`.

### Then, either way

3. **Push the schema to the test database**:
   ```
   npx prisma db push --url "$TEST_DATABASE_URL"
   ```
   > Prisma 7 removed `--skip-generate` and added `--url`; the datasource
   > otherwise comes from `prisma.config.ts`, which reads `DATABASE_URL`.

4. **Run tests**:
   ```
   npm test          # one-shot
   npm run test:watch
   npm run test:coverage
   ```

`tests/setup.ts` throws if `TEST_DATABASE_URL` is missing — that is deliberate,
so a stray run can never point at the development or production database.

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every push and PR:

- `tsc --noEmit` — typecheck
- Spin up Postgres 16 as a service container
- `prisma db push` against it
- `npm test`

No external dependencies (Anthropic, SendGrid, Redis) — all mocked.

## How tests are isolated

- Vitest is configured with `pool: "forks", singleFork: true` — tests run in a single Node process so the in-memory Redis mock is consistent.
- Each test file calls `resetDb()` in `beforeEach` to truncate user-owned tables (preserving reference data like stores and products).
- The Redis mock is cleared between tests via the global `beforeEach` in `tests/setup.ts`.
- The mock session is reset to `null` between tests, so a test that forgets to call `setMockSession()` will get an unauthenticated request — failing loudly rather than silently using a stale session.

## What I didn't test (and why)

- **Most components.** UI testing has a poor effort/value ratio for a portfolio app. The few worth testing are conditional renderers (`GuestBanner`) and form-validation logic.
- **NextAuth flows.** The auth library is well-tested by its maintainers. The integration points worth verifying — JWT callback, session shape — are exercised indirectly through every API test.
- **Prisma queries themselves.** Trusting the ORM. What I test is that the *route handlers* call the right queries with the right scoping.
- **The Anthropic streaming response.** Mocked. Testing the real Claude response would be slow, expensive, and non-deterministic.

## What's left

If this becomes a real product (not a portfolio piece), the next round of tests would be:

- e2e flow via Playwright (sign in → onboarding → add to watchlist → view alert)
- Property-based tests for `unit-convert.ts` with `fast-check`
- A test for the SW push timer registration flow
- Load tests against the watchlist summary query (P1 in the audit)
