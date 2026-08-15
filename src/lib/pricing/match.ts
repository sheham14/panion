/**
 * Match store/flyer item names to canonical products.
 *
 * PRICING-PIPELINE.md §8 is emphatic that **a wrong match is worse than a
 * missing one** — comparing 400g of one brand against 750g of another destroys
 * trust in a way an absent product doesn't. So this is deliberately
 * conservative: deterministic scoring, a high threshold, and a hard unit-size
 * guard. Anything ambiguous is dropped rather than guessed.
 *
 * AI-assisted matching (§8) is the intended follow-up for the ambiguous tail,
 * with human confirmation. It is *not* the first line.
 */

export type CanonicalProduct = {
  id: string;
  name: string;
  brand: string | null;
  unitSize: string | null;
  unitQuantity: number | null;
  unitMeasure: string | null;
};

export type MatchResult = {
  productId: string;
  confidence: number;
  reason: string;
};

/** Words that carry no identifying signal in grocery item names. */
const STOP_WORDS = new Set([
  "the", "and", "or", "with", "a", "an", "of", "for", "in",
  "select", "selected", "assorted", "varieties", "variety", "sizes",
  "product", "products", "each", "ea", "pack", "pk", "size", "count", "ct",
  "fresh", "frozen", "new", "value", "family", "club", "size",
]);

/** Lowercase, strip punctuation and accents, collapse whitespace. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Content tokens, minus stop words and bare numbers. */
export function tokenize(raw: string): string[] {
  return normalizeName(raw)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t) && !/^\d+\.?\d*$/.test(t));
}

/**
 * Pull a size out of a free-text name, normalized to a base unit.
 *
 * "500g" -> { qty: 500, unit: "g" }; "1.5 L" -> { qty: 1500, unit: "ml" }.
 * Weight and volume are normalized separately so they can never compare equal.
 */
export function parseSize(
  raw: string,
): { qty: number; unit: "g" | "ml" | "unit" } | null {
  const s = raw.toLowerCase().replace(/,/g, "");

  const kg = s.match(/(\d+(?:\.\d+)?)\s*kg\b/);
  if (kg) return { qty: parseFloat(kg[1]) * 1000, unit: "g" };

  const g = s.match(/(\d+(?:\.\d+)?)\s*g\b/);
  if (g) return { qty: parseFloat(g[1]), unit: "g" };

  const l = s.match(/(\d+(?:\.\d+)?)\s*l\b/);
  if (l) return { qty: parseFloat(l[1]) * 1000, unit: "ml" };

  const ml = s.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  if (ml) return { qty: parseFloat(ml[1]), unit: "ml" };

  const pk = s.match(/(\d+)\s*(?:pk|pack|count|ct)\b/);
  if (pk) return { qty: parseFloat(pk[1]), unit: "unit" };

  return null;
}

/**
 * Are two sizes compatible?
 *
 * Unknown on either side is permitted — many flyer items omit size — but two
 * *known* sizes that disagree is a hard reject. That's the guard §8 asks for.
 */
export function sizesCompatible(
  a: ReturnType<typeof parseSize>,
  b: ReturnType<typeof parseSize>,
): boolean {
  if (!a || !b) return true;
  if (a.unit !== b.unit) return false;
  // 10% tolerance absorbs rounding and "approx" weights.
  const ratio = a.qty / b.qty;
  return ratio >= 0.9 && ratio <= 1.1;
}

/** Jaccard overlap of two token sets. */
function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared += 1;
  return shared / new Set([...setA, ...setB]).size;
}

/**
 * Fraction of the canonical product's tokens present in the item name.
 *
 * This is the load-bearing check. Jaccard alone accepted
 * "Natrel lactose free chocolate milk" for "Natrel Skim Milk" — the brand and
 * "milk" matched while "skim", the token that actually identifies the product,
 * was missing. Requiring the *product's* words to be present catches that.
 */
function productCoverage(itemTokens: string[], productTokens: string[]): number {
  if (productTokens.length === 0) return 0;
  const items = new Set(itemTokens);
  let shared = 0;
  for (const t of new Set(productTokens)) if (items.has(t)) shared += 1;
  return shared / new Set(productTokens).size;
}

/**
 * Attributes that are mutually exclusive within a group.
 *
 * If the item and the product each name a *different* member of the same group,
 * they are different products no matter how well the rest of the words line up.
 * "Maple Leaf Prime Chicken Wings" scored 0.75 coverage against "Maple Leaf
 * Chicken Breast" purely on brand + "chicken".
 */
const EXCLUSIVE_ATTRIBUTES: string[][] = [
  // cuts / forms
  ["breast", "thigh", "thighs", "wing", "wings", "drumstick", "drumsticks", "patties", "ground"],
  // milk fat / flavour
  ["skim", "whole", "chocolate", "buttermilk", "cream"],
  // diet vs regular
  ["diet", "zero", "regular"],
  // bread styles
  ["white", "rye", "sourdough", "pumpernickel"],
  // preparation
  ["smoked", "raw", "cooked", "breaded"],
];

