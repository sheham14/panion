import { prisma } from "@/lib/prisma";
import {
  matchProductByBarcodeOrName,
  parseSize,
  type CanonicalProduct,
} from "@/lib/pricing/match";
import { ingestObservations } from "@/lib/pricing/ingest";
import type { PriceObservation } from "@/lib/pricing/types";
import { verifyMatches, type Verdict } from "@/lib/capture/verify-matches";
import { classifyGroups } from "@/lib/pricing/classify-groups";

/**
 * Shared core for manual price entry.
 *
 * Both the programmatic endpoint (`/api/admin/observations`) and the paste-and-
 * review import (`/api/capture/import`) resolve, preview and write through
 * this, so the two can never drift on matching rules or on what "suspicious"
 * means.
 */

export type IngestItemInput = {
  barcode?: string | null;
  /** Already includes brand and size — see `matchNameFor()`. */
  name?: string | null;
  price: number;
  isSale?: boolean;
  regularPrice?: number | null;
  saleEndDate?: Date | null;
  storeSku?: string | null;
  /**
   * The pieces a catalogue entry needs, kept separate from the match string.
   * Only read when a row matches nothing and creation is enabled.
   */
  create?: {
    displayName: string;
    brand: string | null;
    size: string | null;
    imageUrl: string | null;
  };
};

export type PreviewRow = {
  index: number;
  productId: string;
  matchedName: string | null;
  matchedSize: string | null;
  capturedName: string | null;
  price: number;
  existingPrice: number | null;
  via: string;
  suspicious: boolean;
  /**
   * Second opinion on whether the two names describe the same product. The
   * matcher decides on tokens and sizes; this reads the pair the way a person
   * would. Absent when verification was not run.
   */
  verdict?: Verdict;
  verdictReason?: string;
};

/** A product the capture would add to the catalogue, with its assigned group. */
export type CreationRow = {
  index: number;
  name: string;
  brand: string | null;
  size: string | null;
  /** Equivalence group — what cross-brand comparison joins on. */
  group: string | null;
  /** Inherited from products already in that group, so siblings agree. */
  category: string | null;
  price: number;
  imageUrl: string | null;
};

export type UnresolvedRow = {
  index: number;
  barcode: string | null;
  name: string | null;
  /**
   * `duplicate_product` means this row matched a product another row in the
   * same submission already claimed. It is reported rather than dropped: when
   * several *distinct* captured items collapse onto one catalogue product,
   * that is usually a matcher fault, and staying silent hides the evidence.
   * A Voilà bread capture collapsed four different Dempster's loaves onto one
   * catalogue row, and the preview showed 1 of 12 with no account of the rest.
   */
  reason: "no_match" | "duplicate_product";
  /** For `duplicate_product`: what the row it lost to matched to. */
  collidedWith?: string | null;
};

export type IngestItemsResult = {
  submitted: number;
  resolved: number;
  preview: PreviewRow[];
  unresolved: UnresolvedRow[];
  /** Proposed on a dry run; written on a real one. */
  creations: CreationRow[];
  created: number;
  accepted: number;
  updated: number;
  rejected: { productId: string; reason: string; detail: string }[];
};

/**
 * A price this far from the one already held is probably a bad name match.
 *
 * Flagged, never blocked — the same shape is also what a genuine sale looks
 * like, so the call belongs to a human. This threshold is what surfaced a
 * $5.97 bag of chicken nuggets matched to a $16.00 pack of chicken breasts.
 */
export const SUSPICIOUS_RATIO = 1.8;

