import { prisma } from "@/lib/prisma";
import {
  isPriceSource,
  MAX_PRICE,
  MAX_PRICE_MULTIPLIER,
  MIN_PRICE,
  MIN_PRICE_MULTIPLIER,
  type IngestResult,
  type PriceObservation,
  type RejectedObservation,
} from "@/lib/pricing/types";

/**
 * The single writer for every price that enters the system.
 *
 * Every source — scrapers, flyers, the admin bulk-entry tool, verified user
 * reports, partner feeds — goes through here, so validation and precedence are
 * defined once rather than re-implemented per adapter (PRICING-PIPELINE.md §4).
 *
 * Two invariants:
 *
 *  - `PriceHistory` is append-only truth. Never edited, never deleted here. If
 *    a source turns out to be bad we can replay from it.
 *  - `StoreProduct.currentPrice` is a derived cache, re-derived from the
 *    precedence rules in §7 on every write.
 */

/** Round to cents, avoiding float drift on the Decimal boundary. */
const cents = (n: number) => Math.round(n * 100) / 100;

type ValidationContext = {
  storeProductId: string;
  previousPrice: number | null;
};

function validate(
  obs: PriceObservation,
  ctx: ValidationContext | null,
): RejectedObservation | null {
  if (!isPriceSource(obs.source)) {
    return {
      observation: obs,
      reason: "invalid_source",
      detail: `unknown source "${obs.source}"`,
    };
  }

  if (!Number.isFinite(obs.price)) {
    return {
      observation: obs,
      reason: "invalid_price",
      detail: `price is not a finite number: ${obs.price}`,
    };
  }

  if (!ctx) {
    return {
      observation: obs,
      reason: "unknown_store_product",
      detail: `no StoreProduct for store=${obs.storeId} product=${obs.productId}`,
    };
  }

  if (obs.price < MIN_PRICE || obs.price > MAX_PRICE) {
    return {
      observation: obs,
      reason: "price_out_of_bounds",
      detail: `${obs.price} outside [${MIN_PRICE}, ${MAX_PRICE}]`,
    };
  }

  // A 10x jump usually means a unit mismatch (per-kg read as per-item), not a
  // real price change. Reject rather than corrupt the history.
  if (ctx.previousPrice !== null && ctx.previousPrice > 0) {
    const ratio = obs.price / ctx.previousPrice;
    if (ratio > MAX_PRICE_MULTIPLIER || ratio < MIN_PRICE_MULTIPLIER) {
      return {
        observation: obs,
        reason: "implausible_swing",
        detail: `${ctx.previousPrice} -> ${obs.price} (${ratio.toFixed(2)}x)`,
      };
    }
  }

  return null;
}

/**
 * Decide whether an incoming observation should become the displayed price.
 *
 * §7: newest wins, except an unexpired sale beats an older regular price.
 */
function shouldReplaceCurrent(
  incoming: PriceObservation,
  current: {
    currentPrice: number | null;
    isSale: boolean;
    saleEndDate: Date | null;
    lastScrapedAt: Date | null;
  },
  now: Date,
): boolean {
  if (current.currentPrice === null) return true;

  const currentSaleLive =
    current.isSale &&
    current.saleEndDate !== null &&
    current.saleEndDate.getTime() >= now.getTime();

  // A live sale is not displaced by a newer *regular* price — the shopper can
  // still get the sale price today.
  if (currentSaleLive && !incoming.isSale) return false;

  // Otherwise newest wins.
  if (current.lastScrapedAt === null) return true;
  return incoming.observedAt.getTime() >= current.lastScrapedAt.getTime();
}

/**
 * Validate and persist a batch of observations.
 *
 * Returns counts plus every rejection with its reason, which the caller folds
 * into `ScrapeRun.errorDetails`.
 */
