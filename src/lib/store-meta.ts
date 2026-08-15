/**
 * Per-chain display metadata — brand colour, tint, and avatar letter.
 *
 * This existed in six near-identical copies (BrowseClient, OnboardingClient,
 * search, product detail, ListsClient, watchlist-summary), which meant adding a
 * store required six edits and they had already drifted — Costco was `#005daa`
 * in three files and `#005dab` in another.
 *
 * Keys are the lowercased `Store.chain` value, which is also the join key the
 * Flipp adapter maps merchant names on.
 */
export type StoreMeta = {
  color: string;
  bg: string;
  letter: string;
};

const DEFAULT_META: StoreMeta = {
  color: "#666666",
  bg: "#66666618",
  letter: "?",
};

const STORE_META: Record<string, StoreMeta> = {
  // ── National chains (full catalogue + price mapping) ──────────────────────
  walmart: { color: "#0071ce", bg: "#0071ce18", letter: "W" },
  dominion: { color: "#c8102e", bg: "#c8102e18", letter: "D" },
  sobeys: { color: "#d62b2b", bg: "#d62b2b18", letter: "S" },

  // ── NL independents (flyer-only, via Flipp) ───────────────────────────────
  "powell's supermarket": { color: "#1b7a3d", bg: "#1b7a3d18", letter: "P" },
  colemans: { color: "#e4572e", bg: "#e4572e18", letter: "C" },
  "value grocer": { color: "#7b2d8e", bg: "#7b2d8e18", letter: "V" },
  "bidgood's": { color: "#0f766e", bg: "#0f766e18", letter: "B" },
  "clover farm": { color: "#4d7c0f", bg: "#4d7c0f18", letter: "C" },
  "marie's mini mart": { color: "#b45309", bg: "#b4530918", letter: "M" },
};

/** Display metadata for a chain. Never throws; unknown chains get a neutral style. */
export function getStoreMeta(chain: string | null | undefined): StoreMeta {
  if (!chain) return DEFAULT_META;
  return STORE_META[chain.toLowerCase()] ?? DEFAULT_META;
}

/** Just the brand colour — for the callers that only need one. */
export const getStoreColor = (chain: string | null | undefined): string =>
  getStoreMeta(chain).color;

export { STORE_META, DEFAULT_META };
