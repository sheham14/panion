import Anthropic from "@anthropic-ai/sdk";

/**
 * Second-opinion pass over the matcher's proposals.
 *
 * The matcher decides on tokens, sizes and attribute conflicts. It is
 * deliberately conservative, and it still gets things wrong in a way no
 * automated price check can see: a bag of chicken nuggets priced as a pack of
 * breasts, four different Dempster's loaves collapsed onto one row. The prices
 * involved were entirely plausible, which is why the ≥1.8× spread rule missed
 * two of them.
 *
 * What that check actually needs is not grocery expertise — it is reading two
 * product names carefully and noticing that one says "12 Grain" where the other
 * says "Whole Wheat". A model does that consistently across hundreds of rows,
 * where a person reviewing row 40 of 48 does not.
 *
 * So this runs over every proposed match and returns one of:
 *
 *   same      — import it
 *   different — drop it
 *   unsure    — ask the human, with the reason written out
 *
 * The verdict never *widens* the matcher: a pair it never proposed is not
 * considered here. This can only reject or question, which keeps every existing
 * gate intact and makes this a strictly additional filter.
 */

const MODEL = "claude-haiku-4-5";
const BATCH_SIZE = 25;

export type VerifyInput = {
  /** Index of the row in the submission, so verdicts can be joined back. */
  index: number;
  /** What the capture called it, including brand and size. */
  capturedName: string;
  /** What the catalogue calls the product it matched to. */
  catalogueName: string;
  catalogueSize: string | null;
};

export type Verdict = "same" | "different" | "unsure";

export type VerifyResult = {
  verdict: Verdict;
  /** One short sentence, shown to the reviewer when the verdict is unsure. */
  reason: string;
};

const SYSTEM_PROMPT = `You check whether two Canadian grocery product listings refer to the SAME product.

One name comes from a store's website, the other from a product catalogue. They are written differently by different retailers, so wording will not match exactly. Judge the product, not the phrasing.

Answer "same" only if a shopper would agree they are the same item.

Treat as DIFFERENT:
- A different variety, flavour, or scent (12 Grain vs Whole Wheat; vanilla vs original; salted vs unsalted).
- A different cut or form (nuggets vs breasts; shredded vs block; ground vs whole bean).
- A different fat or strength (2% vs 3.25%; regular vs diet).
- A clearly different package size, where both state one. Ignore small rounding.
- A different brand, unless one name simply omits the brand the other states.

Treat as SAME:
- The same product with extra or reordered words ("Dempster's 100% Whole Wheat Bread 570g" vs "Dempster's Whole Wheat Bread").
- The same product where only one side states the size, or the sizes agree.
- Wording differences that do not change what the item is ("partly skimmed" vs "partly skim").

Use "unsure" when the names are too vague to decide, or when the only difference might or might not matter. Prefer "unsure" over guessing "same".

Respond with a JSON array only, one object per input pair, in the same order:
[{"index": 0, "verdict": "same"|"different"|"unsure", "reason": "short sentence"}]`;

function parseVerdicts(text: string): Map<number, VerifyResult> {
  const out = new Map<number, VerifyResult>();
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return out;
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return out;

    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const { index, verdict, reason } = row as {
        index?: unknown;
        verdict?: unknown;
        reason?: unknown;
      };
      if (typeof index !== "number") continue;
      if (verdict !== "same" && verdict !== "different" && verdict !== "unsure") {
        continue;
      }
      out.set(index, {
        verdict,
        reason: typeof reason === "string" ? reason.slice(0, 240) : "",
      });
    }
  } catch {
    // A malformed batch yields no verdicts; the caller treats that as unsure.
  }
  return out;
}

export type VerifyOptions = { client?: Anthropic; batchSize?: number };

/**
 * Verify proposed matches. Never throws.
 *
 * A pair with no verdict — a malformed response, an API failure, a row the
 * model skipped — comes back **unsure** rather than same. An unavailable
 * verifier must not silently become an approving one.
 */
export async function verifyMatches(
  pairs: VerifyInput[],
  opts: VerifyOptions = {},
): Promise<Map<number, VerifyResult>> {
  const results = new Map<number, VerifyResult>();
  if (pairs.length === 0) return results;

  const client = opts.client ?? new Anthropic();
  const batchSize = opts.batchSize ?? BATCH_SIZE;

  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    const list = batch
      .map((p) =>
        JSON.stringify({
          index: p.index,
          store: p.capturedName,
          catalogue: [p.catalogueName, p.catalogueSize].filter(Boolean).join(" "),
        }),
      )
      .join("\n");

    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: list }],
      });
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      for (const [index, verdict] of parseVerdicts(text)) {
        results.set(index, verdict);
      }
    } catch {
      // Leave this batch unverified; the fallback below marks it unsure.
    }
  }

  for (const p of pairs) {
    if (!results.has(p.index)) {
      results.set(p.index, {
        verdict: "unsure",
        reason: "The checker did not return a verdict for this row.",
      });
    }
  }

  return results;
}
