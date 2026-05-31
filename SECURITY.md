# Security Overview

Last audited: 2026-05-26 (Opus full-stack review)

The authorization-critical paths are covered by integration tests — see [`TESTING.md`](TESTING.md). Run `npm test` before deploying to verify nothing has regressed.

---

## Authentication

- **Provider:** Google OAuth + magic-link email (SendGrid) via next-auth v5 (beta.30)
- **Session strategy:** JWT (stateless, Edge-compatible)
- **Token storage:** Signed JWT in httpOnly cookie (managed by next-auth)
- **Secret:** `AUTH_SECRET` environment variable — required, not hardcoded
- **Config split:** `auth.config.ts` is Edge-safe (no Prisma); `auth.ts` runs Node only with Prisma adapter. Middleware uses the Edge config to avoid cold-start DB calls.

### JWT Claims

`onboardingCompleted` is written to the JWT only on `trigger === "signIn" | "signUp"` (DB lookup via `token.sub`) and updated on `trigger === "update"` (client-initiated via `useSession().update()`). `token.sub` is always the DB user cuid — never the OAuth subject directly.

---

## Authorization

### Middleware (`middleware.ts`)

All route protection is enforced at the Edge before any page or API handler runs:

| Condition | Outcome |
|---|---|
| Unauthenticated + protected route | Redirect → `/signin` |
| Authenticated + auth page | Redirect → `/` |
| Authenticated + `onboardingCompleted: false` + not `/onboarding` | Redirect → `/onboarding` |
| Authenticated + `onboardingCompleted: true` + `/onboarding` | Redirect → `/` |

Public routes exempt from auth: `/privacy`, `/feedback`, `/terms`, `/welcome`.
API routes pass through middleware — they enforce auth independently.

### API Route Authorization

Every protected API route calls `getAuthenticatedUser()` which wraps `auth()` and returns a typed user or a 401 response. All database queries are scoped to `userId` from the session token — never from request body or URL params alone.

#### Ownership verification pattern

Routes that operate on user-owned resources (lists, recipes, pantry, watchlist, alerts) use one of:

1. **Inline scope:** `prisma.X.findFirst({ where: { id, userId: user.id } })` — 404 if not owned
2. **Dedicated verifier:** e.g., `verifyListOwner(listId, userId)` before any mutation

---

## Vulnerability History

### [2026-05-26] Recipe IDOR — `/api/recipes` and `/api/recipes/[id]` (FIXED)

**Files:** `src/app/api/recipes/route.ts`, `src/app/api/recipes/[id]/route.ts`
**Severity:** Critical
**CVE-class:** Insecure Direct Object Reference / broken access control

**Root cause:** Both GET handlers were missing authentication checks entirely. `GET /api/recipes` returned every recipe in the database (no `userId` filter); `GET /api/recipes/[id]` allowed any visitor to read any recipe by ID. The corresponding page route filtered correctly, but the API endpoints were wide open.

**Fix:** Added `getAuthenticatedUser()` checks to both handlers. The list endpoint now scopes with `OR: [{ userId: user.id }, { userId: null }]`. The detail endpoint returns 404 unless the recipe is owned by the caller or is a system recipe (`userId: null`).

**Test coverage:** `tests/api/recipes.test.ts` — verifies user A cannot enumerate or read user B's recipes.

### [2026-05-26] AI cost-protection bypass via cookie reset (FIXED)

**Files:** `src/app/api/ai/ask/route.ts`, `src/app/api/ai/sessions/[id]/messages/route.ts`
**Severity:** High
**CVE-class:** Insufficient resource control / rate-limit bypass

**Root cause:** The guest AI rate-limit key was derived solely from the `panion-guest-id` cookie. An attacker could clear cookies, hit `POST /api/guest/enter` to obtain a fresh guest ID, and reset their quota arbitrarily. This translates directly to Anthropic API spend.

**Fix:** Added an IP-derived secondary ceiling (`guest:ai:ip:<ip>`) with a 15-request daily limit on both AI entry points. The IP key persists across cookie clears.

**Test coverage:** `tests/api/ai-rate-limit.test.ts` — exercises 25 attempts across 5 rotated cookies from a single IP and asserts the 16th is rejected.

### [2026-05-26] Unbounded AI cost on `/api/ai/extract-recipe` (FIXED)

**File:** `src/app/api/ai/extract-recipe/route.ts`
**Severity:** High
**CVE-class:** Insufficient resource control

**Root cause:** The endpoint had no per-user rate limit. An authenticated user could fire unlimited Anthropic calls.

**Fix:** Added the existing `featureUsage` daily-cap pattern (20 calls/user/day) with `feature: "extract_recipe"`.

**Test coverage:** `tests/api/ai-rate-limit.test.ts` — pre-seeds 20 usage rows and asserts the 21st request returns 429.

### [2026-05-26] User data logged to console (FIXED)

**Files:** `src/app/api/lists/[id]/items/route.ts`, `src/app/api/onboarding/complete/route.ts`
**Severity:** Medium
**CVE-class:** Information disclosure

**Root cause:** `console.log(body)` and `console.log("storeIds received:", ...)` left in route handlers, writing user data to Vercel logs.

**Fix:** Removed both lines.

### [2026-05-24] IDOR — List Items (FIXED — commit `b485d09`)

**File:** `src/app/api/lists/[id]/items/route.ts`
**Severity:** High
**CVE-class:** Insecure Direct Object Reference

**Root cause:** `PATCH` and `DELETE` handlers called `verifyListOwner(id, user.id)` to confirm ownership of the list at URL param `id`, but then executed `prisma.listItem.update/delete({ where: { id: itemId } })` using `itemId` from the request body with no scope check back to the verified list. An attacker who knew a victim's item UUID could modify or delete it by passing their own list ID to bypass the ownership check.

**Fix:** Added a `prisma.listItem.findFirst({ where: { id: itemId, listId: id } })` guard in both handlers. Returns 404 if the item doesn't belong to the verified list before any write executes.

**Test coverage:** `tests/api/lists.test.ts` — verifies cross-list item PATCH is rejected.

---

## Input Validation

- All API request bodies are validated with **Zod** schemas before processing
- Prisma parameterizes all queries — no raw SQL, no injection surface
- File uploads: not implemented (no user-uploaded content)
- External data ingestion: store/product/price data is seeded or admin-controlled, not user-supplied

---

## Data Exposure

- `user/export` route (`GET /api/user/export`) returns only the authenticated user's own data
- `user/delete` route (`DELETE /api/user/delete`) deletes only the authenticated user
- No admin-level endpoints are exposed publicly
- No PII is logged — only non-identifying operational data (storeIds, counts, errors)

---

## Dependencies

- next-auth manages session security (cookie signing, CSRF protection for sign-in flows)
- Prisma ORM prevents SQL injection by construction
- Dependency vulnerability scanning: run `npm audit` before each production deploy

---

## Pre-Deploy Checklist

- [ ] `AUTH_SECRET` set in production environment (min 32 chars, random)
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set and scoped to production domain
- [ ] `DATABASE_URL` points to production DB with TLS
- [ ] `NEXTAUTH_URL` set to production origin
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` set (web push)
- [ ] `SENDGRID_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` set (magic link + admin notifications)
- [ ] `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` set (rate limits)
- [ ] `npm audit` — no high/critical findings
- [ ] `npm test` — all tests pass
- [ ] Verify middleware matcher covers all protected routes
