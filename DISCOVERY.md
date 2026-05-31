# Panion — Product Discovery

A plain-language document for anyone learning about this project for the first time: recruiters, collaborators, LLMs helping with the codebase, or investors. No assumed context.

---

## The Idea

Groceries in Newfoundland are expensive — some of the highest prices in Canada due to shipping costs and limited competition. People in St. John's shop across four main chains (Walmart, Dominion, Sobeys, Costco) and most have no reliable way to know which store is cheapest for their specific basket before they leave home.

The existing tools are inadequate:
- Store apps only show prices from their own store
- Flyer apps (Flipp) show weekly specials but not regular shelf prices, and don't let you build a running list
- Manual comparison means visiting multiple stores or websites and doing mental math

Panion's premise: **give shoppers one place to compare prices across all four stores, track what they buy, and make better decisions every week.**

---

## What the App Does

### Core features (built and working)

| Feature | What it does |
|---|---|
| **Price comparison** | Search any product and see its current price at every store side by side, with unit pricing so different pack sizes are fairly compared |
| **Watchlist** | Save products you buy regularly; set an optional target price; get alerted when the price drops |
| **Price alerts** | Email notifications when a watched product drops below your target at any of your preferred stores |
| **Shopping lists** | Build grocery lists with quantities; see the estimated total per store automatically so you know the cheapest run before you go |
| **Pantry tracker** | Log what's at home with quantities and expiry dates; see what's running low |
| **Recipe manager** | Save recipes with ingredients linked to real products; Panion calculates cost per serving and shows which store is cheapest to cook from |
| **Clove (AI assistant)** | Claude-powered chat for meal ideas, recipe suggestions based on what's on sale or in your pantry, and general grocery advice |
| **Price reports** | Users can submit prices they see in-store (crowdsourcing) to supplement automated data |
| **Browse** | Browse all products by category or store with price comparison |

### Infrastructure that exists but isn't fully live

| Feature | Status |
|---|---|
| Flyer integration | API stub exists; scraper not built |
| Barcode scanning | API stub exists; no barcode database connected |
| Inngest background jobs | Framework integrated; price alert triggering and digest emails not wired |
| Admin panel | `UserRole` enum exists in schema; no admin UI built |
| Stripe paywall | SDK + `stripeCustomerId` field installed; no paywall built |
| Sentry error tracking | SDK installed; not yet configured |

### Recently shipped

| Feature | What it does |
|---|---|
| Web Push notifications | VAPID-signed push delivered via the Service Worker. Used for cooking timers that fire even when the app is backgrounded. Also wired for future price-drop alerts. |
| Magic-link sign-in | Email-based passwordless auth via SendGrid, alongside Google OAuth. |
| Guest mode | Visitors can try the app with mock data behind the `panion-guest` cookie. AI is rate-limited per cookie + per IP. |
| Integration test suite | Vitest + Neon-branch test DB; covers the security boundary. Runs in CI on every push. |

---

## How It Works (User Journey)

1. User signs in with Google (no password, one tap)
2. Onboarding: pick which stores you shop at, add your first watched products
3. Home dashboard shows: watchlist summary, cheapest store for your basket this week, unread alerts
4. Before a grocery run: open your list, see totals per store, go to the cheapest one
5. Clove (AI tab): ask "what can I make with chicken thighs and rice that's cheap this week?" — gets a recipe, can add ingredients straight to the list
6. Pantry: after shopping, mark what you bought, track expiry dates, reduce food waste

---

## Technical Architecture (Brief)

- **Mobile-first web app** — max-width 384px, feels like a native app. Installable as a PWA (no App Store).
- **Next.js App Router** with server components for data fetching, client components only where interaction is needed
- **Auth split:** Edge-safe config (middleware) vs full Node config (API routes, Prisma) — important for next-auth v5
- **All auth is JWT-based** — middleware reads `onboardingCompleted` from the token without hitting the DB on every request
- **All API routes enforce `userId` scoping** — user data is never accessible by another user (verified by integration tests, see [`TESTING.md`](TESTING.md))
- **PostgreSQL + Prisma** for relational data (products, prices, recipes, lists, pantry); Neon in production
- **Redis (Upstash)** for caching and AI rate limiting (cookie- and IP-keyed)
- **Anthropic Claude** for Clove — 10 queries/day for authenticated users, 5 per guest cookie + 15 per guest IP/day ceiling
- **SendGrid** for transactional email (magic link sign-in, admin signup notifications)
- **web-push + Service Worker** for installable PWA notifications (cooking timers, future price alerts)

For full file-by-file detail: see [`CODEBASE.md`](CODEBASE.md).

---

## Competitive Landscape

### Direct competitors

**Flipp**
The most-used flyer app in Canada. Shows weekly flyer deals from most major chains.
- ✅ Large user base, good flyer coverage
- ❌ Shows *sale prices only*, not everyday shelf prices
- ❌ No watchlist, no pantry, no recipes, no AI
- ❌ Not designed for building and costing a recurring grocery list
- ❌ Generic — no NL-specific context

**Store apps (Walmart, Sobeys, Dominion, Costco)**
Each store's own app shows their own prices.
- ✅ Accurate prices for that store
- ❌ No cross-store comparison — the core problem remains unsolved
- ❌ No pantry, no recipes, no unified list

**Instacart / grocery delivery apps**
Focus on ordering, not comparing.
- ✅ Convenient if you want delivery
- ❌ Delivery fees make cross-store price comparison irrelevant
- ❌ Not all St. John's stores fully supported

