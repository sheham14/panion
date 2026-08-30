**Last updated: 2026-08-30.** Read this first, then `CLAUDE.md` for the rules.

**The demo happened — Saturday 2026-08-29**, a casual tech-community demo night,
driven live on production for an audience of other builders. It went well. The
data question came up and held up, which was the one worth preparing for: the
honest framing — same endpoint their website calls, no account, no
circumvention, and a bot wall deliberately not crossed — is what a room of
developers actually respects. The script and the prepared answers live outside
the repo, in the Claude artifact written for the night.

**The demo is no longer the organising constraint.** What follows is the state
of the project, not a countdown. Work can be picked up by size and interest
again rather than by what survives a live run.

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

### Data — production, 2026-08-28 (after the Dominion *and* Sobeys scrapes)

```
products                              791
equivalence groups (2+ members)       184   (244 distinct subcategories)
groups comparable across 2+ stores     92   <- the demo metric
products comparable at 2+ stores      173

products priced at ALL THREE stores     32   <- what a full list row needs
products priced at exactly two         139   (D+S 76, S+W 39, D+W 24)

Loblaw-exclusive brands               107   (unreachable off-Loblaw)
addressable elsewhere                 684

Dominion - Stavanger Dr               415   (PC Express API, automatic)
Sobeys - Mount Pearl                  308   (Voilà API, automatic)
Walmart Supercentre - St. John's      269   (browser capture — manual only)
No Frills                               3   (Flipp only; never scraped)
Colemans / Costco                       0   (no capture path)

price age, median                      0d Dominion · 0d Sobeys · 2d Walmart
price age, oldest                     12d at every store
rows currently on sale                123/415 D · 77/308 S · 41/269 W

suspicious cross-store spreads           6   <- see below
```

Strongest groups: `shredded-mozzarella-cheese` (20 products, 2 stores),
`block-cheddar-cheese` (19, 3), `salted-butter` (16, 3), `multigrain-bread`
(15, 4), `large-eggs` (15, 3), `salted-margarine` (15, 2).

**The number that matters for a list demo is 32, not 92.** A store-comparison
row is only full when all three stores can price that product. 30 of those 32
also have every price under three days old, which is what the home page's
freshness chip cares about — it turns red at eight days.

**Sobeys is automatable; Walmart is not.** That asymmetry drives everything.
Dominion and Sobeys refresh with one command each. Walmart's 269 prices all
came from a human with a bookmarklet, so its tail goes stale and only a capture
pass fixes it. The 76 products sitting at Dominion+Sobeys are all missing
Walmart for exactly this reason.

**Cheese is now the strongest aisle, not the weakest.** This file said the
opposite until 2026-08-28 — "64 products, only ONE comparable group, steer the
live demo away from cheese". The capture pass happened and the note was never
updated, which is the kind of stale advice that costs a demo its best material.
It is now **143 cheese products across 12 comparable groups**.

**The two scrapes bought coverage and cost accuracy.** Together they took
products-at-all-three from 10 to 32 and comparable groups from 87 to 92. They
also took the bad-match detector from clean to **six** flagged spreads, all the
same shape: a **generic supermarket name matched onto a branded catalogue
product** — "Vegetable Oil Margarine Original" onto "I Can't Believe It's Not
Butter", "Apple Juice" onto "Oasis Apple Juice". The brand gate in `match.ts`
should reject those, which points at the **barcode** path, where the name and
brand gates never run. A wrong barcode produces a confident wrong match with no
second opinion. None of the six are in dairy, bread or cheese.

**And one class the detector cannot see.** `Great Value` is Walmart's private
label and now shows a price at Dominion and Sobeys; `coverage.ts` has a
`LOBLAW_ONLY` brand list but no equivalent for Walmart's or Sobeys' own labels,
and the spread sits under the 1.8× threshold. Treat any store-exclusive brand
showing three prices as wrong until proven otherwise.

Refresh all of the above with `npm run coverage -- --production`. Until
2026-08-28 that script could only reach localhost, so these numbers were
maintained by hand and drifted.

