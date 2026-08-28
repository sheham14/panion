# Scaling — what holds, what breaks, and when

**Written 2026-08-28, against a 791-product production catalogue.**

The question this answers: *will this architecture hold up with thousands of
products?*

Short version: **the data model holds. Two code paths do not.** Neither needs a
rewrite — one needs blocking, the other needs to stop shipping the catalogue to
the browser. Everything underneath them is sound.

Nothing here is urgent. It is written down so the thresholds are known before
they are hit, rather than discovered by something getting slow.

Numbers marked **measured** were taken from the live databases on 2026-08-28
(`npm run images`, and ad-hoc payload measurements). Everything else is
extrapolation from those, and says so.

---

## The order things break

### 1. Browse — first to break, somewhere around 2,000–5,000 products

`src/app/(main)/browse/page.tsx` loads **every active product with every active
price** and hands the array to `BrowseClient`, a client component. There is no
pagination and no server-side filter.

Because the receiver is a client component, the data ships **twice**: once as
rendered DOM for every row, and again in the RSC flight payload so the client
can hydrate.

**Measured, production data (791 products, 889 price rows):**

```
JSON payload                    233 KB
  product scalars               113 KB
  storeProducts                 120 KB   (52%)
```

**Measured, local (260 products):** 82 KB of JSON became **346 KB of served
HTML** — roughly a 4× multiplier once markup and the flight payload are counted.
Extrapolating production: somewhere near 1 MB of HTML.

**Measured timing, local dev server:** 0.6–0.8 s warm TTFB. An earlier figure of
3.46 s was a *cold* request including route compilation and should be ignored —
it is not representative, and it was wrong to treat it as a problem.

This is strictly linear in catalogue size, so 5,000 products is ~1.5 MB of JSON
and several MB of HTML to a phone. There is no tuning around it.

**Fixes, in the order they stop being optional:**

| | Buys you | Cost |
|---|---|---|
| Flatten the store reference (below) | ~50 KB | Trivial, no UX change |
| Render progressively, keep all data client-side | To ~2,000 products | ~30 lines, no dependency |
| Server-side filter + pagination | Indefinitely | Browse becomes a second search page |

**The free one — 50 KB of pure duplication. Measured:** each of the 889 price
rows carries a nested `{ id, chain, name }` store object, for **4 distinct
stores**. Sending `storeId` and looking it up against the `stores` array that is
*already passed separately* costs nothing:

```
nested store object   107 KB
storeId only           56 KB    → 50 KB saved, ~21% of the whole payload
```

**The tension to decide deliberately.** A client-side filter box on browse is
instant and free *because* every product is already in memory. Paginate, and
search has to move server-side through `/api/products?q=` — which is what
`/search` already is. Pagination and instant filtering cannot both be had.

---

### 2. The matcher — the one that actually costs time

`matchProduct()` in `src/lib/pricing/match.ts` takes the **entire catalogue as
an in-memory array** and scans it linearly for every scraped row. The callers
(`run-flipp.ts`, `run-pcexpress.ts`, `run-voila.ts`, `ingest-items.ts`) all load
the full product list first.

The inner loop calls `parseSize()` and `tokenize()` **per product, per row** —
so the same product name is re-tokenised once for every scraped item in the run.
That is regex and string work, not a cheap comparison.

```
today          ~250 rows ×    791 products  =    200k comparisons
5k rows ×   10,000 products                 =     50M comparisons
5k rows ×   50,000 products                 =    250M comparisons
```

O(n×m) with an expensive constant. It is fine now and will get slow abruptly.

**Fixes, increasing effort:**

1. **Precompute tokens and sizes once per run.** Pure win, no behaviour change —
   this work is already being redone thousands of times.
2. **Blocking.** Bucket candidates by a cheap key (brand, category, or first
   significant token) and only compare within the bucket. Standard record
   linkage; turns O(n×m) into roughly O(n×k).
3. **More barcodes.** `matchByBarcode()` is an exact O(1) join. Every product
   carrying a real UPC never enters the fuzzy path — another argument for the
   Open Food Facts work in `STATUS.md` §7.

**None of these change the matcher's rules**, so CLAUDE.md rule 8 holds: the
fixtures keep passing because the logic is identical, only the candidate set
shrinks. Do not let a scaling change become a rules change — that rule exists
because every gate in `match.ts` was paid for with a real mismatch.

---

### 3. Product search — degrades around 20,000–50,000 products

`/api/products` filters with `contains` + `mode: "insensitive"`, which Postgres
executes as `ILIKE '%q%'`. **A leading wildcard cannot use a B-tree index**, so
every search is a sequential scan.

Two things follow, and both are worth knowing:

- `@@index([name])` on `Product` does nothing for this query.
- `@@index([name, brand])`, commented `// composite for search` in
  `schema.prisma`, does not help it either. The comment is aspirational.

At 791 rows this is invisible. At 50,000 it is tens of milliseconds; beyond
that it stops being acceptable.

**Fix is standard Postgres, no new infrastructure:** a `pg_trgm` GIN index, or a
`tsvector` column with real full-text search. The second also brings stemming
and ranking, which would improve results *today* — this is the one item on the
list worth doing for its own sake rather than for scale.

---

## What holds up

- **Per-user paths scale with the user, not the catalogue.**
  `getWatchlistSummary()`, `computeListPricing()`, and the pantry page are all
  bounded by what one person tracks — tens of items. `computeListPricing` is
  O(items × chains). Catalogue size does not enter.
- **Denormalised `StoreProduct.currentPrice`** (audit M1) keeps hot reads off a
  correlated subquery into `priceHistory`. The decision pays off *more* as data
  grows, not less.
- **`@@unique([storeId, productId])` plus indexes on both sides** match the
  actual join patterns.
- **The image proxy** is per-product and cached hard at the edge
  (`s-maxage=604800, immutable`), so it is indifferent to catalogue size.
  **Measured:** 787 of 791 production products carry photography, across the
  three allowlisted CDNs (`digital.loblaws.ca` 371, `i5.walmartimages.ca` 240,
  `voila.ca` 176). Run `npm run images` to refresh.

---

## Plan for, do not fix

`PriceHistory` is append-only and unbounded. At today's coverage that is roughly
900 rows per scrape cycle — order of 325k/year — which Postgres will not care
about for years. It grows with products × stores × frequency, so it eventually
wants a retention policy or partitioning.

It is empty on production today (deleted with the fabricated seed), so this is a
"decide before it matters" item, not a problem.

---

## Recommended order, when the time comes

1. **Precompute in the matcher** — smallest change, removes work that is already
   wasted.
2. **Trigram or full-text index on product search** — improves results now and
   removes the future cliff.
3. **Flatten the browse store reference** — 50 KB for a few lines.
4. **Server-side browse** — when the catalogue passes ~2,000 products. Not
   before, and not without deciding the filter-vs-pagination trade-off above.

---

## Deferred by decision (2026-08-28)

Proposed for the browse page and **deliberately not built before the demo**,
because the app works as it is:

- A filter box on browse (client-side over the already-loaded array).
- A tile/list toggle, copying the pattern `HomeClient` already uses
  (`LayoutGrid`/`LayoutList` plus a `localStorage` key).
- Product photography on browse tiles, which needs `imageUrl` adding to the
  browse `select` — it is not fetched there today.

If the tile view is built, do the payload work first: tiles multiply the number
of rows on screen, and browse is the page that can least afford it.