**Flyer scraping sites (e.g., Redflagdeals)**
Community-driven deal sharing.
- ✅ Good for finding specific deals
- ❌ Not structured data — can't build a list or automate comparisons
- ❌ No personal tracking features

### How Panion is different

1. **Cross-store shelf price comparison** — not just flyer deals, but what something actually costs any day of the week
2. **NL-specific** — built around the four stores people in St. John's actually use
3. **Personal tracking** — watchlist, alerts, pantry, and lists all connected
4. **Recipe cost** — linking recipes to real product prices is unique in this space
5. **AI assistant** — Clove can factor in your pantry, your preferred stores, and current prices when suggesting meals
6. **No download required** — PWA means instant access from any browser

---

## Strengths

- **Solves a real, felt problem** — NL grocery prices are genuinely high and people notice
- **No direct competitor with this feature set in NL** — the gap is real
- **Feature depth already built** — this isn't a landing page with a waitlist; the core app is functional
- **PIPEDA compliant** — Canadian privacy law accounted for (data export, account deletion)
- **Extensible data model** — the schema already anticipates social features (posts, reactions, comments) and admin tooling
- **AI integration is a genuine differentiator** — most grocery apps have no AI; Clove adds a layer competitors can't replicate quickly

---

## Weaknesses / Honest Assessment

- **The data pipeline is the core unsolved problem.** The app is built around having fresh, accurate prices. Right now prices are seeded manually. Without an automated way to keep them current (scraping, store API partnerships, or a large user base submitting reports), the price data will go stale and the app loses its value proposition. Everything else can be polished — this one has to be solved.

- **One city, four stores.** Until the data pipeline scales, growth is capped. Adding a new store or a new city means sourcing all its product/price data from scratch.

- **No revenue model implemented.** Stripe is integrated (customer ID stored on User) but nothing is behind a paywall. The cost of running Claude queries (Anthropic API), Vercel hosting, and a managed database isn't free at scale. Free tier limits (10 AI queries/day) are in place but there's no upsell path yet.

- **User adoption is hard in the grocery category.** Changing how people shop is a habit change, not just a tool switch. Retention depends on the price data being visibly useful within the first session.

- **Flyers not connected.** A significant portion of grocery savings comes from weekly specials. Until flyer data is integrated, Panion misses a major discovery surface that Flipp owns.

---

## Potential Blockers

**1. Price data freshness (highest risk)**
Scraping store websites for prices is:
- Legally grey — stores' terms of service typically prohibit scraping
- Technically fragile — stores update their site structure; scrapers break
- Costly at scale — running scrapers continuously requires infrastructure

*Alternatives:* Partner with stores directly (unlikely at early stage), crowdsource through user price reports (slow), use receipt parsing (requires users to photograph receipts), or negotiate a data feed from a grocery data aggregator.

**2. Store partnership resistance**
Stores benefit from price opacity across competitors. They are unlikely to voluntarily provide price feeds. Any data collection approach that doesn't involve user contributions will likely require legal review.

**3. Scale vs. accuracy tradeoff**
Crowdsourced prices (user reports) scale with users but are unverified and sparse. Automated prices are accurate but legally and technically complex. The middle path — a small team manually updating prices — doesn't scale.

**4. Competition from incumbents**
If Flipp or a major chain decides to build cross-store comparison natively, they have distribution advantages (existing user base, store relationships) that Panion can't match. The window for a small app to establish itself is narrow.

**5. AI cost at scale**
Anthropic API costs are real. At 10 free queries/day per user, a few hundred active users generate meaningful API costs. The free tier needs to be tight enough to be sustainable, but generous enough to demonstrate value.

---

## Current State (as of May 2026)

| Area | Status |
|---|---|
| Authentication (Google OAuth, JWT) | ✅ Complete |
| User onboarding | ✅ Complete |
| Product/store database (NL, 80 products) | ✅ Seeded |
| Price comparison | ✅ Working |
| Watchlist | ✅ Working |
| Shopping lists | ✅ Working |
| Pantry tracker | ✅ Working |
| Recipe manager | ✅ Working |
| Clove AI assistant | ✅ Working (10 queries/day limit) |
| Price alerts (schema + UI) | ⚠️ Schema + UI built; background job not wired |
| Push notifications | ⚠️ Preference UI built; no push subscription |
| Barcode scanning | ⚠️ API stub only |
| Flyer integration | ⚠️ API stub only |
| Automated price pipeline | ❌ Not built |
| Guest / demo account | ❌ Not built |
| Admin panel | ❌ Not built |
| Revenue / paid tier | ❌ Not built |
| PWA (installable) | ✅ Complete |

---

## What Would Make This Defensible Long-Term

1. **A reliable price data pipeline** — even if imperfect, data that updates weekly is table stakes
2. **User-contributed data at scale** — if enough people report prices, the crowdsource model becomes self-sustaining
3. **Habit formation** — if checking Panion before a grocery run becomes automatic, churn drops dramatically
4. **Expansion to more NL cities / Atlantic Canada** — Corner Brook, Moncton, Halifax all have the same problem
5. **Retailer partnerships** — even a single store sharing a price feed would be a moat

---

## Who Built This

Solo project by Sheham Shahid, a developer based in St. John's, NL. Built with Next.js, Prisma, and Anthropic Claude. The AI assistant (Clove) and the recipe cost estimation are original features not seen in comparable NL grocery tools.

Contact / repo: [github.com/sheham14/sentinel](https://github.com/sheham14/sentinel)
