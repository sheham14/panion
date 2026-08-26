# Panion — current state and next steps

**Last updated: 2026-08-26.** Read this first, then `CLAUDE.md` for the rules.

**Production now runs the real catalogue.** On 2026-08-26 the pending migration
was applied, the 260-product catalogue was restored to Neon, and the 80
fabricated seed products were deleted. Local and production hold the same
catalogue. Reaching production requires the explicit
`--config prisma.production.config.ts`; the default config still resolves local.

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
comparable at 2+ stores  :  56

Dominion - Stavanger Dr    250  (100% of catalogue)
Sobeys - Mount Pearl        49  ( 27% of addressable)
Walmart Supercentre         12  (  7% of addressable)
No Frills                    3
```

Walmart went 2 → 12 from the first browser capture, and no suspicious
spreads were reported afterwards. **Production holds the same 260 products and
324 store-products**, with Colemans and Costco present but unpriced.

Coverage by category — `needs capture` is the non-Loblaw products priced at
only one store, i.e. the actual work queue:

```
category            total   2+ stores   loblaw-only   needs capture
personal_care          30           4             0              26
bakery_bread           38           4            10              24
meat_seafood           25           2             8              15
pantry_dry_goods       34          13             8              13
frozen                 17           1             7               9
dairy                  22          10             3               9
snacks_candy           25           6            12               7
produce                19           5             8               6
```

**Personal care is the highest-value capture target**: 30 products, none
Loblaw-exclusive, so every one is capturable at Walmart.

Run `npm run coverage` to refresh those numbers and to list any suspicious
cross-store spreads (the bad-match detector).

### Verification state

**127 tests passing, 0 lint errors, `tsc` clean.**
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

**Run capture sessions across categories to build coverage**, and expand the
catalogue where captures keep failing to resolve.

Capture works and needs no further engineering to use:

1. Sign in at `localhost:3000` **with Google, as yourself** — there is no
   password login, and `admin@sentinel.ca` is a seeded row nobody can
   authenticate as. Signing in creates your `User` row.
2. `npm run role -- grant <your-email> moderator`
3. Go to `/admin/import`, drag **Capture → Panion** to the bookmarks bar.
   **Re-drag it after any change to `bookmarklet.ts`** — the old bookmark keeps
   the old code.
4. Search a category on walmart.ca or voila.ca, click the bookmarklet, return
   and paste.

The preview writes nothing until confirmed. Rows whose price moves ≥1.8× against
the price already held are flagged and **start unticked** — a nuggets-class
mismatch has to be opted into.

**A capture that resolves few rows is usually correct, not broken.** The first
Walmart run resolved 10 of 41: the rest were oat/soy/coconut milk and lactose-free
variants that **have no catalogue entry at all**, plus near-misses the matcher
rightly refused (catalogue has Silk Almond *Original*; the capture had Silk Almond
*Vanilla* and Silk *Soy*). Import never invents products — a name-only capture is
too thin to found a catalogue row on. To make a category comparable, add it to the
catalogue from PC Express first, then re-capture elsewhere.

If a capture ever finds nothing, it copies a **diagnostic** instead. Paste that
into the session: the array survey and the price-leaf ancestor chains are enough
to fix the extractor directly, and that is how Voilà was onboarded.

---

## 5. What is left, in rough priority order

1. **Capture coverage, category by category.** Both sites work; this is now
   operator time rather than engineering. Walmart is the bigger prize (12 of
   179 addressable).
2. **Sobeys coverage: 27% → higher.** The gap is name-matching against Loblaw's
   phrasing (`2% Milk` vs `2% Milk Partly Skim`). Tune with a fixture per
   change; never loosen a gate without one. See `CLAUDE.md` rule 7. Voilà
   captures carry clean sizes, which helps.
3. **Images.** Still hotlinked from retailer CDNs through the proxy, which is
   the sharpest legal exposure in the product. Plan: **Open Food Facts**
   (barcode-keyed, openly licensed — every product already has a real UPC) for
   national brands, own photography for private label. Also clears the six
   deferred `next/image` warnings.
4. **Production follow-up.** The catalogue is live; what remains is keeping it
   fed. The Inngest crons write to whatever `DATABASE_URL` the deployment has,
   so confirm Vercel carries `PC_EXPRESS_API_KEY` and that `SCRAPERS_ENABLED`
   is a working kill switch there before relying on scheduled refreshes.
   Prod currently has no `price_history` at all — it was deleted with the
   fabricated products — so sparkline/history UI has nothing to draw until a
   few cycles have run.
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
