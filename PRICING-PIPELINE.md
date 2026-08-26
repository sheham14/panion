# Panion — Pricing Data Pipeline Plan

How Panion gets real, fresh grocery prices — the strategy, the verified facts behind it, the architecture, and a phased build plan.

This document is self-contained: if you're reading it cold (or coming back after a month), everything you need is here. It was researched and written in July 2026; re-verify the store-specific facts in §2 before building, since store platforms change.

---

## 1. The Strategy in One Paragraph

Panion's core risk is stale price data ([`DISCOVERY.md`](DISCOVERY.md) calls it the highest risk, correctly). The plan is a **layered hybrid**: automated scraping of the stores' own e-commerce platforms as the backbone (they publish real, store-specific shelf prices — verified, see §2), flyer data via Flipp's structured backend for weekly sale prices, an admin bulk-entry tool so manual updates are a genuine fallback rather than a fantasy, and crowdsourced price reports (already built) as verification. Every price row carries its **source and timestamp**, and the UI is honest about staleness. No single layer has to be perfect — each backstops the others.

Two framing decisions that make this tractable:

1. **"Weekly-fresh" beats "real-time."** Grocery prices move on the flyer cycle (Thursdays in NL) plus occasional mid-week changes. A pipeline that refreshes weekly, aligned to the flyer cycle, delivers ~95% of the value at a fraction of the complexity.
2. **The basket that matters, not the whole catalog.** ~80 products are seeded today; the target is a few hundred *well-mapped* staples, not tens of thousands of loosely-matched SKUs. A wrong match (comparing 400g of one brand against 750g of another) damages trust more than a missing product does.

---

## 2. Ground Truth: Where Price Data Actually Lives

