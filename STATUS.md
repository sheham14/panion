**Last updated: 2026-08-28.** Read this first, then `CLAUDE.md` for the rules.

**DEMO: Saturday 2026-08-29**, a casual tech-community demo night — an audience of other
builders, driven live, on **production (panion.dev)**. Optimise for "works live,
looks real", not for breadth.

**Production is the source of truth.** Both the catalogue and every captured
price live on Neon. Do NOT restore a local snapshot over it — that would
overwrite captured prices with stale local ones. Reaching production is always
explicit: `--config prisma.production.config.ts` for Prisma, `--production` for
`catalogue:import` and `role`. The default for everything is local.

---

## 1. Where the project is

Panion compares grocery prices in St. John's, NL. Two comparison axes:

- **Same product, different stores** — joined by UPC where available.
- **Same thing, different brands** — equivalence groups on `Product.subcategory`,
  ranked by **unit price** (a group deliberately spans pack sizes, so sticker
  price would mislead).

### Data — production, 2026-08-26

```
products                              701
equivalence groups                    231
groups comparable across 2+ stores     75   <- the demo metric

Dominion - Stavanger Dr               371   (PC Express API, automatic)
Walmart Supercentre - St. John's      227   (browser capture)
Sobeys - Mount Pearl                  187   (browser capture)
No Frills                               3   (Flipp only; never scraped)
Colemans / Costco                       0   (no capture path)
```

Strongest groups: `multigrain-bread` (15 products, 4 stores), `salted-butter`
(16, 3), `large-eggs` (15, 3), `whole-wheat-bread` (14, 3), `2-percent-milk`,
`1-percent-milk`, `skim-milk`, `unsalted-butter`, `everything-bagel`.

**Weak aisle: cheese.** 64 products but only ONE comparable group
(`cream-cheese`) — the rest fragmented into 30 groups (aged vs mild, block vs
shredded), each with one or two members. Either capture `cheddar cheese` /
`mozzarella` / `shredded cheese` at both stores, or steer the live demo away
from cheese.

**Only three stores matter, and that is deliberate.** Dominion is fed
automatically by the API. No Frills is a Loblaw banner that *could* be scraped —
but `PC_EXPRESS_BANNERS` in `adapters/pcexpress.ts` only has Dominion's store
id, so adding it means discovering No Frills' id against a live API. Colemans
has no online storefront; Costco is membership-gated with bulk sizes and no
capture path. Neither is worth chasing before the demo.

Run `npm run coverage` to refresh those numbers and to list any suspicious
cross-store spreads (the bad-match detector).

### Verification state

**199 tests passing, 0 lint errors, `tsc` clean, `npm run build` clean.**
Everything pushed to `master`.

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
| **Browser capture** (`/admin/import`) | Anything you can see in a browser | **Yes — verified live against Walmart and Voilà search (2026-08-25)** |
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

- **The home summary ranks on coverage too.** `getWatchlistSummary()` was the
  last place summing into a bare `Record<chain, number>` and picking the
  smallest, so the store missing the most watched products won. It now goes
  through `computeListPricing()`, and each store carries `covered`/`missing`
  beside its total. It was the quiet one: `bestStore` is returned by
  `/api/watchlist/summary` but never rendered, so nothing on screen looked
  wrong — the savings banner in `PLAN.md` would have shipped on top of it.
- **Real product photography on home and pantry tiles.** Both now render the
  linked product's image through `/api/products/[id]/image` and fall back to
  the category emoji only when there is no product behind the row. The pantry
  page was not fetching the product at all, so it could never have shown one.
  `npm run images` reports how much of the catalogue has photography and which
  hosts it points at (787 of 791 on production, across the three allowlisted
  CDNs).
- **The list total says what it leaves out** (`src/lib/list-pricing.ts`).
  Pricing a list across stores used to return `Record<chain, number>`, and a
  bare number has nowhere to record an exclusion, so anything a store could not
  price was dropped in silence. The ranking was therefore **inverted by
  absence** — the store missing the most items showed the smallest total and
  was labelled "Best" — and the subtotal was captioned with the count of every
  unchecked item regardless of how many it covered. Now each store carries its
  `missing` items (with the cheapest price held elsewhere), ranking runs on the
  basket every store can price, cards state their own coverage, the subtotal
  names its store, and a breakdown groups what is excluded by reason. Wording
  is deliberately weak: **"No price at Sobeys", never "Sobeys doesn't carry
  it"** — Sobeys holds 187 of 701, so most absences are our gaps, not the
  shelf's.
- **Matcher: multipack sizes multiply out; `npm run prices:clean`.**
  `parseSize()` had no multipack rule, so Voilà's correct `"22 x 18.636g"` for
  a 410 g box read as 18.6 g. The unit price built on it was wrong by the size
  of the pack — $37.51/100g for that cheese, $1090.70/100g for a butter tart.
  `parseQuantity()` in `unit-price.ts` always handled multipacks; the damage
  arrived through `unitQuantity`/`unitMeasure`, which `getUnitPrice` prefers
  over re-reading the string.