export async function ingestObservations(
  observations: PriceObservation[],
  opts: { now?: Date } = {},
): Promise<IngestResult> {
  const now = opts.now ?? new Date();
  const rejected: RejectedObservation[] = [];
  let accepted = 0;
  let updated = 0;

  if (observations.length === 0) return { accepted, rejected, updated };

  // Resolve every (storeId, productId) pair up front — one query rather than
  // one per observation.
  const storeProducts = await prisma.storeProduct.findMany({
    where: {
      OR: observations.map((o) => ({
        storeId: o.storeId,
        productId: o.productId,
      })),
    },
    select: {
      id: true,
      storeId: true,
      productId: true,
      currentPrice: true,
      isSale: true,
      saleEndDate: true,
      lastScrapedAt: true,
    },
  });

  const key = (storeId: string, productId: string) => `${storeId}::${productId}`;
  const byKey = new Map(
    storeProducts.map((sp) => [key(sp.storeId, sp.productId), sp]),
  );

  for (const obs of observations) {
    const sp = byKey.get(key(obs.storeId, obs.productId)) ?? null;

    const rejection = validate(
      obs,
      sp
        ? {
            storeProductId: sp.id,
            previousPrice: sp.currentPrice ? Number(sp.currentPrice) : null,
          }
        : null,
    );
    if (rejection) {
      rejected.push(rejection);
      continue;
    }
    if (!sp) continue; // unreachable — validate() rejects a null ctx

    const price = cents(obs.price);
    const regularPrice =
      obs.regularPrice != null ? cents(obs.regularPrice) : null;

    const replaceCurrent = shouldReplaceCurrent(
      obs,
      {
        currentPrice: sp.currentPrice ? Number(sp.currentPrice) : null,
        isSale: sp.isSale,
        saleEndDate: sp.saleEndDate,
        lastScrapedAt: sp.lastScrapedAt,
      },
      now,
    );

    // History is always appended, even when the observation doesn't win the
    // display slot — it's still evidence, and corroboration depends on it.
    await prisma.$transaction([
      prisma.priceHistory.create({
        data: {
          storeProductId: sp.id,
          price,
          isSale: obs.isSale ?? false,
          source: obs.source,
          submittedBy: obs.submittedBy ?? null,
          scrapedAt: obs.observedAt,
        },
      }),
      prisma.storeProduct.update({
        where: { id: sp.id },
        data: {
          lastScrapedAt: obs.observedAt,
          extractionFailed: false,
          ...(obs.storeSku ? { storeSku: obs.storeSku } : {}),
          ...(obs.storeProductName
            ? { storeProductName: obs.storeProductName }
            : {}),
          ...(replaceCurrent
            ? {
                currentPrice: price,
                isSale: obs.isSale ?? false,
                regularPrice,
                saleEndDate: obs.saleEndDate ?? null,
              }
            : {}),
        },
      }),
    ]);

    accepted += 1;
    if (replaceCurrent) updated += 1;
  }

  return { accepted, rejected, updated };
}

/**
 * Clear sales whose end date has passed and revert to the newest non-sale
 * price in history.
 *
 * §7.3 flags this as the bug class to be most careful about: a sale price still
 * showing on Thursday after it ended on Wednesday is the fastest way to lose
 * user trust.
 */
export async function expireFinishedSales(
  opts: { now?: Date } = {},
): Promise<{ expired: number; reverted: number }> {
  const now = opts.now ?? new Date();

  const stale = await prisma.storeProduct.findMany({
    where: { isSale: true, saleEndDate: { not: null, lt: now } },
    select: { id: true, regularPrice: true },
  });

  let reverted = 0;

  for (const sp of stale) {
    // Prefer the stored pre-sale price; fall back to the newest non-sale
    // observation in history.
    let revertTo = sp.regularPrice ? Number(sp.regularPrice) : null;

    if (revertTo === null) {
      const lastRegular = await prisma.priceHistory.findFirst({
        where: { storeProductId: sp.id, isSale: false },
        orderBy: { scrapedAt: "desc" },
        select: { price: true },
      });
      revertTo = lastRegular ? Number(lastRegular.price) : null;
    }

    await prisma.storeProduct.update({
      where: { id: sp.id },
      data: {
        isSale: false,
        saleEndDate: null,
        regularPrice: null,
        // If we have nothing to revert to, leave the price but drop the sale
        // badge — showing a stale "sale" is worse than showing a stale price.
        ...(revertTo !== null ? { currentPrice: revertTo } : {}),
      },
    });

    if (revertTo !== null) reverted += 1;
  }

  return { expired: stale.length, reverted };
}