Verified July 2026 (via research; the dev sandbox couldn't reach retail domains directly — see §10).

| Chain | Online source | Store-specific? | True shelf price? | Notes |
|---|---|---|---|---|
| **Walmart** | walmart.ca (grocery section) | ✅ pick a pickup store | ✅ pickup orders charged the in-store price | Heaviest bot protection (Akamai). Hardest adapter. |
| **Dominion** | newfoundlandgrocerystores.ca — Loblaw's **PC Express** platform | ✅ per-store | ✅ "the in-store price at your banner, no markups hidden in items" — fees are separate | Loblaw runs all its banners on one platform backed by a JSON product API. **Easiest adapter — build first.** |
| **Sobeys** | voila.ca (curbside pickup) | ✅ live at St. John's stores: Howley Estates, Kelsey Drive, Merrymeeting Rd | ✅ same prices as in-store, no markup (some promos may differ online) | Delivery isn't offered in NL, but curbside pickup is — and that's what exposes store-level prices. |
| **Costco** | costco.ca | ❌ | ❌ online prices bake in shipping — groceries run **8–49% higher**; Costco explicitly states warehouse ≠ online pricing | **No scraper can help here.** Costco is the manual/crowdsource lane (§6.4). Mitigating: warehouse prices change infrequently. |
| **All four (flyers)** | Flipp (flipp.com and the stores' own flyer pages, which embed Flipp's viewer) | ✅ by postal code | Sale prices only | Flyers are rendered *from JSON* — item name, price, sale text, valid dates. One Flipp adapter covers all four chains' weekly specials. See §6.5. |

**Key takeaway:** three of four chains publish genuine, unmarked, store-specific shelf prices for actual St. John's locations. The pipeline is feasible.

---

## 3. Legal Position & Scraping Etiquette

Being precise, because this was a deliberate decision, not an oversight:

- **It's grey, not clean.** All of these sites' terms of service prohibit automated access. Scraping publicly available price data at small scale is common practice and enforcement against low-volume readers is technical (blocks), not legal — but nobody should pretend the ToS says yes.
- **Costco's ToS is moot** — we don't scrape them at all (their online prices are wrong for our purpose anyway).
- **Flipp endpoints are unofficial** — the flyer viewer's own unauthenticated API, used by many community projects. It can change without notice.

**Etiquette rules (hard requirements for every adapter):**

1. **Tiny footprint.** A few hundred requests per store *per week* — indistinguishable from one shopper browsing. Never parallel-hammer.
2. **Randomized pacing.** 2–10s jitter between requests; run jobs at quiet hours; don't run all stores simultaneously.
3. **Cache aggressively.** Never re-fetch what we already have for the cycle. Respect the weekly cadence — no "just refresh it again."
4. **Fail quietly and back off.** On 403/429/5xx: exponential backoff, then *give up for the cycle* and flag `extractionFailed` — never retry-storm.
5. **No account scraping, no personal data, prices only.**
6. **Kill switch.** A single env var (`SCRAPERS_ENABLED=false`) disables all scraping jobs instantly.

If a store blocks us: that's the answer for that cycle. The manual layer (§6.6) covers the gap; that's why it exists.

---

## 4. Architecture Overview

```
┌─────────────────────────── SOURCES ────────────────────────────┐
│  Dominion adapter   Walmart adapter   Voilà adapter   Flipp    │
│  (PC Express API)   (walmart.ca)      (voila.ca)      adapter  │
│                                                                │
│  Admin bulk-entry UI (manual)      User price reports (built)  │
└───────────────┬────────────────────────────────────────────────┘
                │  PriceObservation { storeProduct, price, isSale,
                │                     saleEndDate?, source, observedAt }
                ▼
┌────────────── INGESTION (one shared writer) ───────────────────┐
│ 1. validate (sanity bounds, unit checks)                       │
│ 2. write PriceHistory row (append-only, with source)           │
│ 3. update StoreProduct.currentPrice / isSale / saleEndDate     │
│    according to precedence rules (§7)                          │
│ 4. log to ScrapeRun (for scraper sources)                      │
└───────────────┬────────────────────────────────────────────────┘
                ▼
┌────────────── SERVING ─────────────────────────────────────────┐
│ Price comparison, lists, alerts — all read StoreProduct        │
│ UI shows staleness: "as of 2 days ago" from lastScrapedAt      │
└────────────────────────────────────────────────────────────────┘
```

Design rules:

- **Adapters are dumb, the ingestion writer is smart.** Each adapter's only job: given a list of `StoreProduct` mappings for its chain, return `PriceObservation[]`. All validation, precedence, and DB writing live in one shared module. Adding a store = adding one adapter.
- **`PriceHistory` is append-only truth; `StoreProduct.currentPrice` is a derived cache.** Never edit history; always re-derive current price from the precedence rules. If a source turns out to be bad, we can replay.
- **Every observation is attributable.** `source` + `scrapedAt`/`observedAt` on every row. This is what makes honest staleness UI (§7) possible.

### Proposed code layout

```
src/lib/pricing/
  types.ts              # PriceObservation, AdapterResult
  ingest.ts             # the one shared writer (validate → history → current)
  adapters/
    dominion.ts
    walmart.ts
    voila.ts
    flipp.ts
src/inngest/
  client.ts
  functions/
    scrape-store.ts     # one function, parameterized by chain
    scrape-flyers.ts
    scrape-alert.ts     # notify admin when a run's errorCount spikes
```

---

## 5. What the Schema Already Supports (Almost Everything)

The schema was designed for this. Existing fields, no migration needed:

| Need | Already in schema |
|---|---|
| Per-store product mapping | `StoreProduct.storeSku`, `storeProductName`, `scrapeUrl` |
| Current price + sale state | `StoreProduct.currentPrice`, `isSale`, `saleEndDate` |
| Freshness tracking | `StoreProduct.lastScrapedAt` |
| Broken-mapping flag | `StoreProduct.extractionFailed` |
| Append-only history w/ provenance | `PriceHistory.source` (`"manual" \| "scraper" \| "crowdsourced"`), `scrapedAt`, `submittedBy` |
| Scrape job auditing | `ScrapeRun` (status, counts, `errorDetails`, `alertSent`) |
| Crowdsourced reports w/ verification | `PriceReport` (status, corroboration, velocity-limit indexes) |
| Flyer metadata | `Flyer` (validFrom/validUntil, per store) |

**Schema changes needed (small):**

1. `PriceHistory.source`: add `"flyer"` and `"partner"` as allowed values (it's a `String`, so this is convention + validation, not a migration).
2. Optional, later: `PriceHistory.confidence` if crowdsourced data grows enough to need weighting. Skip for now.
3. `Flyer` stores flyer-level metadata; *item-level* flyer prices go into `PriceHistory` as `source: "flyer"` with `isSale: true` and `saleEndDate` = flyer `validUntil`. No new table.

---

## 6. Per-Source Adapter Notes

### 6.1 Dominion (Loblaw / PC Express) — build FIRST

- Loblaw runs every banner (Loblaws, Superstore, Dominion via newfoundlandgrocerystores.ca) on one platform with a JSON product API behind it (the site is a JS app; DevTools → Network shows the product endpoints, which take a store ID + product ID and return price data).
- **Why first:** cleanest platform, one integration pattern reused across the most products, and NL Dominion store IDs are selectable on the site.
- Mapping: each `StoreProduct` stores the Loblaw product code in `storeSku`. Discover codes by searching the site once per product (manual or semi-automated) — this is the one-time mapping cost (§8).
- Verify at build time: exact endpoint shape, required headers/API key visible in the site's own JS, and the St. John's store IDs.

### 6.2 Walmart — build SECOND or THIRD

- walmart.ca grocery serves store-specific pricing once a pickup store is selected (St. John's has Walmart locations; pickup orders are charged the in-store price).
- **Hardest target:** Akamai bot protection. Strategy in order of preference:
  1. Replicate the site's product-data requests with proper session cookies at very low volume.
  2. Parse embedded JSON from product/category pages (`__NEXT_DATA__`-style payloads) rather than HTML elements.
  3. If blocked persistently: fall back to Flipp (Walmart's flyer is on Flipp) + manual entry for regular prices; revisit later.
- Expect this adapter to break most often. `extractionFailed` + `ScrapeRun.errorCount` alerting exists for exactly this.

### 6.3 Sobeys (Voilà) — build SECOND or THIRD

- voila.ca curbside pickup is live at three St. John's Sobeys stores; prices match in-store, no markup (promos may differ slightly).
- Like the others, it's a JS storefront over a JSON API. Select the St. John's store, capture the catalog/product endpoints in DevTools, replicate.
- Note which physical Sobeys each Voilà store maps to — Panion's `Store` rows should match physical stores.

### 6.4 Costco — NO scraper (manual + crowdsource lane)

- costco.ca prices ≠ warehouse prices (shipping baked in, 8–49% higher on groceries). Scraping it would *inject wrong data*.
- Plan: seed Costco staples via the admin bulk-entry tool from an in-person visit (~monthly — warehouse prices are comparatively stable); prioritize user `PriceReport`s for Costco items; consider showing "member price, verified &lt;date&gt;" styling.
- Costco coverage will be thinner. That's acceptable and honest — better than confidently wrong.

### 6.5 Flipp (flyers, all four chains)

- Digital flyers are rendered from structured JSON: each item has name, price, sale story, and validity dates. The flyer viewer's backend endpoints are unauthenticated and well-documented by community projects (search "flipp scraper" on GitHub for current examples).
- Flow: query by postal code (St. John's) → flyer IDs for our four merchants → fetch each flyer's items JSON → fuzzy-match items to our catalog (§8) → write matched items as `PriceHistory` `source: "flyer"`, `isSale: true`, `saleEndDate` = flyer end.
- Unmatched flyer items: **discard** (v1). Matching everything is a rabbit hole; we only need sale prices for products we track.
- Also write a `Flyer` row per fetched flyer so the existing `/api/flyers` route serves real data.
- Weekly cadence, right after flyers flip (Thursday morning NL time).

### 6.6 Admin bulk-entry tool (manual layer)

The unglamorous piece that makes everything resilient. A single admin page (gated by the existing `UserRole`):

- Table view: all `StoreProduct`s for a chosen store, sorted by `lastScrapedAt` ascending (stalest first), showing current price, with a bare input to type a new price. Enter → saves (`source: "manual"`) → focus moves to the next row.
- Target: updating 100 products should take ~15 minutes with a flyer or store website open in another tab.
- Also serves as the review queue for `extractionFailed` items.

### 6.7 Partner stores (direct price feeds)

Independent local stores can contribute their prices directly — the cleanest data lane there is: accurate, consented, no scraping involved. It also gives smaller stores visibility they can't build themselves, next to the big chains. Listing in Panion is free for partner stores.

- **Schema is already prepared:** `Store.portalEnabled` / `portalEnabledAt` and the `StoreAdmin` relation on `User` exist, unused, for exactly this.
- **Source value:** partner-supplied observations use `PriceHistory.source: "partner"`.
- **Keep the ask tiny:** a curated set of 30–60 staples updated weekly (~15 min), or a CSV export from the store's POS — never a full catalog.
- **MVP needs no new code:** until a portal exists, a partner store sends a weekly price list and it's entered through the admin bulk-entry tool (§6.6, `source: "partner"`). A self-serve portal (store admin logs in, bulk-edits their prices) is a fast-follow once a pilot store is active.
- **Catalog note:** independents carry local brands the big chains don't; each partner adds some product-mapping work (§8). Start with one pilot store.

### 6.8 Parked (deliberately)

- **Receipt scanning** — solvable (Claude handles cryptic receipt abbreviations well) but needs a user base to matter. Revisit at meaningful WAU.
- **Big-chain partnerships** — the four major chains benefit from price opacity; revisit with usage numbers as leverage. (Independent stores are the opposite case — see §6.7.) A single store's price feed would be a moat ([`DISCOVERY.md`](DISCOVERY.md) §Defensible).

---

## 7. Freshness, Precedence & Trust

**Precedence for `StoreProduct.currentPrice`** (which observation wins):

1. Newest observation wins, **except**:
2. An unexpired flyer price (`saleEndDate` ≥ today) beats an older regular price → `isSale: true`.
3. When a sale expires, revert to the newest non-sale observation (needs a small daily Inngest job to clear expired `isSale` flags — this is the bug class to be most careful about: **stale sale prices lingering past Wednesday are the fastest way to lose user trust**).
4. Crowdsourced reports only update `currentPrice` after passing the existing `PriceReport` verification flow (status → approved); they always land in `PriceHistory` immediately for history/corroboration purposes.

**Sanity validation in the ingestion writer** (reject + log, don't write):

- Price ≤ 0 or > $500 (groceries).
- Price changed > 5× or < 0.2× vs. previous observation (likely a unit/mapping error, e.g. per-kg vs. per-item).
- Rejected observations increment `ScrapeRun.errorCount` with details in `errorDetails`.

**UI honesty (small but critical):**

- Show staleness on every price: "as of today" / "as of 3 days ago" / "as of 2 weeks ago" (from `lastScrapedAt` or the newest `PriceHistory` row).
- Stale beyond 14 days: visually de-emphasize + label ("price may be outdated").
- Never render a price with no observation date.

---

## 8. Product Mapping (the real one-time cost)

The marginal cost of scraping one more product is ~zero. The real cost is **mapping**: linking each canonical `Product` to its per-store identity (`storeSku` / `scrapeUrl` / `storeProductName`).

- **Process per product per store:** search the store's site once → confirm it's the same product *and same unit size* → record SKU/URL. With decent tooling, ~1–2 min per product-store pair. 80 products × 3 scrapable stores ≈ a weekend.
- **Unit-size guard:** only map when `unitSize`/`unitQuantity` matches, or record the store's size and rely on the existing unit-price normalization for fair comparison. Never silently compare different pack sizes at face price.
- **AI-assist:** Claude can propose matches (canonical name + store search results → best candidate + confidence), with human confirm/reject. Semi-automated, not fully automated — a wrong match is worse than a missing one.
- **Growth strategy:** expand catalog in mapped batches of 25–50 staples (driven by what users search for and watchlist), rather than bulk-importing thousands of unmapped items. Target ~300–500 well-mapped products; that covers the realistic comparison basket for St. John's shoppers.

---

## 9. Scheduling (Inngest)

`inngest` v4 is already a dependency; no functions are wired yet. Jobs:

| Job | Cadence | What it does |
|---|---|---|
| `scrape/dominion`, `scrape/walmart`, `scrape/voila` | Weekly, staggered (e.g. Thu 06:00 / 07:00 / 08:00 NL time, after flyer flip) | Fetch all mapped `StoreProduct`s for the chain → ingest. Creates a `ScrapeRun`; each product is an Inngest **step** (batched ~10–20/step) so retries are granular and serverless timeouts are a non-issue. |
| `scrape/flyers` | Weekly, Thu early AM | Flipp adapter for all four chains → flyer `PriceHistory` rows + `Flyer` rows. |
| `pricing/expire-sales` | Daily | Clear `isSale` where `saleEndDate` < today; re-derive `currentPrice` (§7.3). |
| `pricing/scrape-alert` | Event-driven | If a `ScrapeRun` finishes with `errorCount / totalProducts > 25%` or status `failed`, email admin (SendGrid exists) and set `alertSent`. |

Also the natural place to finally wire the **price-drop alert** job (watchlist targets) — it can subscribe to the same "run finished" event. Out of scope for this doc, but the pipeline unblocks it.

---

## 10. Dev-Environment Caveat

Claude Code cloud sessions for this repo currently **block retail domains at the network-policy level** (requests to walmart.ca, voila.ca, etc. 403 at the sandbox proxy — this is the sandbox, not the stores). For adapter development either:

1. loosen the environment's network policy in Claude Code environment settings, or
2. develop/test adapters locally, or
3. capture sample JSON responses in DevTools by hand and commit them as fixtures (`tests/fixtures/pricing/`) — adapters should be tested against fixtures anyway, so this is good practice regardless.

Production scraping runs via Inngest/Vercel and is unaffected.

---

## 11. Phased Build Plan

> **Status as of 2026-08-19.** Phases 0–4 are built. See `STATUS.md` for live
> numbers and the current next step; this section records how the plan actually
> turned out, including where it was wrong.

### Phase 0 — Foundation — **done**
- [x] Shared ingestion writer (`src/lib/pricing/ingest.ts`) with §7 precedence.
- [x] Staleness display in the price-comparison UI.
- [x] `expireFinishedSales()` + Inngest wiring.

### Phase 1 — Manual layer — **done, and more important than expected**
- [x] `/api/admin/observations` + `/admin/import`, gated by `UserRole`.
- [x] Browser capture bookmarklet feeding the same endpoint.
- Manual entry was planned as a stopgap before scrapers. It is now the **only
  path for Walmart**, and the only source with no legal asterisk at all.

### Phase 2 — Dominion (PC Express) — **done**
- [x] Endpoints and St. John's store id verified; fixtures committed.
- [x] `pcexpress.ts` adapter, `ScrapeRun` logging, barcode + image backfill.
- Prices proved to be set at **banner** level in NL (0924 / 0935 / 0906 returned
  identical values), which settled §12.1 in favour of chain-level granularity.
- The catalogue is now *built from* this source rather than hand-seeded. All 250
  products carry real UPCs; the original 80 seeded products were fabricated,
  including every barcode, and were deleted.

### Phase 3 — Voilà, then Walmart — **half done, and the plan was wrong**
- [x] `voila.ts` adapter. Sobeys: 0 → 49 prices.
- [ ] ~~Walmart adapter~~ — **not possible as designed.** Walmart's
  `robots.txt` *permits* crawling product pages, but PerimeterX serves a
  captcha to any automated request. Defeating it is out of scope on principle
  (`DATA-SOURCING.md` §1.1), so Walmart goes through the Phase 1 capture tool.
- Two assumptions here were wrong. Voilà was expected to be "friendlier" — it
  is reachable, but it publishes **no barcode of any kind**, so it matches on
  name and size only and is far lossier than Dominion. And it scopes prices to
  the **session**, so a stale cookie silently returns another province's prices.

### Phase 4 — Flyers (Flipp) — **done, and it is an overlay, not a foundation**
- [x] Flipp adapter; sale prices flow through ingestion with `source: "flyer"`.
- Measured ceiling: a full 160-term run matched **9 of 250** products, none of
  them Sobeys. It is sale-only by construction, it *biases* a store cheap rather
  than merely leaving gaps, and it decays weekly as sales expire. Useful for
  breadth; it can never be a store's sole source.

### Phase 5 — Scale & verify — **in progress**
- [x] Catalogue at 250 products with real barcodes, images and equivalence groups.
- [x] Cross-brand comparison shipped (equivalence groups + unit price).
- [ ] Sobeys coverage 27% → higher (name-matching against Loblaw phrasing).
- [ ] Replace hotlinked retailer imagery — Open Food Facts + own photography.
- [ ] Production deploy; prod is still on the old schema and old seed data.
- ~~Costco~~ removed entirely: it sells wholesale, so its prices aren't
  comparable to a normal grocery basket.

## 12. Open Questions — mostly answered

1. **Store granularity — settled: chain level.** Loblaw returned identical
   prices for NL store ids 0924 / 0935 / 0906, so one representative store per
   banner is sufficient. Revisit only if users report divergence.
2. **History retention — still open.** `PriceHistory` is append-only and small
   at this scale. Decide later whether rejected crowdsourced rows are ever
   pruned (`scrapedAt` is indexed for it).
3. **Walmart fallback threshold — moot.** There is no automated Walmart cycle
   to fail: PerimeterX blocks it outright and bypassing that is out of scope.
   Walmart is Flipp (flyer only) plus the browser capture tool.
4. **Proxy / IP strategy — settled: none, permanently.** A residential proxy
   exists to evade detection, which is the line this project does not cross
   (`DATA-SOURCING.md` §1.1). If a source blocks us, that source is done.
5. **New — barcode-less sources.** Neither Voilà nor Walmart publishes a UPC,
   so both depend entirely on name-and-size matching. Every gate in `match.ts`
   therefore carries more weight than originally assumed; see `CLAUDE.md`
   rule 8 before touching any of them.

---

*Related docs: [`STATUS.md`](STATUS.md) (current state, next step) · [`CLAUDE.md`](CLAUDE.md) (rules & past incidents) · [`DISCOVERY.md`](DISCOVERY.md) (product context, risk framing) · [`CODEBASE.md`](CODEBASE.md) (file-by-file) · [`TESTING.md`](TESTING.md) (test strategy — adapter fixtures should join it).*
