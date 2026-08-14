# Codebase Map

A file-by-file reference for the Sentinel / Panion grocery price comparison app. Start here if you're new to the repo.

---

## Table of Contents

1. [Architecture at a Glance](#architecture-at-a-glance)
2. [Root Files](#root-files)
3. [Database — `prisma/`](#database--prisma)
4. [Pages — `src/app/`](#pages--srcapp)
5. [API Routes — `src/app/api/`](#api-routes--srcappapi)
6. [Components — `src/components/`](#components--srccomponents)
7. [Utilities — `src/lib/`](#utilities--srclib)
8. [Hooks — `src/hooks/`](#hooks--srchooks)
9. [Types — `src/types/`](#types--srctypes)
10. [Tests — `tests/`](#tests--tests)

---

## Architecture at a Glance

| Layer | Technology |
|---|---|
| Framework | Next.js 16, React 18, TypeScript |
| Styling | Tailwind CSS, DM Sans (Google Fonts), dark mode, mobile-first (max-width 384px) |
| Auth | next-auth v5 (Google OAuth + magic link via SendGrid, JWT sessions) |
| Database | PostgreSQL via Prisma 7 ORM (Neon in prod) |
| Caching / rate limits | Redis (Upstash) |
| AI | Anthropic Claude SDK |
| Email | SendGrid (magic link + admin notifications) |
| Push notifications | web-push + VAPID + Service Worker |
| Background jobs | Inngest (installed; not wired) |
| Error tracking | Sentry (installed; not wired) |
| Analytics | Vercel Analytics |
| Testing | Vitest, React Testing Library, jsdom |

**Route groups:**
- `(auth)` — unauthenticated pages (`/signin`, `/welcome`)
- `(main)` — authenticated pages behind middleware, all include `BottomNav`

**Auth architecture:** `auth.config.ts` is Edge-safe (no Prisma, used in middleware). `auth.ts` is the full Node setup with Prisma adapter. Both are combined in the app; middleware uses only the Edge config.

---

## Root Files

| File | What it does |
|---|---|
| `auth.ts` | Full NextAuth setup — combines `auth.config.ts` with Prisma adapter. JWT callback reads `onboardingCompleted` from DB on sign-in. `createUser` event copies system recipes to new users. |
| `auth.config.ts` | Edge-compatible NextAuth config — Google OAuth provider, JWT session strategy, `session` callback that writes `id` and `onboardingCompleted` onto the session. No Prisma here. |
| `middleware.ts` | Runs on every request at the Edge. Redirects unauthenticated users to `/signin`, sends users who haven't onboarded to `/onboarding`, blocks onboarded users from re-entering `/onboarding`. Public routes and API routes are exempt. |
| `prisma.config.ts` | Prisma config pointing to PostgreSQL. |
| `next.config.mjs` | Minimal Next.js config. |
| `tsconfig.json` | TypeScript config with strict mode and `@/*` path alias for `src/`. |
| `postcss.config.mjs` | PostCSS config enabling Tailwind. |
| `docker-compose.yml` | Local dev services — PostgreSQL and Redis containers. |
| `package.json` | Dependencies and scripts (`dev`, `build`, `lint`, `test`, `test:watch`, `test:coverage`, `test:setup`). |
| `vitest.config.ts` | Vitest config — jsdom env, path aliases, single-fork pool for shared test DB. |
| `.github/workflows/ci.yml` | GitHub Actions — typecheck + Postgres service container + `npm test` on push and PR. |
| `SECURITY.md` | Security audit log, auth/authorization design, pre-deploy checklist. |
| `TESTING.md` | Test strategy, what's covered, local Neon branch setup. |
| `CODEBASE.md` | This file. |
| `README.md` | Project overview. |
| `DISCOVERY.md` | Product overview, competitive analysis, weaknesses, risks. |

---

## Database — `prisma/`

### `prisma/schema.prisma`

Defines the full data model. Key models:

| Model | Purpose |
|---|---|
| `User` | App user. Has `onboardingCompleted`, `role`, dietary preferences, Stripe customer ID, notification settings. |
| `Product` | A grocery product (name, brand, category, unit size). Not store-specific. |
| `Store` | A physical store (chain, name, address). |
| `StoreProduct` | Junction of `Product` × `Store`. Holds the current price, sale flag, last-seen date. |
| `Watchlist` | User's saved products to track. Includes optional `targetPrice`. |
| `List` | A shopping list belonging to a user. |
| `ListItem` | An item on a list. Can reference a `Product` or be a free-text item. Tracks quantity, unit, custom price. |
| `PantryItem` | A user's pantry inventory. Tracks expiry date and links optionally to a `Product`. |
| `Recipe` | A recipe. `userId: null` means it's a system recipe copied to all new users on signup. |
| `RecipeIngredient` | An ingredient on a recipe. May reference a `Product`. |
| `Alert` | A notification for a user (price drop, etc.). |
| `PriceReport` | A crowdsourced price report submitted by a user. |
| `AiSession` / `AiMessage` | Conversation history for the Clove AI assistant. |
| `NotificationPreference` | Per-user notification settings (email, push, digest frequency). |
| `UserPreferredStore` | Junction of `User` × `Store` for preferred stores. |

### `prisma/seed.ts`

Seeds the database for local dev:
- 4 stores: Walmart, Dominion, Sobeys, Costco (St. John's, NL)
- 2 test users: `admin@sentinel.ca`, `test@sentinel.ca`
- ~80 products across categories with realistic NL pricing

### `prisma/seed (old).ts`

Previous seed file kept as backup. Safe to ignore.

### `prisma/migrations/`

Auto-generated migration history. Don't edit manually — run `npx prisma migrate dev` to create new migrations.

---

## Pages — `src/app/`

### Root

| File | What it does |
|---|---|
| `layout.tsx` | Root layout — wraps everything in `SessionProvider`, loads DM Sans (Google Fonts), registers the Service Worker, adds Vercel Analytics, sets Open Graph metadata. |
| `globals.css` | Global Tailwind styles and CSS variables. |
| `icon.tsx` | Favicon component. |
| `opengraph-image.tsx` | Auto-generated OG preview image. |
| `not-found.tsx` | 404 page. |

### `(auth)/` — Unauthenticated

| File | What it does |
|---|---|
| `signin/page.tsx` | Google OAuth sign-in button. Middleware sends logged-in users away from here automatically. |
| `signin/welcome/page.tsx` | Post-signup welcome screen. |

### `(main)/` — Authenticated (all behind middleware)

| File | What it does |
|---|---|
| `layout.tsx` | Wraps all main routes with `BottomNav` and the base responsive container. No auth logic here — middleware handles that. |
| `page.tsx` | Home page (server component). Fetches watchlist summary and unread alert count, passes to `HomeClient`. |
| `onboarding/page.tsx` | Onboarding page (server component). Loads active stores; renders `OnboardingClient`. |
| `onboarding/OnboardingClient.tsx` | Multi-step onboarding UI — pick preferred stores, add watchlist products, POST to `/api/onboarding/complete`, update JWT via `useSession().update()`, redirect to home. |
| `alerts/page.tsx` | Fetches last 50 alerts for the user; renders `AlertsClient`. |
| `lists/page.tsx` | Fetches user's lists and the most recent list's items; serializes Decimal values for client. |
| `browse/page.tsx` | Fetches all active products with store prices; renders `BrowseClient`. |
| `browse/BrowseClient.tsx` | Client component — filter products by category or store, search, compare prices. |
| `search/page.tsx` | Debounced product search with recent history (localStorage), watchlist toggle, add-to-list sheet. Client-only. |
| `pantry/page.tsx` | Loads user's pantry items; renders `PantryClient`. |
| `recipes/page.tsx` | Loads user + system recipes with ingredient prices; renders `RecipesClient`. |
| `recipes/new/page.tsx` | Recipe creation page — renders `RecipeForm`. |
| `recipes/[id]/page.tsx` | Recipe detail — calculates ingredient costs, pantry matching, estimated nutrition. |
| `recipes/[id]/edit/page.tsx` | Recipe edit page — renders `RecipeForm` with existing data. |
| `product/[id]/page.tsx` | Product detail — store prices, price trend, unit prices, watchlist toggle, similar products, add-to-list. |
| `profile-settings/page.tsx` | Account settings — name, dietary restrictions, allergies, notification preferences, preferred stores. |
| `ai/page.tsx` | AI assistant (Clove) — renders `AIChatClient`. |

### Public Pages (no auth required)

| File | What it does |
|---|---|
| `feedback/page.tsx` | User feedback form. |
| `privacy/page.tsx` | Privacy policy. |
| `terms/page.tsx` | Terms of Service. |
| `terms/back-button.tsx` | Back navigation button used in Terms. |

---

## API Routes — `src/app/api/`

All routes return JSON. All protected routes call `getAuthenticatedUser()` first and return 401 if no session. All user-owned resources are scoped by `userId` from the JWT — never from request input.

### Auth

| Route | Methods | What it does |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | next-auth handler — signs in, signs out, session refresh. |

### Products

| Route | Methods | What it does |
|---|---|---|
| `/api/products` | GET | Search/filter products by name, category, page — returns current prices from each store and user's watchlist status. `page`/`limit` are clamped (max 100). Cached 5 min. |
| `/api/products/[id]` | GET | Fetch a specific product. |
| `/api/products/[id]/prices` | GET | Price history for a product. `range` is capped at 365 days. |

### Stores

| Route | Methods | What it does |
|---|---|---|
| `/api/stores` | GET | List all active stores. |

### Watchlist

| Route | Methods | What it does |
|---|---|---|
| `/api/watchlist` | GET, POST | GET: user's full watchlist with current prices. POST: add product or update target price. |
| `/api/watchlist/[productId]` | DELETE | Remove a product from the user's watchlist. |
| `/api/watchlist/summary` | GET | Aggregated watchlist — best prices per store, total per store. Used on the home dashboard. |

### Shopping Lists

| Route | Methods | What it does |
|---|---|---|
| `/api/lists` | GET, POST | GET: all user lists. POST: create a new list. |
| `/api/lists/[id]` | GET, PATCH, DELETE | Fetch, rename, or delete a list. |
| `/api/lists/[id]/items` | POST, PATCH, DELETE | POST: add item (deduplicates, increments quantity if already present). PATCH: update item (checked state, quantity, unit, notes, custom price) — scoped to verified list. DELETE: delete single item, clear completed, or clear all — scoped to verified list. |
| `/api/lists/[id]/recommend` | GET | Product recommendations and price comparisons for items on the list. |

### Pantry

| Route | Methods | What it does |
|---|---|---|
| `/api/pantry` | GET, POST | GET: user's pantry items. POST: add a pantry item manually. |
| `/api/pantry/[id]` | PATCH, DELETE | Update or delete a pantry item. |
| `/api/pantry/from-list/[listId]` | POST | Bulk-add checked items from a shopping list into the pantry. |

### Recipes

| Route | Methods | What it does |
|---|---|---|
| `/api/recipes` | GET, POST | GET (auth-only): list the caller's own recipes + system recipes (userId: null). Supports search by name and max cook time. POST: create a recipe with ingredients. |
| `/api/recipes/[id]` | GET, PATCH, DELETE | GET (auth-only): fetch a recipe — returns 404 unless the caller owns it or it's a system recipe. PATCH/DELETE: only the creator can mutate. |

### Alerts

| Route | Methods | What it does |
|---|---|---|
| `/api/alerts` | GET | Paginated alerts for the logged-in user. |
| `/api/alerts/read` | PATCH | Mark all alerts as read. |
| `/api/alerts/[id]` | GET, DELETE | Fetch or delete a specific alert. |
| `/api/alerts/[id]/read` | PATCH | Mark a single alert as read. |

### AI (Clove)

| Route | Methods | What it does |
|---|---|---|
| `/api/ai/ask` | POST | One-shot AI query (recipe suggestions, grocery advice). Authenticated users: 10/day. Guests: 5/cookie + a hard 15/day per IP ceiling that survives cookie clears. Uses Anthropic SDK. |
| `/api/ai/extract-recipe` | POST | Extract a recipe from text using Claude. Daily limit: 20/user. |
| `/api/ai/sessions` | GET, POST | GET: user's chat sessions. POST: create a new session. |
| `/api/ai/sessions/[id]` | GET, PATCH, DELETE | Get, rename, or delete a session. |
| `/api/ai/sessions/[id]/messages` | GET, POST | Get message history or post a new message in a session. |

### User Management

| Route | Methods | What it does |
|---|---|---|
| `/api/user` | GET, PATCH | GET: user profile with preferences. PATCH: update name, dietary restrictions, allergies, notification settings, preferred stores. |
| `/api/user/delete` | POST, DELETE | POST: request account deletion — sets `deletionRequestedAt`. The `purge-deleted-accounts` Inngest cron anonymizes the account 30 days later (credentials and personal content are hard-deleted; crowdsourced price contributions are severed from the person rather than destroyed). DELETE: cancel a pending request. |
| `/api/feedback` | POST | Public feedback intake. Rate-limited to 5/day/IP via Redis; sends through SendGrid server-side. |
| `/api/inngest` | GET, POST, PUT | Inngest function endpoint. Hosts the scheduled jobs. |
| `/api/user/export` | GET | Export all of the user's personal data as JSON (PIPEDA compliance). |

### Push Notifications

| Route | Methods | What it does |
|---|---|---|
| `/api/push/subscribe` | POST, DELETE | POST: register a Web Push subscription against the authenticated user. DELETE: remove a subscription by endpoint. Used by `usePushNotifications` hook. |

### Guest Mode

| Route | Methods | What it does |
|---|---|---|
| `/api/guest/enter` | POST | Issue `panion-guest` and `panion-guest-id` cookies for 24h. Lets visitors try the app without signing up. |
| `/api/guest/exit` | POST | Clear guest cookies and redirect to `/signin`. |

### Other

| Route | Methods | What it does |
|---|---|---|
| `/api/notifications/preferences` | GET, PATCH | Get or update notification preferences (email, push, digest frequency). |
| `/api/onboarding/complete` | POST | Save onboarding choices — preferred stores, initial watchlist, marks `onboardingCompleted: true` in DB. |
| `/api/price-reports` | POST | Submit a crowdsourced price report for a product at a store. |
| `/api/scan` | GET | Barcode lookup — returns product + per-store current prices. |
| `/api/flyers` | GET | Fetch store flyers — integration point for future scraper. |
| `/api/icons/[size]` | GET | Generate PWA icon at 192px or 512px via Edge runtime. |
| `/api/health` | GET | Health check. Pings Postgres **and** Redis; returns 200 when both are up, 503 otherwise. |

---

## Components — `src/components/`

### `layout/`

| File | What it does |
|---|---|
| `BottomNav.tsx` | Fixed bottom navigation bar with 5 tabs: Home, Lists, Pantry, Recipes, Clove (AI). Highlights the active route. |

### `home/`

| File | What it does |
|---|---|
| `HomeClient.tsx` | Main home dashboard — watchlist summary with per-store totals and best deals, unread alert badge, browse shortcut, quick actions. |
| `HomePageSkeleton.tsx` | Loading skeleton shown while home data fetches. |

### `alerts/`

| File | What it does |
|---|---|
| `AlertsClient.tsx` | Alert list — shows price drop notifications, mark as read, delete. |

### `lists/`

| File | What it does |
|---|---|
| `ListsClient.tsx` | Full list management UI — switch between lists, add/check/remove items, estimated total with unit conversion, send to pantry. |
| `ListDropdown.tsx` | Dropdown to switch the active list. |
| `ListOptionsMenu.tsx` | Context menu for a list (rename, delete, share, etc.). |
| `EditItemSheet.tsx` | Bottom sheet for editing a list item's quantity, unit, notes, or custom price. |

### `pantry/`

| File | What it does |
|---|---|
| `PantryClient.tsx` | Grid view of pantry items with expiry tracking. Add, edit, delete items. |
| `PantryEditSheet.tsx` | Bottom sheet to add or edit a pantry item (name, quantity, unit, expiry date, optional product link). |
| `PantryFromListSheet.tsx` | Bottom sheet to bulk-add items from a shopping list to the pantry. |

### `recipes/`

| File | What it does |
|---|---|
| `RecipesClient.tsx` | Scrollable list of user and system recipes with search. FAB to create a new recipe. |
| `RecipeCard.tsx` | Card showing recipe image, title, cook time, servings, and action buttons (view, edit, delete, add to list). |
| `RecipeDetailClient.tsx` | Full recipe view — ingredient checklist with pantry-matching highlights, step-by-step instructions, estimated cost per serving. |
| `RecipeForm.tsx` | Create/edit form for a recipe — title, description, image, prep/cook time, servings, ingredients (with optional product link), and JSON instructions. |
| `AIChatClient.tsx` | Clove AI assistant — manage multiple sessions, send messages, render markdown responses, rename or delete sessions. |

### `product/`

| File | What it does |
|---|---|
| `ProductDetailClient.tsx` | Full product page — price per store, unit price comparison, price trend chart, watchlist toggle, similar products, add to list. |
| `ReportPriceSheet.tsx` | Bottom sheet to submit a crowdsourced price report (price, store, date). |

### `profile/`

| File | What it does |
|---|---|
| `ProfileSettingsClient.tsx` | Settings form — display name, dietary restrictions, allergies, email/push notification toggles, digest frequency, preferred stores. Save button only appears when the user has changed something (`isDirty` check). Standalone red sign-out button at the bottom. |

### `search/`

| File | What it does |
|---|---|
| `AddToListSheet.tsx` | Bottom sheet to add a product from search results to a shopping list (quantity, unit, notes). |

### `feedback/`

| File | What it does |
|---|---|
| `FeedbackClient.tsx` | User feedback submission form. |

---

## Utilities — `src/lib/`

| File | What it does |
|---|---|
| `prisma/index.ts` | Exports the Prisma client singleton. Reuses the same instance across hot reloads in dev to avoid exhausting DB connections. |
| `auth-utils.ts` | `getAuthenticatedUser()` — calls `auth()`, validates the session, and returns `{ user }` or a pre-built 401 `NextResponse`. Used at the top of every protected API route. |
| `unit-convert.ts` | Unit conversion for list cost estimation. `TO_BASE` maps units to grams/ml. `calculateEffectivePrice()` normalizes prices to the same unit so you can compare "per 100g" across products. `getAllowedUnits()` returns compatible units based on product type (packaged vs bulk). |
| `watchlist-summary.ts` | `getWatchlistSummary(userId)` — aggregates the user's watchlist across their preferred stores. Returns best price per item, total per store, and overall cheapest-store breakdown. Used by the home dashboard and the watchlist summary API. |
| `redis/index.ts` | Redis client setup (Upstash). Used for caching and rate limiting. |
| `push.ts` | `sendPush(subscription, payload)` — server-side helper that signs and delivers a Web Push notification using `web-push` and VAPID keys. |
| `guest-data.ts` | Mock data served to guest-mode users (watchlist, lists, pantry, recipes). Dates rebase on module load so the demo always looks current. |

---

## Hooks — `src/hooks/`

| File | What it does |
|---|---|
| `useGuest.ts` | Reads NextAuth session status; returns `{ isGuest, isLoading, session }`. Used by client components that branch on guest vs authenticated state. |
| `usePushNotifications.ts` | Requests browser notification permission, subscribes the user to Web Push via the Service Worker, posts the subscription to `/api/push/subscribe`. Also exposes `scheduleTimerNotification` / `cancelTimerNotification` for the recipe cooking timer. |

---

## Types — `src/types/`

| File | What it does |
|---|---|
| `next-auth.d.ts` | Extends next-auth's built-in types so TypeScript knows about `session.user.id`, `session.user.onboardingCompleted`, and `token.onboardingCompleted`. Without this, those fields would be type errors. |

---

## Tests — `tests/`

Vitest + RTL + a dedicated Neon test branch. Real Prisma queries; Anthropic/SendGrid/Redis are mocked. See [`TESTING.md`](TESTING.md) for setup and philosophy.

| File | What it covers |
|---|---|
| `setup.ts` | Global test setup — loads env, mocks Anthropic/SendGrid/Redis (in-memory), provides `setMockSession()` helper for injecting authenticated users. |
| `helpers/db.ts` | `resetDb()` (truncate user-owned tables between tests), `createTestUser()`, `ensureTestProduct()`. |
| `helpers/setup-test-db.ts` | One-shot script (`npm run test:setup`) — pushes the Prisma schema to `TEST_DATABASE_URL`. |
| `api/recipes.test.ts` | Recipe authorization — user A can't read user B's recipes via `GET /api/recipes` or `/api/recipes/[id]`. |
| `api/ai-rate-limit.test.ts` | IP-keyed Clove ceiling survives cookie clears; `/api/ai/extract-recipe` enforces its daily limit. |
| `api/lists.test.ts` | List + list-item operations are scoped to the owner. |
| `api/watchlist.test.ts` | Upsert dedup; DELETE only removes the caller's row. |
| `api/pantry.test.ts` | Pantry mutations are scoped to the owner. |
| `unit/unit-convert.test.ts` | Pure unit-conversion logic (no DB). |
| `components/GuestBanner.test.tsx` | Conditional render based on session state (RTL example). |
