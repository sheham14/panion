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

**To reach production deliberately**, name the production config explicitly:

```
npx prisma migrate status --config prisma.production.config.ts
npx prisma migrate deploy --config prisma.production.config.ts
```

That file loads only `.env` and throws unless the URL is a Neon host, so a
misconfigured `.env` fails loudly instead of quietly migrating localhost.
`migrate deploy` is the only migrate command safe to point at it. Ad-hoc
scripts that touch production should do the same: load only `.env`, assert the
host, print it on start.

---

## 3. Never run `npm run build` while `npm run dev` is live

`build` writes `.next/`, which the running dev server is serving from. The
symptom is confusing: images and routes start returning Next's HTML 404 page
(~19 KB) instead of content. This has been misdiagnosed twice as a CSP or
allowlist problem. Restart the dev server after any build.

---

## 4. A new Prisma model needs a dev server restart, not a hot reload

**Symptom.** `Cannot read properties of undefined (reading 'findFirst')` on
`prisma.newModel`, while `tsc` and `npm run build` are both clean.

`src/lib/prisma` caches the client on `globalThis` in development, so hot
reloads don't open a new connection pool per edit. Next re-evaluates the
module on reload but **does not clear that global**, so the process keeps the
client instance it built before `prisma generate` ran — one with no delegate
for the new model. The generated files on disk are already correct, which is
exactly why the type-checker and the build see nothing wrong.

Stop the dev server and start it again. Hot reload cannot fix this; the Node
process has to exit.

---

## 5. The image proxy allowlist must move with the adapters

`src/app/api/products/[id]/image/route.ts` holds `ALLOWED_IMAGE_HOSTS`. Adding
an adapter without adding its CDN silently 404s **every** image it imports.

Verify the host by reading a real image URL out of a live response. Do not guess
it — `assets.shop.loblaws.ca` was guessed when PC Express actually serves
`digital.loblaws.ca`, and all 250 images broke.

---

## 6. A 200 for the wrong region is worse than an error

Voilà scopes prices to the **session**, not to a query parameter — `regionId` is
silently ignored. An expired `VOILA_SESSION_COOKIE` does not fail; it returns a
valid 200 for a default region (Natrel instead of Central Dairies). That looks
exactly like success while quoting prices no local shopper will ever see.

`runVoilaCycle()` therefore **aborts** when the response contains no
Newfoundland dairy brands. Any future region-scoped source needs an equivalent
assertion. Silent success is the failure mode to design against.

---

## 7. Check `robots.txt` before building an adapter, and record it

See `DATA-SOURCING.md` (gitignored) for the full source table and the standing
decision. Short version: PC Express and Voilà disallow the paths in use, Walmart
permits crawling but blocks it with PerimeterX, Flipp is clean.

Never create a retailer account to reach pricing — being logged out is the
strongest legal position available, and an account forfeits it. Never defeat an
active bot wall; that is a categorically worse act than ignoring `robots.txt`.

---

## 8. Matcher rules are tightened, never loosened, and always with a fixture

Every gate in `src/lib/pricing/match.ts` exists because of a specific real
mismatch, and each has a test naming it. When adding an exclusive-attribute
group, list each attribute **once in singular** — membership is tested after
`singularize()`. Listing both `breast` and `breasts` makes them conflict with
each other, which `thigh`/`thighs` and `wing`/`wings` silently did for months.

Tightening a rule does not retract prices already written. A sweep is needed —
see rule 1 for how to do it without destroying the catalogue.

---

## 9. Read a retailer's page, don't assume its shape

Everything about browser capture was wrong on the first guess, and each
correction came from a live diagnostic rather than from reasoning:

- **Products are not in the page payload.** Walmart's search results arrive
  client-side over persisted GraphQL; Voilà publishes only product URLs in
  `ld+json`. Both needed the DOM tier.
- **`textContent` is not the displayed price.** Walmart renders dollars and
  cents as separate spans, so a $4.98 product reads `"$498current price $4.98…"`.
  Taking the first dollar figure would have recorded **$498**. Trust the
  screen-reader label; a bare figure is only believed with a decimal point.
- **Selector values may be suffixed.** Voilà's is `fop-wrapper:<uuid>`, so
  `[data-test="fop-wrapper"]` matched nothing while `^=` matched everything.

When a capture fails, the bookmarklet copies a diagnostic: every array in the
page data (path, length, first element's keys) and the ancestor chains of
price-shaped leaf elements. **Fix extractors from that, never from a guess.**
It named Voilà's entire markup in one round-trip.

Also: the bookmarklet is a *copy* in the user's bookmarks bar. Any change to
`bookmarklet.ts` requires re-dragging it, and forgetting means testing stale
code. Related: React sanitizes a `javascript:` href set through JSX, so the
link's href is set imperatively via a ref — do not "simplify" it back.

---

## 10. Windows Vitest flake

Runs intermittently fail with `Timeout waiting for worker to respond` under
load. It is not a test failure. Rerun with:

```
npx vitest run --pool=threads --no-file-parallelism
```

---

## 11. There is no password login

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

---

## 12. An aggregate carries what it left out

**Incident.** `getStoreTotals()` in `ListsClient` priced a grocery list at each
store and returned `Record<chain, number>`. A bare number per chain has nowhere
to record an exclusion, so every item a store could not price was skipped in
silence — four `continue`s and an `if`, none of them observable by the caller.

Three lies came out of that one missing field:

- The cards sorted on the raw total and the badge went to index 0, so **the
  store missing the most items was labelled "Best."** The ranking was inverted
  by absence.
- The subtotal was captioned `{unchecked.length} items` — the count of *every*
  unchecked item — over a total that may have covered a third of them.
- With a store selected, a row that store could not price fell back to the
  all-store range, quoting a price from a shop the user was not looking at.

None of it threw. A wrong number is quiet, which is why this survived: the page
looked like it worked, and looked best exactly where the data was thinnest.

**The rule.**

- A function that sums over a filtered set returns the filtered-out items too,
  not just the sum. If the return type has no room for them, that is the bug —
  fix the type first, and the UI follows.
- A total shown beside a count uses the count of what it **actually covered**.
  Never the length of the input.
- **Two aggregates are only comparable over the same set.** Rank on the
  intersection, or do not rank. Where there is no shared set, say so rather
  than sorting anyway.
- A number on screen names the thing it belongs to. A total with no store
  attached cannot be checked by the person reading it.
- Put this logic in `src/lib/`, not in the component. `list-pricing.ts` is
  testable because it is not inside a `"use client"` file; the version that
  shipped the bug was not.

**Where it had already been solved, and where it had not.**
`/api/lists/[id]/recommend` ranks on coverage first and collects `unmatchedItems`
at the top level — that was audit M3, for exactly this reason. The list page and
`getWatchlistSummary()` both missed it. Both now go through
`computeListPricing()`; the recommend route still has its own copy, which is the
next thing to converge.

`getWatchlistSummary()` was the quiet one: its `bestStore` was returned by
`/api/watchlist/summary` but never rendered, so nothing on screen ever looked
wrong. A bad number that no one is currently reading is still a bad number —
the savings banner in `PLAN.md` would have shipped straight on top of it.

Related: rule 6. Silent success is the failure mode to design against, whether
it arrives as a 200 for the wrong region or a subtotal for the wrong basket.
