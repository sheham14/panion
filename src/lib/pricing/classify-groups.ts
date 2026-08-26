import Anthropic from "@anthropic-ai/sdk";

/**
 * Assign products to **equivalence groups** — the unit of cross-brand comparison.
 *
 * A group answers "is the Compliments canned soup or the No Name one cheaper?",
 * which is a different question from "where is Barilla spaghetti cheapest?".
 * The first compares *brands* of the same thing; the second compares *stores*
 * for the same UPC. Panion needs both, and only the second was built first.
 *
 * Granularity is the whole problem, and it's judgement rather than rules:
 *
 *   too coarse  "canned soup"                 → compares tomato to chicken noodle
 *   too fine    "Campbell's tomato 284ml"     → that's just the SKU again
 *   right       "condensed tomato soup"       → brand-agnostic, size-agnostic,
 *                                               flavour-specific
 *
 * Size is deliberately excluded from the group: a 284 ml and a 796 ml can are
 * the same product, and unit price is what makes them fairly comparable.
 *
 * Runs once at import and the result is stored on `Product.subcategory`, so this
 * is not in any request path.
 */

const MODEL = "claude-haiku-4-5";

/** Batch size per request — large enough to be cheap, small enough to stay reliable. */
const BATCH_SIZE = 40;

export type ClassifyInput = {
  id: string;
  name: string;
  brand: string | null;
  packageSize: string | null;
};

export type ClassifyResult = Map<string, string>;

const SYSTEM_PROMPT = `You group Canadian grocery products so shoppers can compare prices across brands.

For each product, output a "group" — a short lowercase slug naming the product type at a granularity where different BRANDS of the same thing land in the same group.

Rules:
- Exclude the brand. "Campbell's Condensed Tomato Soup" and "No Name Tomato Soup" share a group.
- Exclude the size. A 284ml can and a 796ml can share a group; unit price handles the difference.
- Keep the flavour or variety when it changes what the product IS. Tomato soup and chicken noodle soup are different groups. Salted and unsalted butter are different groups.
- Keep the form when it changes use. Ground coffee and whole bean are different groups. Shredded and block cheese are different groups.
- Use 2-4 words, singular, hyphenated: "condensed-tomato-soup", "salted-butter", "2-percent-milk", "whole-wheat-bread".
- Be consistent: identical product types must produce an identical slug.

Respond with a JSON array only, one object per input product, in the same order:
[{"id": "...", "group": "..."}]`;

/**
 * Groups already in use, offered so the model reuses them.
 *
 * Without this, classifying a new batch invents near-duplicate slugs for
 * things the catalogue already has a name for: a Walmart egg capture produced
 * `large-white-eggs` while the Dominion eggs beside it sat in `large-eggs`.
 * Two slugs for one product type means the cross-brand comparison silently
 * splits in half — which is the entire value of grouping.
 */
function knownGroupsBlock(known: string[]): string {
  if (!known.length) return "";
  return `\n\nGroups already in use:\n${known.join(", ")}\n\nIf a product belongs to one of those groups, reply with that exact slug. Only invent a new slug when none of them fits.`;
}

/** One batch. Returns id → group slug; unparseable entries are simply absent. */
async function classifyBatch(
  client: Anthropic,
  products: ClassifyInput[],
  known: string[],
): Promise<ClassifyResult> {
  const list = products
    .map(
      (p) =>
        `{"id":"${p.id}","name":"${[p.brand, p.name, p.packageSize].filter(Boolean).join(" ").replace(/"/g, "'")}"}`,
    )
    .join("\n");

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT + knownGroupsBlock(known),
    messages: [{ role: "user", content: list }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const out: ClassifyResult = new Map();
  try {
    // The model occasionally wraps the array in prose or a fence; take the array.
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return out;
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return out;

    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const { id, group } = row as { id?: unknown; group?: unknown };
      if (typeof id !== "string" || typeof group !== "string") continue;
      const slug = group
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (slug) out.set(id, slug);
    }
  } catch {
    // A malformed batch loses its groups; those products stay ungrouped rather
    // than taking down the whole import.
  }
  return out;
}

export type ClassifyOptions = {
  client?: Anthropic;
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
  /**
   * Slugs the catalogue already uses. Offered to the model so an incoming
   * product joins an existing group instead of founding a near-duplicate one.
   */
  knownGroups?: string[];
};

/** Classify every product, batched. Never throws — ungrouped is a valid outcome. */
export async function classifyGroups(
  products: ClassifyInput[],
  opts: ClassifyOptions = {},
): Promise<ClassifyResult> {
  if (products.length === 0) return new Map();

  const client = opts.client ?? new Anthropic();
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const result: ClassifyResult = new Map();
  const known = opts.knownGroups ?? [];

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    try {
      for (const [id, group] of await classifyBatch(client, batch, known)) {
        result.set(id, group);
      }
    } catch (err) {
      console.error(
        `[classify-groups] batch ${i / batchSize + 1} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
    opts.onProgress?.(Math.min(i + batchSize, products.length), products.length);
  }

  return result;
}
