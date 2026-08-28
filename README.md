# Panion — Grocery Price Intelligence

Compare grocery prices across Dominion, Sobeys, Walmart and local NL grocers in
St. John's, NL — both *the same product at different stores* and *the same
thing under a different brand*, ranked by unit price. Track your watchlist,
manage shopping lists, log your pantry, and get AI meal suggestions from Clove.

> **Working on this repo?** Read [`STATUS.md`](STATUS.md) for current state and
> the next step, then [`CLAUDE.md`](CLAUDE.md) for the rules. Costco was dropped
> deliberately — it sells wholesale, so its prices aren't comparable to a normal
> basket.

**Live:** [panion.dev](https://panion.dev)

---

## Stack

- **Framework:** Next.js 16 (App Router), React 18, TypeScript
- **Auth:** next-auth v5 (Google OAuth, JWT)
- **Database:** PostgreSQL via Prisma 7
- **Caching:** Redis (Upstash)
- **AI:** Anthropic Claude SDK
- **Styling:** Tailwind CSS, mobile-first (max-width 384px)
- **Background jobs:** Inngest
- **Deployment:** Vercel

## Local Dev

**Prerequisites:** Node 20+, Docker

```bash
git clone https://github.com/sheham14/sentinel.git
cd sentinel/project-sentinel

cp .env.example .env.local
# Fill in: AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL,
#          ANTHROPIC_API_KEY, SENDGRID_API_KEY, EMAIL_FROM, ADMIN_EMAIL,
#          NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY

docker compose up -d        # starts PostgreSQL + Redis
npx prisma migrate dev      # run migrations
npx prisma db seed          # seed stores, products, test users
npm run dev                 # http://localhost:3000
```

## Testing

```bash
npm run test:setup          # one-time: push schema to TEST_DATABASE_URL
npm test                    # run all tests
npm run test:watch          # watch mode
npm run test:coverage       # with coverage report
```

See [`TESTING.md`](TESTING.md) for the test strategy, Neon branch setup, and what's covered.

## Key Docs

- [`CODEBASE.md`](CODEBASE.md) — every file explained
- [`SECURITY.md`](SECURITY.md) — auth design, audit log, pre-deploy checklist
- [`TESTING.md`](TESTING.md) — test strategy, coverage, CI
- [`SCALING.md`](SCALING.md) — what breaks as the catalogue grows, and at what size
- [`DISCOVERY.md`](DISCOVERY.md) — product overview, competitive analysis, risks
