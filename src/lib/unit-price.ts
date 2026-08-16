/**
 * Unit pricing — what makes cross-brand comparison honest.
 *
 * Comparing a 284 ml can at $2.79 against a 796 ml can at $3.59 on sticker
 * price alone says the small one is cheaper. Per 100 ml it's $0.98 vs $0.45 —
 * the opposite conclusion. Since equivalence groups deliberately ignore size
 * (a group is "condensed tomato soup", not "condensed tomato soup 284ml"),
 * every group comparison has to be made on unit price or it misleads.
 *
 * Distinct from `unit-convert.ts`, which answers "what does N kg of this cost"
 * for list building. This answers "which of these is better value".
 */

export type UnitBasis = "g" | "ml" | "unit";

export type UnitPrice = {
  /** Price per 100g / 100ml / single unit. */
  value: number;
  basis: UnitBasis;
  /** Ready to render, e.g. "$0.45 / 100ml". */
  label: string;
};

/** How many of the base unit one of this measure is worth. */
const TO_BASE: Record<string, { factor: number; basis: UnitBasis }> = {
  g: { factor: 1, basis: "g" },
  kg: { factor: 1000, basis: "g" },
  mg: { factor: 0.001, basis: "g" },
  lb: { factor: 453.592, basis: "g" },
  oz: { factor: 28.3495, basis: "g" },
  ml: { factor: 1, basis: "ml" },
  l: { factor: 1000, basis: "ml" },
  cl: { factor: 10, basis: "ml" },
  unit: { factor: 1, basis: "unit" },
  ea: { factor: 1, basis: "unit" },
  pk: { factor: 1, basis: "unit" },
  pack: { factor: 1, basis: "unit" },
  count: { factor: 1, basis: "unit" },
  ct: { factor: 1, basis: "unit" },
};

/** Per-100 for weight/volume; per-single for counts. */
const DISPLAY_QUANTITY: Record<UnitBasis, number> = { g: 100, ml: 100, unit: 1 };

/**
 * Parse a free-text size into a base quantity.
 *
 * Handles multipacks — "12x355 ml" is 4260 ml, and treating it as 355 would
 * make a case of pop look extraordinarily cheap.
 */
export function parseQuantity(
  raw: string | null | undefined,
): { qty: number; basis: UnitBasis } | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/,/g, "").trim();

  // "per kg" / "per lb" / "/100g": the price already covers exactly one of the
  // stated measure, so the quantity is that measure's base value. Common on
  // meat and deli counters, where there is no fixed package size.
  const per = s.match(/^\/?\s*per\s+(\d+(?:\.\d+)?)?\s*([a-z]+)$|^\/\s*(\d+(?:\.\d+)?)?\s*([a-z]+)$/);
  if (per) {
    const amount = parseFloat(per[1] ?? per[3] ?? "1");
    const measure = per[2] ?? per[4];
    const unit = TO_BASE[measure];
    if (unit) return { qty: amount * unit.factor, basis: unit.basis };
  }

  // Multipack: "12x355 ml", "4 x 113 g"
  const multi = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([a-z]+)/);
  if (multi) {
    const unit = TO_BASE[multi[3]];
    if (unit) {
      return {
        qty: parseFloat(multi[1]) * parseFloat(multi[2]) * unit.factor,
        basis: unit.basis,
      };
    }
  }

  const single = s.match(/(\d+(?:\.\d+)?)\s*([a-z]+)/);
  if (single) {
    const unit = TO_BASE[single[2]];
    if (unit) {
      return { qty: parseFloat(single[1]) * unit.factor, basis: unit.basis };
    }
  }

  // A bare number with no measure is a count ("12 pack" already matched above).
  const bare = s.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return { qty: parseFloat(bare[1]), basis: "unit" };

  return null;
}

const formatMoney = (n: number): string =>
  n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;

/**
 * Unit price for a product, or null when the size can't be determined.
 *
 * Prefers the structured `unitQuantity` + `unitMeasure` columns and falls back
 * to parsing `unitSize` free text.
 */
export function getUnitPrice(input: {
  price: number | null | undefined;
  unitQuantity?: number | null;
  unitMeasure?: string | null;
  unitSize?: string | null;
}): UnitPrice | null {
  const { price } = input;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  let parsed: { qty: number; basis: UnitBasis } | null = null;

  if (input.unitQuantity && input.unitMeasure) {
    const unit = TO_BASE[input.unitMeasure.toLowerCase()];
    if (unit) {
      parsed = { qty: input.unitQuantity * unit.factor, basis: unit.basis };
    }
  }
  parsed ??= parseQuantity(input.unitSize);

  if (!parsed || parsed.qty <= 0) return null;

  const per = DISPLAY_QUANTITY[parsed.basis];
  const value = (price / parsed.qty) * per;

  return {
    value,
    basis: parsed.basis,
    label:
      parsed.basis === "unit"
        ? `${formatMoney(value)} each`
        : `${formatMoney(value)} / ${per}${parsed.basis}`,
  };
}

/**
 * Two unit prices are only comparable on the same basis.
 *
 * Weight against volume is meaningless, and the group view must never rank them
 * against each other.
 */
export const comparableBasis = (a: UnitPrice, b: UnitPrice): boolean =>
  a.basis === b.basis;

/**
 * Rank options by value, cheapest first.
 *
 * Only the largest comparable set is ranked — if a group mixes weight and
 * volume, the minority basis is returned separately rather than silently
 * interleaved into a misleading ordering.
 */
export function rankByUnitPrice<T>(
  items: T[],
  unitPriceOf: (item: T) => UnitPrice | null,
): { ranked: T[]; basis: UnitBasis | null; incomparable: T[] } {
  const byBasis = new Map<UnitBasis, T[]>();
  const incomparable: T[] = [];

  for (const item of items) {
    const up = unitPriceOf(item);
    if (!up) {
      incomparable.push(item);
      continue;
    }
    const list = byBasis.get(up.basis) ?? [];
    list.push(item);
    byBasis.set(up.basis, list);
  }

  let basis: UnitBasis | null = null;
  let ranked: T[] = [];
  for (const [b, list] of byBasis) {
    if (list.length > ranked.length) {
      basis = b;
      ranked = list;
    }
  }
  for (const [b, list] of byBasis) if (b !== basis) incomparable.push(...list);

  ranked.sort((a, b) => {
    const av = unitPriceOf(a)?.value ?? Infinity;
    const bv = unitPriceOf(b)?.value ?? Infinity;
    return av - bv;
  });

  return { ranked, basis, incomparable };
}