- **Search: the impossible-unit-price rule judges only the high side.** On a
  two-member group the median *is* the outlier, so a real $1.09/100g was
  dropped and a misparsed $37.51 kept. Sizes misread small, never large, so an
  absurd figure is always on the high side.
- **Cross-brand search (`/api/groups` + search page).** "What is the cheapest
  bread" now has a front door. Groups rank by unit price and appear above the
  flat product list as "Best value by type" cards. Unit prices more than 12×
  from their group's median are shown but not ranked — a misparsed size once
  produced $565.91/100g, and one absurd figure discredits every number beside
  it.
- **Capture creates catalogue products** (`resolveAndIngest`, `createUnmatched`).
  A row becomes a new product three ways, which are one idea — *this is not that
  product, so it is a product of its own*: nothing matched, the verifier
  rejected it, or the reviewer unticked it. The classifier is given the groups
  already in use, so a Walmart egg joins `large-eggs` rather than founding
  `large-white-eggs` beside it and splitting the comparison in half.
- **Model verification of every match** (`verify-matches.ts`). Replaces per-row
  human review with same/different/unsure plus a reason. Failure is never
  approval.
- **Capture auto-submit** — a `CaptureToken` bearer secret in the request body,
  not a cookie, because NextAuth withholds cookies cross-site from walmart.ca.
  The token grants **enqueue only**; queued captures still need a signed-in
  human to import them. Posts as a CORS *simple request* (`text/plain`) so no
  preflight is issued — panion.dev 307-redirects to www, and a preflight meeting
  a redirect is a hard error, which is what made auto-submit fail silently in
  production while working locally.
- **Per-store worklist** on `/admin/import`, built from products that store is
  actually missing and following the store dropdown.
- **Store pinning** — a `walmart` capture can only be imported into Walmart, a
  `voila` one into Sobeys. Enforced server-side, not just auto-selected.

- **Capture auto-submit + worklist.** The bookmarklet posts captures straight
  into a review queue (`CaptureBatch`), and `/admin/import` shows a per-store
  worklist ranked by products the store has no price for, with one-click search
  links. Authentication is a `CaptureToken` bearer secret in the request body,
  not a cookie: NextAuth's SameSite cookie is withheld on a cross-site POST
  from walmart.ca, and carrying the secret in the body means
  `/api/capture/submit` takes no credentials at all — so answering other origins
  adds no CSRF surface. The token grants **enqueue only**, never read or write,
  and is revoked by generating another.
- **Browser capture, verified live against both Walmart and Voilà.** What the
  first real runs taught, all of it now pinned by fixtures in
  `tests/unit/parse-capture.test.ts`:
  - **Neither site puts products in its page data.** Walmart fetches search
    results client-side over persisted GraphQL; Voilà (Ocado, not Next.js)
    publishes only product *URLs* in `ld+json`. The rendered tiles are the
    only place products exist, so the bookmarklet has a **DOM tier** with a
    per-site selector config.
  - **Walmart's visual price is unreadable.** Dollars and cents are separate
    spans, so `textContent` fuses `$4.98` into `"$498current price $4.9826¢/100ml"`.
    The screen-reader `current price` label is the trusted reading.
  - **Walmart often omits size from the name** — one title covers both the 2L
    and the 1L — so size is derived from the unit price, giving the size guard
    something to grip. Voilà supplies a clean size field and needs none of this.
  - **Was-price wording differs**: Walmart `Was $5.97`, Voilà `Previous price$6.99`.
  - When no selector matches, the diagnostic samples the **ancestor chains** of
    price-shaped leaf elements. That is what produced Voilà's real hooks
    (`fop-wrapper:<uuid>`, `fop-size`, `fop-price-per-unit`) in one round-trip;
    it is the intended way to onboard the next site.
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

**Everything for the demo is built. What remains is rehearsal and polish.**

1. **Rehearse the live searches on panion.dev.** Type `bread`, `butter`, `eggs`,
   `milk` into search. Each should show **"Best value by type"** group cards
   above the product list — "Cheapest salted butter · 16 products across 3
   stores · up to 29% cheaper", expandable into the unit-price ranking. If a
   search looks thin or wrong, that is the bug to fix; nothing else matters more.
2. **Avoid `cheese` live** unless its groups get filled first (see §1).
3. **Open a real list on panion.dev before demoing it.** The store-coverage
   work in §3 was verified against unit tests and the guest fixture, not
   against a signed-in account on production. Real lists will have far more
   gaps than the fixture's two, and the panel is the one screen whose whole
   job is to show them honestly.
4. Optional: a capture pass on `cheddar cheese` / `mozzarella` / `shredded
   cheese` at Walmart and Voilà to make cheese demoable.

