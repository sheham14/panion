import { computeListPricing, type ListPricing, type PricingItem } from "@/lib/list-pricing";

/**
 * What a recipe costs to shop for, store by store.
 *
 * Each ingredient is bought as a linked product if it has one, otherwise as
 * the cheapest suitable member of its equivalence group *at each store*: the
 * recipe wants "shredded mozzarella", and the right buy at Sobeys may be
 * Compliments while at Walmart it is Great Value. Cost is whole packages enough
 * to cover the amount the recipe states, when the units allow working that out,
 * and one package when they do not ("2 cloves garlic", cups of cheese sold by
 * weight).
 *
 * Totals go through `computeListPricing()`, so they follow CLAUDE.md rule 12:
 * stores rank only on the ingredients every one of them can price, each total
 * says what it covers, and what is left out — no price, or already in the
 * pantry — is reported rather than dropped. The previous "estimated total"
 * summed the cheapest price per ingredient across *different* stores and
 * silently skipped anything unlinked; it named no store and covered an
 * unstated subset.
 */

export type ShoppingPrice = {
  price: number;
  isSale: boolean;
  storeName: string;
  chain: string;
};

export type ShoppingProduct = {
  id: string;
  name: string;
  brand: string | null;
  unitSize: string | null;
  unitQuantity: number | null;
  unitMeasure: string | null;
  prices: ShoppingPrice[];
};

export type ShoppingIngredient = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  inPantry: boolean;
  linked: ShoppingProduct | null;
  groupSlug: string | null;
};

export type IngredientPick = {
  productId: string;
  /** Brand and name, as a shopper reads it. */
  label: string;
  unitSize: string | null;
  unitQuantity: number | null;
  unitMeasure: string | null;
  /** Packages needed to cover the recipe's amount. */
  packs: number;
  cost: number;
  storeName: string;
  chain: string;
  isSale: boolean;
  /** Chosen from the ingredient's group rather than a linked product. */
  viaGroup: boolean;
};

export type RecipeShopping = {
  /** Cheapest way to buy each ingredient across the shopper's stores. */
  picks: Record<string, IngredientPick | null>;
  pricing: ListPricing;
};

type Dimension = "weight" | "volume";

/** Recipe units, to grams or millilitres. */
const RECIPE_UNITS: Record<string, { dim: Dimension; base: number }> = {
  g: { dim: "weight", base: 1 },
  gram: { dim: "weight", base: 1 },
  grams: { dim: "weight", base: 1 },
  kg: { dim: "weight", base: 1000 },
  oz: { dim: "weight", base: 28.3495 },
  lb: { dim: "weight", base: 453.592 },
  lbs: { dim: "weight", base: 453.592 },
  ml: { dim: "volume", base: 1 },
  l: { dim: "volume", base: 1000 },
  litre: { dim: "volume", base: 1000 },
  liter: { dim: "volume", base: 1000 },
  cup: { dim: "volume", base: 240 },
  cups: { dim: "volume", base: 240 },
  tbsp: { dim: "volume", base: 15 },
  tablespoon: { dim: "volume", base: 15 },
  tablespoons: { dim: "volume", base: 15 },
  tsp: { dim: "volume", base: 5 },
  teaspoon: { dim: "volume", base: 5 },
  teaspoons: { dim: "volume", base: 5 },
  "fl oz": { dim: "volume", base: 29.5735 },
};

/** How products store their size (`parseSize` writes g / ml / unit). */
const PRODUCT_MEASURES: Record<string, { dim: Dimension; base: number }> = {
  g: { dim: "weight", base: 1 },
  kg: { dim: "weight", base: 1000 },
  oz: { dim: "weight", base: 28.3495 },
  lbs: { dim: "weight", base: 453.592 },
  ml: { dim: "volume", base: 1 },
  l: { dim: "volume", base: 1000 },
  fl_oz: { dim: "volume", base: 29.5735 },
};

/**
 * A misparsed size can make a package look tiny; past this many packages the
 * size is more likely wrong than the recipe enormous, so cost one package.
 */
const MAX_PACKS = 6;

