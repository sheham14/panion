/**
 * Which store a capture source can belong to.
 *
 * The bookmarklet cannot know which shop you were browsing — it only sees a
 * page — so the store is chosen at review time from a dropdown. That leaves one
 * silent failure: reviewing a Walmart capture while the dropdown still reads
 * Sobeys writes Walmart's prices onto Sobeys, and nothing looks wrong, because
 * both stores sell milk at four-something.
 *
 * The capture does know its *source*, and a source implies a chain. Pinning
 * that turns a plausible-looking mistake into a refusal.
 *
 * Deliberately no entry for `generic`: an unrecognized site could be any store,
 * so it stays the reviewer's judgement rather than a guess.
 */
export const CHAIN_BY_CAPTURE_SOURCE: Record<string, string> = {
  walmart: "walmart",
  voila: "sobeys",
};

/** The chain a source must be imported into, or null when unconstrained. */
export function requiredChainFor(source: string | null | undefined): string | null {
  if (!source) return null;
  return CHAIN_BY_CAPTURE_SOURCE[source] ?? null;
}

/**
 * Whether a capture from `source` may be written to a store on `chain`.
 * Unconstrained sources may go anywhere.
 */
export function sourceAllowsChain(
  source: string | null | undefined,
  chain: string,
): boolean {
  const required = requiredChainFor(source);
  if (!required) return true;
  return required.toLowerCase() === chain.toLowerCase();
}
