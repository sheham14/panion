import { prisma } from "@/lib/prisma";
import { complete as defaultComplete, type Complete } from "@/lib/ai/complete";

/**
 * A first category for pantry items that have none.
 *
 * Most pantry items arrived with no category — typed in, or added from a list
 * — so the pantry was one "Uncategorized" section with the same label on every
 * tile. An item linked to a catalogue product takes the product's category; the
 * rest are sorted by a model in one call. It is a suggestion: the edit sheet
 * already lets the shopper change any category, and a category they set is
 * never touched here, because only items with none are read.
 *
 * Every answered item gets a category ("other" when nothing fits), so an item
 * is sent to the model once. A failed call changes nothing and is retried on a
 * later visit.
 */

/**
 * `ProductCategory` values the pantry shows, stored as plain strings.
 * "seasonal" is left out: the pantry has no label or icon for it.
 */
export const PANTRY_CATEGORIES = [
  "dairy",
  "meat_seafood",
  "produce",
  "bakery_bread",
  "frozen",
  "pantry_dry_goods",
  "snacks_candy",
  "beverages",
  "household",
  "personal_care",
  "baby",
  "pet",
  "deli_prepared",
  "health_wellness",
  "other",
] as const;

const KNOWN = new Set<string>(PANTRY_CATEGORIES);

/** Items sent to the model per call, so one visit can't run up a long prompt. */
const MAX_PER_CALL = 40;

const SYSTEM_PROMPT = `You sort a shopper's pantry items into grocery categories.
You get a numbered list of items. For each, choose exactly one category from this list, spelled exactly:
${PANTRY_CATEGORIES.join(", ")}
Rules:
- Choose where the item is found in a grocery store: butter and eggs are dairy, bread and bagels bakery_bread, pasta, rice, oil, flour and canned goods pantry_dry_goods, fresh fruit and vegetables produce.
- Use "other" only when no category fits.
Respond with a JSON array only, one object per item, in order:
[{"i": 0, "category": "dairy"}, {"i": 1, "category": "produce"}]`;

/**
 * Item name → category, or null for every item when the model gives no usable
 * answer. Never throws. Anything outside the list is dropped, not guessed at.
 */
export async function categorizeNames(
  names: string[],
  complete: Complete = defaultComplete,
): Promise<(string | null)[] | null> {
  if (names.length === 0) return [];
  let text: string | null;
  try {
    text = await complete({
      system: SYSTEM_PROMPT,
      prompt: `Items:\n${names.map((n, i) => `${i}. ${n}`).join("\n")}`,
      maxTokens: 2048,
    });
  } catch (err) {
    console.error("[pantry-categorize] model call failed:", err instanceof Error ? err.message : err);
    return null;
  }
  if (!text) return null;

  const out: (string | null)[] = names.map(() => null);
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const { i, category } = row as { i?: unknown; category?: unknown };
      if (typeof i !== "number" || i < 0 || i >= names.length) continue;
      if (typeof category === "string" && KNOWN.has(category)) out[i] = category;
    }
  } catch {
    return null;
  }
  return out;
}

/**
 * Give the user's uncategorised pantry items a category. Returns how many were
 * set. Safe to call on every visit: once items have categories it reads
 * nothing to send.
 */
export async function categorizePantry(
  userId: string,
  complete: Complete = defaultComplete,
): Promise<number> {
  const items = await prisma.pantryItem.findMany({
    where: { userId, OR: [{ category: null }, { category: "" }] },
    select: { id: true, name: true, brand: true, product: { select: { category: true } } },
    take: MAX_PER_CALL,
    orderBy: { createdAt: "desc" },
  });
  if (items.length === 0) return 0;

  // The catalogue already knows linked products; no model call for those.
  const updates: { id: string; category: string }[] = [];
  const unknown: typeof items = [];
  for (const item of items) {
    if (item.product?.category) updates.push({ id: item.id, category: item.product.category });
    else unknown.push(item);
  }

  if (unknown.length > 0) {
    const names = unknown.map((i) =>
      i.brand && !i.name.toLowerCase().startsWith(i.brand.toLowerCase())
        ? `${i.brand} ${i.name}`
        : i.name,
    );
    const categories = await categorizeNames(names, complete);
    categories?.forEach((category, i) => {
      if (category) updates.push({ id: unknown[i].id, category });
    });
  }

  // Only rows still uncategorised: a category the shopper set in the meantime wins.
  for (const u of updates) {
    await prisma.pantryItem.updateMany({
      where: { id: u.id, userId, OR: [{ category: null }, { category: "" }] },
      data: { category: u.category },
    });
  }
  return updates.length;
}
