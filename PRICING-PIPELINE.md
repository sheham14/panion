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

1. `PriceHistory.source`: add `"flyer"` as an allowed value (it's a `String`, so this is convention + validation, not a migration).
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

### 6.7 Parked (deliberately)

- **Receipt scanning** — solvable (Claude handles cryptic receipt abbreviations well) but needs a user base to matter. Revisit at meaningful WAU.
- **Store partnerships** — revisit with usage numbers as leverage. A single store's price feed would be a moat ([`DISCOVERY.md`](DISCOVERY.md) §Defensible).

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

Each phase is independently shippable and leaves the app better even if the next phase never happens.

### Phase 0 — Foundation (small, do first)
- [ ] Shared ingestion writer (`src/lib/pricing/ingest.ts`): validate → `PriceHistory` → `StoreProduct` update, precedence rules from §7.
- [ ] Staleness display in the price-comparison UI ("as of N days ago").
- [ ] `pricing/expire-sales` daily job + Inngest wiring (`src/inngest/client.ts`, serve route).
- **Done when:** a price written through the ingestion module shows up in the UI with its freshness label, and expired sales revert automatically.

### Phase 1 — Manual layer
- [ ] Admin bulk-entry page (stalest-first table, §6.6), gated by `UserRole`.
- [ ] Weekly manual refresh becomes routine (~30 min) → **the app has fresh data from this point on**, before any scraper exists.
- **Done when:** all seeded products can be re-priced for one store in ≤ 15 minutes.

### Phase 2 — First scraper: Dominion
- [ ] Verify PC Express endpoints + St. John's store IDs in DevTools; commit sample responses as fixtures.
- [ ] Map all products (`storeSku`) for Dominion.
- [ ] `dominion.ts` adapter + weekly Inngest job + `ScrapeRun` logging + failure alert email.
- **Done when:** two consecutive weekly runs complete with < 10% errors and zero manual touch-ups needed for Dominion.

### Phase 3 — Voilà, then Walmart
- [ ] Same pattern. Voilà first (friendlier), Walmart last (bot protection; budget extra time, expect breakage).
- **Done when:** 3 of 4 chains refresh automatically weekly; manual layer only covers Costco + breakage gaps.

### Phase 4 — Flyers (Flipp)
- [ ] Flipp adapter: postal-code → flyers → items JSON; fuzzy match to catalog (AI-assisted, discard unmatched).
- [ ] Sale prices flow through ingestion with `source: "flyer"`; `/api/flyers` serves real `Flyer` rows.
- **Done when:** Thursday's sales appear in Panion by Thursday noon and disappear on expiry.

### Phase 5 — Scale & verify
- [ ] Grow catalog in mapped batches toward 300–500 products (§8), driven by user searches/watchlists.
- [ ] Costco routine: monthly bulk-entry pass + prioritize user reports.
- [ ] Revisit parked items: receipt scanning (needs users), store partnerships (needs traction).

---

## 12. Open Questions (decide before/while building)

1. **Store granularity:** one price per *chain* (e.g. all St. John's Dominions share a price) or per *physical store*? Chain-level is simpler and usually accurate within a city — recommend starting chain-level with one representative store per chain, revisit if users report divergence.
2. **History retention:** `PriceHistory` grows ~500 products × 4 stores × weekly ≈ 100k rows/year — fine indefinitely, but decide if crowdsourced-rejected rows ever get pruned (`scrapedAt` index exists for cleanup).
3. **Walmart fallback threshold:** how many consecutive failed cycles before we stop trying for a while and lean on Flipp + manual? (Suggest: 3.)
4. **Proxy/IP strategy:** start with none (Vercel egress IPs at our volume are probably fine). Only add a residential proxy if consistently blocked — adds cost and complexity.

---

*Related docs: [`DISCOVERY.md`](DISCOVERY.md) (product context, risk framing) · [`CODEBASE.md`](CODEBASE.md) (file-by-file) · [`TESTING.md`](TESTING.md) (test strategy — adapter fixtures should join it).*