### The capture loop, when more coverage is wanted

1. Sign in on **panion.dev** with Google. Moderator role is already granted to
   `sheham.shahid@gmail.com` on production.
2. `/admin/import` → **Generate** under "Auto-submit key" → **drag Capture →
   Panion to the bookmarks bar in that same visit.** The key is embedded at
   generation time and never shown again, so re-dragging later without
   generating produces an unarmed, clipboard-only bookmark.
3. Use the worklist on that page — it is built from products this store is
   actually missing, and follows the store dropdown.
4. Search, click the bookmarklet, come back and review the queue.

**What ticking means, because it is the one thing that is easy to get wrong:**

- **Tick** = "this is the same product" → writes the price onto that catalogue
  row. Only tick same brand, same variety, same size.
- **Untick** = "this is a different product" → **creates** it in the catalogue.
  A different brand of the same thing is NOT a match. Untick it, and the
  classifier drops it into the same equivalence group, which is exactly what
  makes the two comparable as alternatives.

Cross-brand comparison comes from the group, never from matching two brands to
each other.

Every match is read back by a model (`verify-matches.ts`) before acceptance:
`different` is dropped server-side, `unsure` is surfaced with its reason, and
only those need a human. Its safety property is that **failure is never
approval** — an API error, an unparseable reply or a skipped row all resolve to
`unsure`.

If a capture finds nothing it copies a **diagnostic** instead. Paste that into
the session: the array survey and price-leaf ancestor chains are enough to fix
the extractor directly, and that is how Voilà was onboarded.

---

## 5. What is left, after the demo

1. **Guest mode is the only surface still showing an emoji instead of a photo.**
   Signed-in home and pantry tiles render real retailer photography through
   `/api/products/[id]/image` (verified end to end — the proxy returns an
   800×800 JPEG). Guest mode cannot: its fixture products
   (`prod_milk_natrel`, …) were deleted from production with the rest of the
   fabricated seed, so the proxy has no row to serve, and `img-src` in
   `next.config.mjs` is `'self'`, so a retailer URL cannot be used directly.
   The two ways out are to point guest mode at real catalogue rows at render
   time (one query, but guest mode is deliberately DB-free today and the
   products would no longer be curated), or to leave the emoji. **Decide
   before demoing guest mode.**
2. **Linking a typed-in list item to a catalogue product.** The list's
   "not counted" bucket can offer *Add a price* but not *link a product*:
   `patchSchema` in `src/app/api/lists/[id]/items/route.ts` takes no
   `productId`. Adding it needs the route to verify the product exists and to
   return the item with `product.storeProducts` included, plus a search field
   in `EditItemSheet`. That is the real fix for an unlinked item; a custom
   price is the workaround. **The pantry already has this** — `PantryEditSheet`
   searches `/api/products` and links, which is what makes its photos appear.
3. **`/api/lists/[id]/recommend` still has its own coverage logic.** It ranks
   on coverage first (audit M3) rather than on a shared basket, so it and
   `computeListPricing()` can disagree about which store is best. Converge it.
4. **The sorting agent, properly.** Capture-creates-products is built and
   human-gated. The owner's larger idea — search something broad, let an agent
   sort everything into sections unattended — is the right direction and is now
   most of the way there. What is missing is confidence in dedup: creation is
   safe because a bad creation is untidy, whereas a bad *match* writes a wrong
   price.
5. **Cheese, and group granularity generally.** 30 groups for 64 cheeses is too
   fine to compare. A pass that merges over-specific groups would help several
   aisles.
6. **Matcher: brand mismatch.** The matcher proposes cross-brand pairs because
   coverage counts a brand as one token among four, so "Newfoundland Eggs Large
   White" scores exactly at threshold against a Compliments carton. Tightening
   on brand would cut review noise — but a false reject now mints a duplicate
   product, so it needs a fixture and care. The verifier catches these today.
7. **Images.** Retailer photography, now including Walmart's and Sobeys', on a
   public site. `DATA-SOURCING.md` §3.1 records this as a knowing decision with
   a stated expiry. Replace with Open Food Facts by barcode (every product has a
   real UPC) plus own photography for private label.
8. **No Frills** via PC Express — needs its store id discovering.
9. **`price_history` is empty on production.** It was deleted with the
   fabricated seed products, so any sparkline or trend UI has nothing to draw
   until several scrape cycles have run.
10. **Scheduled scrapes.** Inngest crons write to whatever `DATABASE_URL` the
   deployment has. Confirm Vercel carries `PC_EXPRESS_API_KEY` and that
   `SCRAPERS_ENABLED` works as a kill switch there.

---

## 6. Commands worth knowing

```
npm run dev                 # never run `npm run build` while this is live
npm run coverage            # coverage + bad-match detector
npm run images              # product-photo coverage; add -- --production
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