/**
 * Marked variants: words whose *presence* signals a different product from the
 * plain form, even though the plain form never says so.
 *
 * "Coca-Cola" doesn't contain the word "regular", so a symmetric group check
 * can't tell that "Diet Coca-Cola" is a different product. If the item carries
 * one of these and the canonical product doesn't, it's a variant — reject.
 */
const VARIANT_MARKERS = [
  "diet", "zero", "light", "lite", "decaf", "decaffeinated",
  "unsalted", "lactose", "gluten", "organic", "vegan",
  "chocolate", "strawberry", "vanilla",
  "mini", "jumbo pack", "bites",
];

/** True when the two names disagree on a mutually-exclusive attribute. */
export function hasConflictingAttribute(
  itemTokens: string[],
  productTokens: string[],
): boolean {
  const items = new Set(itemTokens);
  const products = new Set(productTokens);

  for (const group of EXCLUSIVE_ATTRIBUTES) {
    const inItem = group.filter((g) => items.has(g));
    const inProduct = group.filter((g) => products.has(g));
    if (inItem.length === 0 || inProduct.length === 0) continue;
    // Both name an attribute from this group — they must overlap.
    if (!inItem.some((a) => inProduct.includes(a))) return true;
  }

  // Asymmetric case: a variant marker on the item but not the product.
  for (const marker of VARIANT_MARKERS) {
    if (items.has(marker) && !products.has(marker)) return true;
  }

  return false;
}

/**
 * Flyer entries that advertise several products at once, e.g.
 * "WONDER OR D'ITALIANO BREAD OR BUNS" or "Dempster's Bread or Texas Toast".
 * The price applies to whichever the shopper picks, so it can't be attributed
 * to one canonical product. Discard rather than guess.
 */
export function isMultiProductListing(name: string): boolean {
  return /\bor\b/i.test(name);
}

/** Minimum score to accept. Tuned to prefer misses over mismatches. */
export const MATCH_THRESHOLD = 0.5;

/**
 * Minimum share of the product's own tokens that must appear in the item name.
 * 0.75 rejects the bagels/buns and chocolate/skim confusions above while still
 * allowing benign extra words in the flyer's wording.
 */
export const MIN_PRODUCT_COVERAGE = 0.75;

/**
 * Minimum share of the *item's* tokens that must belong to the product.
 *
 * Coverage in one direction only isn't enough: a single-token product like
 * "Broccoli" is 100% covered by "Swanson cheesy rice with broccoli & chicken
 * frozen entrees". Requiring the item to be mostly *about* the product rejects
 * that, while still tolerating a qualifier or two ("Jumbo Carrots").
 */
export const MIN_ITEM_COVERAGE = 0.5;

/**
 * Best canonical product for a free-text item name, or null.
 *
 * Scoring, highest first:
 *   1. Brand agreement is worth a lot — "Great Value Butter" must never match
 *      "Lactantia Butter" (§ the doc's own normalisation prompt makes the same
 *      point about store brands vs national brands).
 *   2. Token overlap on the remaining words.
 *   3. Hard reject on incompatible known sizes.
 */
export function matchProduct(
  itemName: string,
  products: CanonicalProduct[],
): MatchResult | null {
  // "X or Y" advertises multiple products under one price — unattributable.
  if (isMultiProductListing(itemName)) return null;

  const itemTokens = tokenize(itemName);
  if (itemTokens.length === 0) return null;

  const itemSize = parseSize(itemName);
  const itemNorm = normalizeName(itemName);

  let best: MatchResult | null = null;

  for (const product of products) {
    const productSize =
      parseSize(product.unitSize ?? "") ??
      (product.unitQuantity && product.unitMeasure
        ? parseSize(`${product.unitQuantity}${product.unitMeasure}`)
        : null);

    if (!sizesCompatible(itemSize, productSize)) continue;

    const productTokens = tokenize(product.name);

    // Hard gate: the product's own identifying words must be present. Without
    // this, brand + one generic noun ("Natrel … milk") is enough to match the
    // wrong variant.
    const coverage = productCoverage(itemTokens, productTokens);
    if (coverage < MIN_PRODUCT_COVERAGE) continue;

    // …and the item must be mostly about this product, not merely mention it.
    const itemCov = productCoverage(productTokens, itemTokens);
    if (itemCov < MIN_ITEM_COVERAGE) continue;

    // Different cut, fat content, or diet/regular means a different product.
    if (hasConflictingAttribute(itemTokens, productTokens)) continue;

    // A branded product must have its brand named. Store brands and national
    // brands are different products — "Great Value Butter" is not "Lactantia
    // Butter" — so an unnamed brand is a reject, not a small penalty.
    if (product.brand) {
      const brandNorm = normalizeName(product.brand);
      if (brandNorm && !itemNorm.includes(brandNorm)) continue;
    }

    let score = tokenOverlap(itemTokens, productTokens) * 0.5 + coverage * 0.5;

    // Both sides state a size and they agree — corroborating evidence.
    if (itemSize && productSize) score += 0.1;

    if (score > (best?.confidence ?? 0)) {
      best = {
        productId: product.id,
        confidence: Math.min(1, score),
        reason: `coverage=${coverage.toFixed(2)} score=${score.toFixed(2)}`,
      };
    }
  }

  return best && best.confidence >= MATCH_THRESHOLD ? best : null;
}
