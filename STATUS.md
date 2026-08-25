# Panion — current state and next steps

**Last updated: 2026-08-19.** Read this first, then `CLAUDE.md` for the rules.

Everything below is **local Docker only**. Production (Neon) still has the old
schema and the old fabricated seed data and has not been touched.

---

## 1. Where the project is

Panion compares grocery prices in St. John's, NL. Two comparison axes:

- **Same product, different stores** — joined by UPC where available.
- **Same thing, different brands** — equivalence groups on `Product.subcategory`,
  ranked by **unit price** (a group deliberately spans pack sizes, so sticker
  price would mislead).

### Data, as of the last run

```
catalogue                : 250 products
Loblaw-exclusive brands  :  71  (No Name / PC — cannot exist off-Loblaw)
addressable elsewhere    : 179
comparable at 2+ stores  :  53

Dominion - Stavanger Dr    250  (100% of catalogue)
Sobeys - Mount Pearl        49  ( 27% of addressable)
No Frills                    3
Walmart Supercentre          2
```

Run `npm run coverage` to refresh those numbers and to list any suspicious
cross-store spreads (the bad-match detector).

### Verification state

**114 tests passing, 0 lint errors, `tsc` clean, `npm run build` clean.**
Working tree clean, everything pushed to `master` (`667f794`).

---

## 2. Sources — operational status

**Provenance, licensing and the standing decisions for each source live in
`DATA-SOURCING.md`, which is gitignored. Read it before adding or changing any
adapter.** What follows is only whether each one currently functions.

| Source | Gives | Works? |
|---|---|---|
| **PC Express** (Dominion, No Frills) | Regular prices, **UPCs**, sizes, images | Yes |
| **Voilà** (Sobeys) | Regular prices, unit price, category path, images | Yes — needs a session cookie; no barcodes |
| **Flipp** | Flyer/sale prices, all chains | Yes — overlay only; a full run matched 9 of 250 |
| **Browser capture** (`/admin/import`) | Anything you can see in a browser | Built, **not yet verified against a live page** |
| **Walmart, automated** | — | No. Bot-protected; not pursued. |

Three operational facts that will bite anyone who forgets them:

1. **Voilà scopes prices to the SESSION**, not a query parameter. An expired
   `VOILA_SESSION_COOKIE` returns a valid 200 for the wrong province (Natrel
   instead of Central Dairies). `runVoilaCycle()` aborts if the response has no
   Newfoundland dairy brands — do not remove that guard.
2. **Neither Voilà nor the Walmart captures carry a barcode.** Both match on
   brand + size + variant, which is far lossier than Dominion's UPC join. That
   is most of the 250-vs-49 gap, and it is structural, not a bug.
3. **Flipp is an overlay, never a foundation.** Sale-only by construction, so a
   store priced from Flipp alone looks systematically cheaper than it is, and
   its rows empty out each flyer cycle.

---
## 3. What was built (most recent work first)

- **Browser capture tooling** — bookmarklet + `/admin/import` paste-and-review
  page + `/api/capture/import`. The legitimate answer to Walmart: a person
  navigates, code parses only what that page already loaded.
- **`resolveAndIngest()`** (`src/lib/admin/ingest-items.ts`) — one core behind
  both the import UI and `/api/admin/observations`, so they cannot drift.
- **Voilà (Sobeys) adapter** — took Sobeys from 0 to 49 prices, and cross-store
  comparisons from 2 products to 53.
- **Matcher fixes** — chicken nuggets were matching chicken breasts ($5.97 vs
  $16.00). Fixing it also cleared a latent bug where `thigh`/`thighs` conflicted
  with each other; membership is now tested after `singularize()`.
- **`npm run coverage`** — coverage plus the ≥1.8× spread detector that found
  the nuggets error.
- **`npm run role`** — grant/revoke `moderator` / `store_admin`.
- Earlier: Flipp adapter, PC Express adapter, the ingestion writer, unit pricing,
  cross-brand comparison, the image proxy, snapshots.

---

## 4. Next step — start here

**Test the capture bookmarklet on a live Walmart search.** It has never been
run against a real page, so the extractor is a best reading of a Next.js
payload rather than something verified.

```
npm run dev
```

1. Sign in at `localhost:3000` **with Google, as yourself** — there is no
   password login, and `admin@sentinel.ca` is a seeded row nobody can
   authenticate as. Signing in creates your `User` row.
2. `npm run role -- grant <your-email> moderator`
3. Go to `/admin/import`, drag **Capture → Panion** to the bookmarks bar.
4. On walmart.ca search `milk`, click the bookmarklet, return and paste.

**Expected outcomes.** Either it captures products and the preview lists them
with what each matched to — or it finds nothing, copies a **diagnostic** of the
page shape instead, and toasts "No products found". Paste that diagnostic into
the session and the extractor can be fixed from it directly. It was built that
way on purpose.

The preview writes nothing until confirmed. Rows whose price moves ≥1.8× against
the price already held are flagged and **start unticked** — a nuggets-class
mismatch has to be opted into.

---

## 5. What is left, in rough priority order

1. **Verify the Walmart capture** (above), then point the same tool at Voilà —
   the parser is already source-agnostic.
2. **Sobeys coverage: 27% → higher.** The gap is name-matching against Loblaw's
   phrasing (`2% Milk` vs `2% Milk Partly Skim`). Tune with a fixture per
   change; never loosen a gate without one. See `CLAUDE.md` rule 7.
3. **Images.** Still hotlinked from retailer CDNs through the proxy, which is
   the sharpest legal exposure in the product. Plan: **Open Food Facts**
   (barcode-keyed, openly licensed — every product already has a real UPC) for
   national brands, own photography for private label. Also clears the six
   deferred `next/image` warnings.
4. **Production deploy.** Prod still has the old schema and the fabricated seed
   data. Needs a migration plan; `.env` is production, so re-read `CLAUDE.md`
   rule 2 before touching it.
5. **Browse/search by equivalence group.** Groups only surface on the product
   page; the browse page still lists individual SKUs.
6. **Crowdsourcing / receipt scanning.** The admin import path is deliberately
   the same code a contributor flow would use. Needs moderation first.

---

## 6. Commands worth knowing

```
npm run dev                 # never run `npm run build` while this is live
npm run coverage            # coverage + bad-match detector
npm run role -- list        # who has which role
npm run scrape:dominion     # PC Express  (needs PC_EXPRESS_API_KEY)
npm run scrape:sobeys       # Voilà       (needs VOILA_SESSION_COOKIE)
npm run scrape:flipp        # flyers, all chains
npm run snapshot:save       # before any bulk mutation
npm run snapshot:restore
npx vitest run --pool=threads --no-file-parallelism   # avoids the Windows flake
```

---

*Rules and past incidents: `CLAUDE.md`. Source provenance and legal position:
`DATA-SOURCING.md`. Pipeline design: `PRICING-PIPELINE.md`. File-by-file map:
`CODEBASE.md`. Test strategy: `TESTING.md`.*