**Only three stores matter, and that is deliberate.** Dominion is fed
automatically by the API. No Frills is a Loblaw banner that *could* be scraped —
but `PC_EXPRESS_BANNERS` in `adapters/pcexpress.ts` only has Dominion's store
id, so adding it means discovering No Frills' id against a live API. Colemans
has no online storefront; Costco is membership-gated with bulk sizes and no
capture path. Neither is worth chasing before the demo.

### Verification state

**215 tests passing, 0 lint errors, `tsc` clean, `npm run build` clean.**
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

- **Pantry tiles say how long ago an item was added.** Suggested by someone at
  the demo — and it was half there already, showing a relative date from
  `updatedAt`. That meant *time since last touched*, so editing a quantity made
  a jar owned for months read as "today". It reads `createdAt` now, says
  "added 3 weeks ago", and is a shade darker because the old `#ccc` was close
  to unreadable on a projector. `updatedAt` still drives the sort order, which
  is the right thing for it to drive. The test written alongside immediately
  caught a real bug: `Math.floor` of a negative difference returned
  **"added -1 days ago"** whenever the stored timestamp sat slightly ahead of
  the browser clock, which is ordinary drift. Clamped at zero.
- **Pantry: one delete button, not two.** "Used up" and "Remove" were the same
  handler with different labels, so the UI offered a distinction the code never
  made. If consuming ever becomes its own action — decrementing a quantity
  rather than deleting the row — it can come back as something that genuinely
  differs.
- **Clove treats the pantry as fact.** It was asking users what ingredients
  they had, while holding their pantry in context. Not plumbing: the persona
  licensed a follow-up question, and the pantry arrived as "work these in where
  it makes sense" — a hint, never established as a complete inventory. It is
  now stated as the complete inventory with an explicit instruction not to ask,
  and an empty pantry says so rather than being omitted, since silence leaves
  the model unable to tell "empty" from "unknown".
- **Recipe options no longer all render as "1."** The reply renderer buffers
  consecutive list items into one `<ol>`, but a blank line flushed the buffer
  and a description line under an item did the same — both are exactly how
  Clove formats choices, so every option opened a new list and restarted at 1.
- **Floating controls stay inside the app column.** `position: fixed` anchors
  to the viewport, not to the centred `max-w-md` column, so on a laptop the
  add-item buttons sat out in the dead space beside the app and the pantry bulk
  bar stretched across the whole screen.

- **Sale prices are visible where the price is.** `isSale` was already in the
  payload on search and lists and rendered on neither, so a flyer deal quietly
  improved a store's total with nothing on screen saying why. Both now show the
  same red "Sale" badge the product page uses, on the figure actually being
  displayed — the selected store's row, or the cheapest when showing a range.
  Sale status does **not** come from browser capture: PC Express returns a deal
  badge with a was-price and an expiry, Voilà returns promo-vs-shelf, the
  Walmart bookmarklet reads the strikethrough, and Flipp is sale-by-definition.
  Currently 123 of 415 Dominion rows, 77 of 308 Sobeys, 41 of 269 Walmart.

- **Watch a product from the search results in one tap.** Adding to the
  watchlist from a "Cheapest {group}" card took three taps and a page load:
  expand the card, tap an option, watch it on the product page. The featured
  product — the recommendation the card exists to make — sat *inside* the
  disclosure button, so tapping it only collapsed the card, and the ranked list
  underneath was links to product pages. `/api/groups` also had no session
  awareness at all, so no row could know whether it was already watched. It now
  stamps `isWatched` the way `/api/products` does, and every group row has a
  bell beside it. The flat result cards always had this; only the group cards
  did not.

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

**Nothing is urgent.** The demo is done and the app is in a good state: 215
tests, clean typecheck, clean lint, clean build, everything pushed.

Two things are worth doing before anything else, both small and both found by
using the app rather than reading it:

1. **Guest Clove may be broken in production.** `UPSTASH_REDIS_REST_URL` in
   `.env.local` points at a host that no longer resolves (NXDOMAIN), so the
   guest path 500s locally. Redis is used *only* by the guest branch — the
   signed-in path rate-limits on Postgres and is unaffected — but if Vercel's
   copy of that variable is also dead, a logged-out visitor gets a 500 from
   Clove. **Open panion.dev in a private window and send one message to check.**
