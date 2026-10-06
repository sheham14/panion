import { prisma } from "@/lib/prisma";
import { complete as defaultComplete, type Complete } from "@/lib/ai/complete";

/**
 * Match recipe ingredients to **equivalence groups** — what a shopper would put
 * in the basket for "1 cup shredded mozzarella" is any shredded mozzarella, not
 * one brand of it. The group is stored on the ingredient (`groupSlug`), and the
 * recipe page prices it from whichever member is cheapest at each store.
 *
 * This was the gap behind "recipes only add text to lists": nothing ever linked
 * an ingredient to the catalogue, so a recipe could not be priced and an
 * ingredient added to a list carried no product.
 *
 * A model does the matching because it is judgement, not string overlap:
 * "butter" means salted butter rather than peanut butter, "parmesan" the
 * grated kind, and "salt to taste" nothing at all. Only slugs that exist are
 * accepted; anything else is treated as no match.
 */

const SYSTEM_PROMPT = `You match recipe ingredients to grocery product groups so a shopper can see what each ingredient costs.

You get a numbered list of ingredients and a list of product group slugs. For each ingredient, choose the single group a shopper would buy to cover it, or null when none fits.

Rules:
- Use only slugs from the list, spelled exactly.
- Pick the everyday form: "butter" is salted butter, "milk" is the most ordinary milk group available, "cheddar" is block cheddar unless the recipe says shredded or sliced.
- Respect stated forms and varieties: "shredded mozzarella" is a shredded group, "unsalted butter" is unsalted, "skim milk" is skim.
- Use null for water, ice, and anything no group covers. Do not pick a group that only loosely relates (no "peanut butter" for "butter", no "milk chocolate" for "milk").

Respond with a JSON array only, one object per ingredient, in order:
[{"i": 0, "group": "salted-butter"}, {"i": 1, "group": null}]`;

/**
 * Ingredient name → group slug, or null for no match. Never throws: an
 * unanswered or malformed reply leaves every ingredient unmatched.
 */
export async function matchIngredientsToGroups(
  names: string[],
  groups: string[],
  complete: Complete = defaultComplete,
): Promise<(string | null)[] | null> {
  if (names.length === 0) return [];
  if (groups.length === 0) return names.map(() => null);

  const known = new Set(groups);
  const prompt =
    `Ingredients:\n${names.map((n, i) => `${i}. ${n}`).join("\n")}\n\n` +
    `Product groups:\n${groups.join(", ")}`;

  let text: string | null;
  try {
    text = await complete({ system: SYSTEM_PROMPT, prompt });
  } catch (err) {
    console.error(
      "[match-ingredients] model call failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!text) return null;

  const out: (string | null)[] = names.map(() => null);
  try {
    // Occasionally wrapped in prose or a fence; take the array.
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;

    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const { i, group } = row as { i?: unknown; group?: unknown };
      if (typeof i !== "number" || i < 0 || i >= names.length) continue;
      // A slug the catalogue does not have is a guess, not a match.
      if (typeof group === "string" && known.has(group)) out[i] = group;
    }
  } catch {
    return null;
  }
  return out;
}

/**
 * Match a recipe's unlinked ingredients once, and remember having done it.
 *
 * Called when a recipe is saved and, for recipes saved before this existed, on
 * first view. Ingredients with a linked product are left alone. The timestamp
 * is set only when the model answered, so a failed attempt is retried on a
 * later view rather than recorded as "nothing matched".
 */
export async function ensureIngredientGroups(
  recipeId: string,
  complete: Complete = defaultComplete,
): Promise<void> {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: {
      ingredientsMatchedAt: true,
      ingredients: {
        where: { productId: null },
        select: { id: true, name: true },
      },
    },
  });
  if (!recipe || recipe.ingredientsMatchedAt) return;

  if (recipe.ingredients.length === 0) {
    await prisma.recipe.update({
      where: { id: recipeId },
      data: { ingredientsMatchedAt: new Date() },
    });
    return;
  }

  // Groups worth offering: ones with at least one priced product.
  const groups = (
    await prisma.product.findMany({
      where: {
        isActive: true,
        subcategory: { not: null },
        storeProducts: { some: { isActive: true, currentPrice: { not: null } } },
      },
      select: { subcategory: true },
      distinct: ["subcategory"],
      orderBy: { subcategory: "asc" },
    })
  ).map((r) => r.subcategory as string);

  const slugs = await matchIngredientsToGroups(
    recipe.ingredients.map((i) => i.name),
    groups,
    complete,
  );
  if (!slugs) return;

  await prisma.$transaction([
    ...recipe.ingredients.map((ing, idx) =>
      prisma.recipeIngredient.update({
        where: { id: ing.id },
        data: { groupSlug: slugs[idx] },
      }),
    ),
    prisma.recipe.update({
      where: { id: recipeId },
      data: { ingredientsMatchedAt: new Date() },
    }),
  ]);
}