/** Packages of `product` needed for the recipe's amount. 1 when it can't be worked out. */
export function packsFor(
  quantity: number | null,
  unit: string | null,
  product: Pick<ShoppingProduct, "unitQuantity" | "unitMeasure" | "unitSize">,
): number {
  const wanted = unit ? RECIPE_UNITS[unit.trim().toLowerCase()] : undefined;
  const have = product.unitMeasure
    ? PRODUCT_MEASURES[product.unitMeasure.trim().toLowerCase()]
    : undefined;
  if (!quantity || quantity <= 0 || !wanted || !have || !product.unitQuantity) return 1;
  if (wanted.dim !== have.dim) return 1;
  // Priced per weight at the counter: the price is for one unit of measure,
  // and the recipe's amount is what is bought.
  if (product.unitSize?.toLowerCase().includes("per")) return 1;

  const packs = Math.ceil(
    (quantity * wanted.base) / (product.unitQuantity * have.base),
  );
  return packs >= 1 && packs <= MAX_PACKS ? packs : 1;
}

const label = (p: ShoppingProduct) => [p.brand, p.name].filter(Boolean).join(" ");

/** Cheapest way to buy one ingredient at one chain, among the candidates. */
function cheapestAt(
  chain: string,
  ing: ShoppingIngredient,
  candidates: ShoppingProduct[],
  viaGroup: boolean,
): IngredientPick | null {
  let best: IngredientPick | null = null;
  for (const product of candidates) {
    const atChain = product.prices.filter((p) => p.chain === chain);
    if (atChain.length === 0) continue;
    const row = atChain.reduce((a, b) => (b.price < a.price ? b : a));
    const packs = packsFor(ing.quantity, ing.unit, product);
    const cost = Math.round(row.price * packs * 100) / 100;
    if (best === null || cost < best.cost) {
      best = {
        productId: product.id,
        label: label(product),
        unitSize: product.unitSize,
        unitQuantity: product.unitQuantity,
        unitMeasure: product.unitMeasure,
        packs,
        cost,
        storeName: row.storeName,
        chain,
        isSale: row.isSale,
        viaGroup,
      };
    }
  }
  return best;
}

export function planRecipeShopping(
  ingredients: ShoppingIngredient[],
  membersByGroup: Map<string, ShoppingProduct[]>,
  preferredChains: string[],
): RecipeShopping {
  const preferred = [...new Set(preferredChains.map((c) => c.toLowerCase()))];
  const picks: Record<string, IngredientPick | null> = {};
  const items: PricingItem[] = [];

  for (const ing of ingredients) {
    const viaGroup = !ing.linked;
    const candidates = ing.linked
      ? [ing.linked]
      : ing.groupSlug
        ? (membersByGroup.get(ing.groupSlug) ?? [])
        : [];

    const chains = [
      ...new Set(candidates.flatMap((c) => c.prices.map((p) => p.chain))),
    ];
    const perChain = chains
      .map((chain) => cheapestAt(chain, ing, candidates, viaGroup))
      .filter((p): p is IngredientPick => p !== null);

    // The suggestion shown on the ingredient: cheapest at a store the shopper
    // uses, or anywhere when none of theirs carries it.
    const pool = perChain.some((p) => preferred.includes(p.chain))
      ? perChain.filter((p) => preferred.includes(p.chain))
      : perChain;
    picks[ing.id] = pool.reduce<IngredientPick | null>(
      (a, b) => (a === null || b.cost < a.cost ? b : a),
      null,
    );

    items.push({
      id: ing.id,
      // Already in the pantry: shown, but not bought.
      isChecked: ing.inPantry,
      quantity: 1,
      unit: "each",
      customPrice: null,
      // Cost per chain is already worked out above, packages included, so the
      // basket is priced from one synthetic row per chain.
      product: perChain.length
        ? {
            unitSize: null,
            unitQuantity: null,
            unitMeasure: null,
            storeProducts: perChain.map((p) => ({
              currentPrice: p.cost,
              store: { chain: p.chain },
            })),
          }
        : null,
    });
  }

  return { picks, pricing: computeListPricing(items, preferred) };
}