2. **The barcode path bypasses the matcher's gates.** The two scrapes on
   2026-08-28 introduced six suspicious spreads, all the same shape: a generic
   supermarket name matched onto a branded catalogue product. The brand gate in
   `match.ts` should have rejected them, which points at `matchByBarcode` —
   where the name and brand gates never run, so a wrong barcode produces a
   confident wrong match with no second opinion. Worth confirming and, if true,
   deciding whether a barcode should still have to survive a size check.

After that, pick by interest — §5 is the standing list.

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
4. **Browse: filter box, tile/list toggle, tile photography.** Proposed
   2026-08-28 and **deliberately deferred** — the app works as it is and the
   demo comes first. All three are small; the constraint is that browse ships
   the whole catalogue to the client, so tiles multiply the rows on screen on
   the page that can least afford it. Do the payload work first. Sizes,
   thresholds and the filter-vs-pagination trade-off are in `SCALING.md` §1.
5. **Scaling generally — see `SCALING.md`.** Written 2026-08-28 with measured
   numbers. Nothing there is urgent; it records what breaks first (browse, at
   ~2–5k products), what breaks worst (the matcher, O(rows × catalogue) with
   `tokenize()` inside the loop), and what is already fine (every per-user
   path). Read it before optimising anything — several of the obvious targets
   are not the expensive ones.
6. **The sorting agent, properly.** Capture-creates-products is built and
   human-gated. The owner's larger idea — search something broad, let an agent
   sort everything into sections unattended — is the right direction and is now
   most of the way there. What is missing is confidence in dedup: creation is
   safe because a bad creation is untidy, whereas a bad *match* writes a wrong
   price.
7. **Cheese, and group granularity generally.** 30 groups for 64 cheeses is too
   fine to compare. A pass that merges over-specific groups would help several
   aisles.
8. **Matcher: brand mismatch.** The matcher proposes cross-brand pairs because
   coverage counts a brand as one token among four, so "Newfoundland Eggs Large
   White" scores exactly at threshold against a Compliments carton. Tightening
   on brand would cut review noise — but a false reject now mints a duplicate
   product, so it needs a fixture and care. The verifier catches these today.
9. **Images.** Retailer photography, now including Walmart's and Sobeys', on a
   public site. `DATA-SOURCING.md` §3.1 records this as a knowing decision with
   a stated expiry. Replace with Open Food Facts by barcode (every product has a
   real UPC) plus own photography for private label.
10. **No Frills** via PC Express — needs its store id discovering.
11. **`price_history` is empty on production.** It was deleted with the
   fabricated seed products, so any sparkline or trend UI has nothing to draw
   until several scrape cycles have run.
12. **Scheduled scrapes.** Inngest crons write to whatever `DATABASE_URL` the
   deployment has. Confirm Vercel carries `PC_EXPRESS_API_KEY` and that
   `SCRAPERS_ENABLED` works as a kill switch there.

---

## 6. Commands worth knowing

```
npm run dev                 # never run `npm run build` while this is live
npm run coverage            # coverage + bad-match detector; add -- --production
npm run images              # product-photo coverage; add -- --production
npm run role -- list        # who has which role
npm run scrape:dominion     # PC Express  (needs PC_EXPRESS_API_KEY); -- --production
npm run scrape:sobeys       # Voilà       (needs VOILA_SESSION_COOKIE)
npm run scrape:flipp        # flyers, all chains
npm run snapshot:save       # before any bulk mutation; add -- --production
npm run snapshot:restore    # local only — restoring to production is refused
npx vitest run --pool=threads --no-file-parallelism   # avoids the Windows flake
```

---

*Rules and past incidents: `CLAUDE.md`. Source provenance and legal position:
`DATA-SOURCING.md`. Pipeline design: `PRICING-PIPELINE.md`. File-by-file map:
`CODEBASE.md`. Test strategy: `TESTING.md`. What breaks as the catalogue grows,
and at what size: `SCALING.md`.*
