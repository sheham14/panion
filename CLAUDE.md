# Working notes for Claude

**→ Read `STATUS.md` first.** It has the current state of the data, what was
built last, and the exact next step. This file is the rules; that file is the
situation.

Everything is **local Docker only**. Production (Neon) has not been touched and
still holds the old schema and the fabricated seed data.

Rules learned the hard way on this repo. Each one exists because something
broke; the incident is kept so the reason survives the rule.

---

## 1. Never delete and diagnose in the same pass

**Incident (2026-08-16).** A sweep was written to clear one bad match
(`Watson Ridge chicken nuggets` priced against `Watson Ridge Chicken Breasts`).
It re-matched every `StoreProduct` against the current matcher and deleted the
ones that no longer matched. It deleted **248 of 250 Dominion price rows**.

The logic was wrong: it re-matched on `storeProductName`, which for PC Express
is the bare product name (`"14 Grain Bread"`), while `run-pcexpress.ts` matches
on `[brand, name, packageSize].join(" ")` (`"Country Harvest 14 Grain Bread
600g"`). Nearly every row looked stale.

Two process failures made it worse than it needed to be:

- The diagnostic and the delete were the same script run. There was no moment
  between "here is what I would remove" and "removed".
- The output was piped through `head`, so the deletion count scrolled past
  unseen. The damage was found only by re-checking coverage afterwards.

**The rule.**

- A script that deletes prints its target list and **exits**. Deleting is a
  second, separate invocation behind an explicit flag (`--apply`).
- Never pipe a destructive script's output through `head`/`tail`. Read it whole.
- Before deleting anything derived from a matcher, verify the sweep reproduces
  the *exact* string the writer used. If the recomputation disagrees with the
  stored data on more than a handful of rows, the recomputation is wrong — not
  the data.
- Prefer deactivating (`isActive: false`, `currentPrice: null`) over `DELETE`
  for anything a scrape produced.
- Take a snapshot (`npm run snapshot:save`) before any bulk mutation.

---

## 2. `.env` is production, `.env.local` is local

`prisma.config.ts` loads `.env` first and `.env.local` with `override: true`,
matching Next.js. `.env` holds the **Neon production** `DATABASE_URL`.

Before any migration or destructive command, run `npx prisma migrate status` and
**read back the host**. Every ad-hoc script must print its target host on start.

`prisma migrate reset` is never run against production.

---

## 3. Never run `npm run build` while `npm run dev` is live

`build` writes `.next/`, which the running dev server is serving from. The
symptom is confusing: images and routes start returning Next's HTML 404 page
(~19 KB) instead of content. This has been misdiagnosed twice as a CSP or
allowlist problem. Restart the dev server after any build.

---

## 4. The image proxy allowlist must move with the adapters

`src/app/api/products/[id]/image/route.ts` holds `ALLOWED_IMAGE_HOSTS`. Adding
an adapter without adding its CDN silently 404s **every** image it imports.

Verify the host by reading a real image URL out of a live response. Do not guess
it — `assets.shop.loblaws.ca` was guessed when PC Express actually serves
`digital.loblaws.ca`, and all 250 images broke.

---

## 5. A 200 for the wrong region is worse than an error

Voilà scopes prices to the **session**, not to a query parameter — `regionId` is
silently ignored. An expired `VOILA_SESSION_COOKIE` does not fail; it returns a
valid 200 for a default region (Natrel instead of Central Dairies). That looks
exactly like success while quoting prices no local shopper will ever see.

`runVoilaCycle()` therefore **aborts** when the response contains no
Newfoundland dairy brands. Any future region-scoped source needs an equivalent
assertion. Silent success is the failure mode to design against.

---

## 6. Check `robots.txt` before building an adapter, and record it

See `DATA-SOURCING.md` (gitignored) for the full source table and the standing
decision. Short version: PC Express and Voilà disallow the paths in use, Walmart
permits crawling but blocks it with PerimeterX, Flipp is clean.

Never create a retailer account to reach pricing — being logged out is the
strongest legal position available, and an account forfeits it. Never defeat an
active bot wall; that is a categorically worse act than ignoring `robots.txt`.

---

## 7. Matcher rules are tightened, never loosened, and always with a fixture

Every gate in `src/lib/pricing/match.ts` exists because of a specific real
mismatch, and each has a test naming it. When adding an exclusive-attribute
group, list each attribute **once in singular** — membership is tested after
`singularize()`. Listing both `breast` and `breasts` makes them conflict with
each other, which `thigh`/`thighs` and `wing`/`wings` silently did for months.

Tightening a rule does not retract prices already written. A sweep is needed —
see rule 1 for how to do it without destroying the catalogue.

---

## 8. Windows Vitest flake

Runs intermittently fail with `Timeout waiting for worker to respond` under
load. It is not a test failure. Rerun with:

```
npx vitest run --pool=threads --no-file-parallelism
```

---

## 9. There is no password login

Auth is **Google OAuth** plus an email magic link. `admin@sentinel.ca` and
`test@sentinel.ca` are seeded rows that **nobody can authenticate as** — no
password exists, and the magic link would go to a domain the user doesn't own.
Telling the user to "log in as admin@sentinel.ca" wastes their time; it was
suggested once and did not work.

To get an elevated account locally: sign in with Google as yourself first (that
creates the `User` row), then

```
npm run role -- grant <your-email> moderator
```

No re-login is needed. `/admin/import` and `requireElevatedRole()` read the role
from the database on every request rather than from the JWT, precisely so a
stale token cannot retain privileges after a demotion.
