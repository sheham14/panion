import Anthropic from "@anthropic-ai/sdk";

/**
 * One prompt in, text out — the place new AI calls go through.
 *
 * Panion is not to be locked to one provider: a feature may move to Gemini or
 * OpenAI where that fits better (receipt vision, voice). Callers depend on this
 * signature, never on a vendor SDK, so moving a feature means changing this
 * file rather than every route. Older call sites still construct the Anthropic
 * client directly; they move here when they are next touched.
 *
 * Returns null when the model declines or returns no text. Callers treat that
 * as "no answer", never as an error to surface.
 */
export type CompleteRequest = {
  system: string;
  prompt: string;
  maxTokens?: number;
};

export type Complete = (req: CompleteRequest) => Promise<string | null>;

/**
 * Chosen on a side-by-side, not by default (2026-10-06): 16 recipe
 * ingredients matched against production-like groups. Opus 5 and Haiku 4.5
 * agreed on 15 and took the same ~3s; Haiku mapped "plain yogurt" to Greek
 * yogurt — the loose substitution the matcher's prompt forbids, and the kind of
 * wrong match this codebase ranks worse than no match. Matching runs once per
 * recipe, so the cost gap is about a cent each. Re-run the comparison before
 * switching to a cheaper model.
 */
const MODEL = "claude-opus-5";

export const complete: Complete = async ({ system, prompt, maxTokens = 4096 }) => {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    // Short classification and extraction: low effort keeps cost and latency
    // down without hurting answers this simple.
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: prompt }],
  });

  if (res.stop_reason === "refusal") return null;

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return text || null;
};