export async function resolveAndIngest(opts: {
  storeId: string;
  items: IngestItemInput[];
  submittedBy: string;
  observedAt: Date;
  now: Date;
  dryRun: boolean;
  /** Indexes the reviewer unticked; never written. */
  skipIndexes?: number[];
  /**
   * Read every proposed match back with a model before accepting it. Off by
   * default so the programmatic endpoint keeps its old behaviour.
   */
  verify?: boolean;
  /**
   * Add products the catalogue does not have, rather than discarding them.
   *
   * Without this a capture can only ever price products the catalogue already
   * holds, which quietly caps coverage at one chain's assortment: a Walmart
   * egg capture matched 0 of 13 because Walmart sells Newfoundland Eggs and
   * GoldEgg while the catalogue, harvested from Dominion, holds No Name and
   * Rowe Farms. No amount of capturing closes that — the products have to be
   * allowed in.
   */
  createUnmatched?: boolean;
}): Promise<IngestItemsResult> {
  const { storeId, items, submittedBy, observedAt, now, dryRun } = opts;
  const skip = new Set(opts.skipIndexes ?? []);

  const catalogue: CanonicalProduct[] = (
    await prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        brand: true,
        unitSize: true,
        unitQuantity: true,
        unitMeasure: true,
        barcode: true,
      },
    })
  ).map((p) => ({
    ...p,
    unitQuantity: p.unitQuantity === null ? null : Number(p.unitQuantity),
  }));

  // The row index travels with each observation so a verdict arriving later
  // can withdraw it; stripped again before the writer sees them.
  const observations: (PriceObservation & { index: number })[] = [];
  const unresolved: UnresolvedRow[] = [];
  const resolved: { index: number; productId: string; via: string }[] = [];

  // One product may only be observed once per submission — a duplicate would
  // append two history rows for a single sighting.
  const seenProductIds = new Set<string>();

  for (const [index, item] of items.entries()) {
    const match = matchProductByBarcodeOrName(
      { barcode: item.barcode, name: item.name ?? "" },
      catalogue,
    );

    if (!match) {
      unresolved.push({
        index,
        barcode: item.barcode ?? null,
        name: item.name ?? null,
        reason: "no_match",
      });
      continue;
    }
    if (seenProductIds.has(match.productId)) {
      unresolved.push({
        index,
        barcode: item.barcode ?? null,
        name: item.name ?? null,
        reason: "duplicate_product",
        collidedWith: match.productId,
      });
      continue;
    }
    seenProductIds.add(match.productId);

    resolved.push({ index, productId: match.productId, via: match.reason });

    if (skip.has(index)) continue;

    observations.push({
      index,
      storeId,
      productId: match.productId,
      price: item.price,
      isSale: item.isSale ?? false,
      regularPrice: item.regularPrice ?? null,
      saleEndDate: item.saleEndDate ?? null,
      source: "manual",
      observedAt,
      submittedBy,
      storeProductName: item.name ?? null,
      storeSku: item.storeSku ?? null,
    });
  }

  // Enrich with what each item matched *to* and what it already costs here.
  // "48 matched" is not reviewable; "nuggets → Chicken Breasts, $5.97 vs
  // $16.00" is.
  const matched = await prisma.product.findMany({
    where: { id: { in: resolved.map((r) => r.productId) } },
    select: {
      id: true,
      name: true,
      brand: true,
      unitSize: true,
      storeProducts: { where: { storeId }, select: { currentPrice: true } },
    },
  });
  const byId = new Map(matched.map((p) => [p.id, p]));

  // A collision names a product some earlier row resolved to, so it is always
  // present in `byId`. Swap the id for something a reviewer can read.
  for (const u of unresolved) {
    if (u.reason !== "duplicate_product" || !u.collidedWith) continue;
    const p = byId.get(u.collidedWith);
    u.collidedWith = p ? [p.brand, p.name].filter(Boolean).join(" ") : null;
  }

  // Second opinion on every proposed match, read the way a person would rather
  // than by token overlap. Only ever narrows: `different` is dropped, `unsure`
  // is surfaced, and a pair the matcher never proposed is never considered.
  const verdicts = opts.verify
    ? await verifyMatches(
        resolved.map((r) => {
          const p = byId.get(r.productId);
          return {
            index: r.index,
            capturedName: items[r.index].name ?? "",
            catalogueName: p ? [p.brand, p.name].filter(Boolean).join(" ") : "",
            catalogueSize: p?.unitSize ?? null,
          };
        }),
      )
    : new Map<number, { verdict: Verdict; reason: string }>();

  const preview: PreviewRow[] = resolved.map((r) => {
    const p = byId.get(r.productId);
    const existing = p?.storeProducts[0]?.currentPrice;
    const existingPrice = existing == null ? null : Number(existing);
    const price = items[r.index].price;
    const v = verdicts.get(r.index);
    return {
      index: r.index,
      productId: r.productId,
      matchedName: p ? [p.brand, p.name].filter(Boolean).join(" ") : null,
      matchedSize: p?.unitSize ?? null,
      capturedName: items[r.index].name ?? null,
      price,
      existingPrice,
      via: r.via,
      ...(v ? { verdict: v.verdict, verdictReason: v.reason } : {}),
      suspicious:
        // A rejected or questioned match is suspicious regardless of price —
        // the nuggets and the Dempster's loaves were all priced plausibly.
        (v !== undefined && v.verdict !== "same") ||
        (existingPrice !== null &&
          (price / existingPrice >= SUSPICIOUS_RATIO ||
            existingPrice / price >= SUSPICIOUS_RATIO)),
    };
  });

  // A match the verifier rejected is dropped here, not merely flagged. The
  // reviewer's ticks are advisory; this is the floor beneath them.
  const rejectedByVerifier = new Set(
    [...verdicts.entries()]
      .filter(([, v]) => v.verdict === "different")
      .map(([index]) => index),
  );
  const writable = observations.filter((o) => !rejectedByVerifier.has(o.index));

  // ── Products the catalogue does not have ─────────────────────────────────
  //
  // Three ways a row gets here, and they are one idea: **this is not that
  // product, so it is a product of its own.**
  //
  //   1. Nothing matched it at all.
  //   2. The verifier rejected the match outright.
  //   3. The reviewer unticked it — which is what they do when the matcher
  //      proposed a different brand of the same thing.
  //
  // Rejecting a match used to discard the row, so unticking "Compliments eggs
  // → Newfoundland eggs" lost the Compliments eggs entirely. That is backwards:
  // a rejected match is the strongest evidence the catalogue lacks the product.
  //
  // Grouped by the same classifier that assigned every existing group, so the
  // new Compliments carton lands in `large-eggs` beside the Newfoundland one —
  // which is what makes them comparable as alternatives. Cross-brand comparison
  // comes from the group, never from matching two brands to each other.
  const notThisProduct = new Set<number>([
    ...unresolved.filter((u) => u.reason === "no_match").map((u) => u.index),
    ...[...verdicts.entries()]
      .filter(([, v]) => v.verdict === "different")
      .map(([index]) => index),
    // Only meaningful on the real run; `skip` is empty during a dry run.
    ...resolved.filter((r) => skip.has(r.index)).map((r) => r.index),
  ]);

  const creatable = opts.createUnmatched
    ? [...notThisProduct]
        .filter((index) => items[index]?.create)
        .sort((a, b) => a - b)
        .map((index) => ({ index, spec: items[index].create! }))
    : [];

  // Offer the groups the catalogue already uses, so an incoming Walmart egg
  // joins `large-eggs` beside the Dominion one rather than founding
  // `large-white-eggs` next to it and splitting the comparison in two.
  const knownGroups = creatable.length
    ? (
        await prisma.product.findMany({
          where: { isActive: true, subcategory: { not: null } },
          select: { subcategory: true },
          distinct: ["subcategory"],
          orderBy: { subcategory: "asc" },
        })
      )
        .map((r) => r.subcategory)
        .filter((s): s is string => Boolean(s))
    : [];

  const groupById = creatable.length
    ? await classifyGroups(
        creatable.map((c) => ({
          id: String(c.index),
          name: c.spec.displayName,
          brand: c.spec.brand,
          packageSize: c.spec.size,
        })),
        { knownGroups },
      )
    : new Map<string, string>();

  // Inherit the category from products already in the group, so siblings agree
  // without a second model call. A brand-new group simply has none yet.
  const groupNames = [...new Set([...groupById.values()])];
  const categoryByGroup = new Map<string, string>();
  if (groupNames.length) {
    for (const row of await prisma.product.findMany({
      where: { subcategory: { in: groupNames }, category: { not: null } },
      select: { subcategory: true, category: true },
      distinct: ["subcategory"],
    })) {
      if (row.subcategory && row.category) {
        categoryByGroup.set(row.subcategory, row.category);
      }
    }
  }

  // No filter on `skip` here: an unticked row is precisely one the reviewer
  // said was a different product, so it belongs in this list rather than being
  // excluded from it. Such rows never became observations either, so nothing
  // is both priced and created.
  const creations: CreationRow[] = creatable
    .map((c) => {
      const group = groupById.get(String(c.index)) ?? null;
      return {
        index: c.index,
        name: c.spec.displayName,
        brand: c.spec.brand,
        size: c.spec.size,
        group,
        category: group ? (categoryByGroup.get(group) ?? null) : null,
        price: items[c.index].price,
        imageUrl: c.spec.imageUrl,
      };
    });

  if (dryRun) {
    return {
      submitted: items.length,
      resolved: resolved.length,
      preview,
      unresolved,
      creations,
      created: 0,
      accepted: 0,
      updated: 0,
      rejected: [],
    };
  }

  // Create the new catalogue entries, then price them alongside the matches.
  let created = 0;
  for (const c of creations) {
    const parsed = parseSize(c.size ?? c.name);
    const product = await prisma.product.create({
      data: {
        name: c.name,
        brand: c.brand,
        // Captures carry no barcode, so identity here is the name and group.
        category: c.category as never,
        subcategory: c.group,
        unitSize: c.size,
        unitQuantity: parsed ? parsed.qty : null,
        unitMeasure: parsed ? parsed.unit : null,
        imageUrl: c.imageUrl,
        isActive: true,
      },
      select: { id: true },
    });
    created += 1;

    const item = items[c.index];
    writable.push({
      index: c.index,
      storeId,
      productId: product.id,
      price: item.price,
      isSale: item.isSale ?? false,
      regularPrice: item.regularPrice ?? null,
      saleEndDate: item.saleEndDate ?? null,
      source: "manual",
      observedAt,
      submittedBy,
      storeProductName: item.name ?? null,
      storeSku: item.storeSku ?? null,
    });
  }

  // `ingestObservations()` rejects an observation whose StoreProduct row is
  // missing — and for a store being seeded for the first time, none exist.
  await Promise.all(
    writable.map((o) =>
      prisma.storeProduct.upsert({
        where: { storeId_productId: { storeId, productId: o.productId } },
        create: { storeId, productId: o.productId, isActive: true },
        update: { isActive: true },
      }),
    ),
  );

  const result = await ingestObservations(
    writable.map(({ index, ...o }) => {
      void index;
      return o;
    }),
    { now },
  );

  return {
    submitted: items.length,
    resolved: resolved.length,
    preview,
    unresolved,
    creations,
    created,
    accepted: result.accepted,
    updated: result.updated,
    rejected: result.rejected.map((r) => ({
      productId: r.observation.productId,
      reason: r.reason,
      detail: r.detail,
    })),
  };
}
