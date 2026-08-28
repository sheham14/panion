# Codebase Map

> **Partially stale.** Sections below predate the pricing pipeline and the
> capture tooling. The *Pricing pipeline* and *Admin & capture* sections at
> the end are current; treat anything describing seeded products or the old
> 80-product catalogue as history. `STATUS.md` is the source of truth for
> what exists today.

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
| `list-pricing.ts` | `computeListPricing(items, preferredChains)` — prices a grocery list at each preferred store **and records what each one could not price**. Returns per-store `covered`/`missing` (each missing item carrying the cheapest price held elsewhere), `commonItemIds` (the basket every contributing store can price, which is what ranking runs on), `unlinkedItemIds` (typed-in items with no product and no custom price), and `cheapestSplit`. Also exports `priceItemAt()` and `cheapestElsewhere()`. Lifted out of `ListsClient` so it could be tested — see `tests/unit/list-pricing.test.ts`. |
| `watchlist-summary.ts` | `getWatchlistSummary(userId)` — aggregates the user's watchlist across their preferred stores. Returns best price per item, total per store, and overall cheapest-store breakdown. Used by the home dashboard and the watchlist summary API. Totals and `bestStore` go through `computeListPricing()`, so a store is never ranked cheapest on a smaller basket; each entry also carries `covered`/`missing` counts, and the summary carries `itemCount`/`comparableItemCount`. |
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

## Pricing pipeline — `src/lib/pricing/`

Adapters are dumb, the ingestion writer is smart. An adapter's only job is to
produce `PriceObservation[]`; all validation, precedence and DB writing lives
in `ingest.ts`, so adding a store means adding one adapter and nothing else.

| File | What it does |
|---|---|
| `types.ts` | `PriceObservation`, `PRICE_SOURCES` (the enforcement point for the String `source` column), validation bounds (`MIN_PRICE`, `MAX_PRICE`, the 5× swing guard). |
| `ingest.ts` | **The single writer.** Validates, appends to `PriceHistory` (append-only truth), re-derives `StoreProduct.currentPrice` by precedence. `shouldReplaceCurrent()` holds the rule that a live sale is not displaced by a newer regular price. `expireFinishedSales()` reverts expired sales. |
| `match.ts` | Conservative product matcher. Barcode first, name-and-size fallback. Every gate exists because of a specific real mismatch — coverage thresholds, `EXCLUSIVE_ATTRIBUTES`, `VARIANT_MARKERS`, percentage conflicts, multi-product listings, the size guard. See `CLAUDE.md` rule 8 before touching. |
| `adapters/pcexpress.ts` | Dominion / No Frills. Regular prices **with UPCs** — the only source that can establish product identity. |
| `adapters/voila.ts` | Sobeys. Regular prices, unit price, category path. **No barcodes.** Region comes from the session cookie; `looksRegionScoped()` guards against a silently de-scoped session. |
| `adapters/flipp.ts` | Flyer/sale prices across every chain at once. Sale-only by construction (`isSale: true` is hardcoded). |
| `run-pcexpress.ts` / `run-voila.ts` / `run-flipp.ts` | Orchestration: fetch → match → ingest, one `ScrapeRun` per store. |
| `catalogue-terms.ts` | ~160 search terms grouped by category. `ALL_CATALOGUE_TERMS` is what the catalogue was built from — use it, not the shorter 44-term list. |
| `import-catalogue.ts` | Builds the catalogue *from* store data. Ranks equivalence groups by brand diversity, favouring groups that hold both a national and a store brand. |
| `classify-groups.ts` | Haiku batch classifier for equivalence groups. Never throws. |

Related: `src/lib/unit-price.ts` — `getUnitPrice()` and `rankByUnitPrice()`,
which make cross-brand comparison honest across pack sizes. Never interleaves
weight with volume.

---

## Admin & capture — `src/lib/admin/`, `src/lib/capture/`

The manual path. It exists because every automated source is compromised:
PC Express and Voilà disallow the endpoints in use, Walmart permits crawling
but blocks it with PerimeterX, and Flipp is flyer-only. Prices a person read
themselves carry no such asterisk. See `DATA-SOURCING.md`.

| File | What it does |
|---|---|
| `admin/require-role.ts` | `requireElevatedRole()` — reads the role from the **database** per call, never from the session, so a stale token can't retain privileges. `canWriteStore()` scopes a `store_admin` to its own store. |
| `admin/ingest-items.ts` | `resolveAndIngest()` — the shared core behind both the import UI and `/api/admin/observations`. Resolves, builds the reviewable preview (what each item matched *to*, and the price already held), flags ≥1.8× moves as suspicious, then writes via `ingestObservations()`. |
| `capture/parse-capture.ts` | Parses a clipboard capture into items. Deliberately tolerant across retailer shapes. `matchNameFor()` folds brand and size into the match string — with no barcode available, that string is the only identity a capture has. |
| `capture/bookmarklet.ts` | The `javascript:` bookmarklet source. Walks `__NEXT_DATA__` / `__next_f` / `__PRELOADED_STATE__` for the **largest** array of product-like objects (largest, not first — search pages carry sponsored carousels). Copies a diagnostic when it finds nothing. |

| Route / page | What it does |
|---|---|
| `/admin/import` | Drag-to-install bookmarklet, paste box, preview table, import. Role-gated. Nothing is written until reviewed; suspicious rows start unticked. |
| `POST /api/capture/import` | Parses a raw capture, then previews (`dryRun`) or writes. |
| `POST /api/admin/observations` | Programmatic bulk entry — barcode-or-name, same core. |
| `GET /api/products/[id]/alternatives` | Cross-brand comparison within an equivalence group, ranked by unit price. |
| `GET /api/products/[id]/image` | Image proxy. Takes a **product id, never a URL** — no SSRF surface. Its allowlist must move with the adapters (`CLAUDE.md` rule 5). |

---

## Scripts — `scripts/`

| Command | What it does |
|---|---|
| `npm run coverage` | Coverage per store plus the ≥1.8× bad-match detector. Run after every scrape. |
| `npm run role -- list | grant <email> <role> | revoke <email>` | Manage elevated roles. |
| `npm run scrape:dominion` / `scrape:sobeys` / `scrape:flipp` | One cycle per source. |
| `npm run catalogue:import` | Rebuild the catalogue from fetched store data. |
| `npm run snapshot:save` / `snapshot:restore` | Catalogue safety net. Take one before any bulk mutation. |

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
| `unit/unit-price.test.ts` | `getUnitPrice()`, `parseQuantity()`, `rankByUnitPrice()`, `comparableBasis()`. |
| `unit/list-pricing.test.ts` | A store is never ranked cheapest on a smaller basket; exclusions land in the right bucket; the guest preview keeps demonstrating both. |
| `unit/pricing-match.test.ts` | `matchProduct()`, `parseSize()`, `sizesCompatible()`, `isMultiProductListing()` — one case per real mismatch (rule 8). |
| `unit/pricing-adapters.test.ts` | PC Express response parsing and normalisation. |
| `unit/parse-capture.test.ts` | Browser-capture parsing, pinned to real Walmart and Voilà fixtures. |
| `unit/verify-matches.test.ts` | The model verifier: failure is never approval. |
| `unit/capture-token.test.ts` | The bearer secret that lets the bookmarklet post from walmart.ca. |
| `unit/capture-source-store.test.ts` | A queued batch is pinned to the store its source implies. |
| `unit/capture-worklist.test.ts` | The per-store worklist is built from products that store is missing. |
| `components/GuestBanner.test.tsx` | Conditional render based on session state (RTL example). |
