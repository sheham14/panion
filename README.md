# Panion — Grocery Price Intelligence

Compare grocery prices across Walmart, Dominion, Sobeys, and Costco in St. John's, NL. Track your watchlist, manage shopping lists, log your pantry, and get AI-powered meal suggestions from Clove.

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
# Fill in: AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL, ANTHROPIC_API_KEY

docker compose up -d        # starts PostgreSQL + Redis
npx prisma migrate dev      # run migrations
npx prisma db seed          # seed stores, products, test users
npm run dev                 # http://localhost:3000
```

## Key Docs

- [`CODEBASE.md`](CODEBASE.md) — every file explained
- [`SECURITY.md`](SECURITY.md) — auth design, audit log, pre-deploy checklist
- [`DISCOVERY.md`](DISCOVERY.md) — product overview, competitive analysis, risks
