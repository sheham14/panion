import type Anthropic from "@anthropic-ai/sdk";

/**
 * Which model each feature runs on — the one place to change it.
 *
 * Features name a role, not a model, so an upgrade (or a move to another
 * provider) is an edit here rather than a search through routes. These were
 * hard-coded in six files, which is how three of them were still on the 4.x
 * generation after 5.5 shipped, and how every Clove chat kept running on the
 * model stored with it when it was created.
 *
 * Upgraded 2026-10-11, tier for tier: Opus 5 → Opus 5.5, Sonnet 4.6 →
 * Sonnet 5.5, Haiku 4.5 → Haiku 5.5. All three think by default (adaptive)
 * and reject non-default `temperature`, assistant prefill and thinking
 * budgets: set `output_config.effort` instead, size `max_tokens` for thinking
 * plus the reply, and read content blocks by `type`, never `content[0]`.
 */
export const MODELS = {
  /**
   * Judgement calls through `complete()`: ingredient matching, pantry
   * categories. Haiku 5.5 at medium effort since 2026-10-11, on
   * `scripts/eval-ingredient-matching.ts`: 146/146 matches the same as Opus
   * 5.5 over every production recipe plus known traps, at about 1/30th the
   * cost. At low effort it once matched chicken broth to beef broth.
   */
  judgement: "claude-haiku-5-5",
  /** Recipe suggestions from `/api/ai/ask`. */
  ask: "claude-sonnet-5-5",
  /** Clove chat, streamed. */
  chat: "claude-haiku-5-5",
  /** High-volume extraction and classification: recipe import, capture checks, groups. */
  fast: "claude-haiku-5-5",
} as const;

/**
 * Server-side refusal fallback: a declined request is re-run on the model
 * Anthropic recommends for that refusal category, inside the same call.
 * Claude API only, and only Opus 5.5 / Sonnet 5.5 here — Haiku 5.5 has no
 * server-side fallback, so its declines come back as refusals.
 */
export const SERVER_FALLBACK: Pick<
  Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
  "betas" | "fallbacks"
> = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

/**
 * The text of a reply. A response can begin with `thinking` blocks now that
 * thinking is on by default, so `content[0]` is not the answer.
 */
export function replyText(content: { type: string; text?: string }[]): string {
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}
