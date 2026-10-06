import { normalizeName } from "@/lib/pricing/match";

/**
 * Store brands, with the chains that sell them.
 *
 * A store brand is only on the shelf at its own chain's banners, so a Great
 * Value product priced at Sobeys is wrong by construction. The Loblaw list is
 * the one `scripts/coverage.ts` already treats as unreachable off-Loblaw.
 */
export const STORE_BRANDS: { chains: string[]; brands: string[] }[] = [
  {
    chains: ["walmart"],
    brands: ["Great Value", "Equate", "Mainstays", "Our Finest", "Parent's Choice"],
  },
  {
    chains: ["sobeys"],
    brands: ["Sensations by Compliments", "Compliments"],
  },
  {
    chains: ["dominion", "no frills"],
    brands: [
      "President's Choice",
      "PC Blue Menu",
      "PC Black Label",
      "No Name",
      "Life Brand",
      "Farmer's Market",
    ],
  },
];

/** Longest brand considered, in words. "Sensations by Compliments" is three. */
const MAX_BRAND_WORDS = 5;

/**
 * Split a known brand off the front of a product title.
 *
 * Browser captures of Walmart carry no brand field: the DOM tier reads the
 * title, price and size, and the brand sits inside the title. Stored as-is,
 * "Great Value Large White Eggs" became a product with `brand: null`, which the
 * matcher's brand gate cannot protect. Splitting it the way PC Express already
 * supplies its data — brand apart from name — gives the gate something to
 * check, and leaves the displayed name unchanged, since the app shows brand
 * plus name.
 *
 * Whole leading words only, case- and punctuation-insensitive, longest brand
 * first, so "PC Blue Menu Oats" is PC Blue Menu rather than PC. Returns null
 * when no known brand leads the title, or when nothing would be left after it.
 */
export function splitLeadingBrand(
  title: string,
  brands: Iterable<string>,
): { brand: string; name: string } | null {
  const byNorm = new Map<string, string>();
  for (const brand of brands) {
    const norm = normalizeName(brand);
    // First spelling wins, so callers list the canonical source first.
    if (norm.length >= 2 && !byNorm.has(norm)) byNorm.set(norm, brand);
  }

  const words = title.trim().split(/\s+/);
  for (let k = Math.min(MAX_BRAND_WORDS, words.length - 1); k >= 1; k--) {
    const brand = byNorm.get(normalizeName(words.slice(0, k).join(" ")));
    if (!brand) continue;

    const name = words
      .slice(k)
      .join(" ")
      .replace(/^[\s,:;|\-–—]+/, "")
      .trim();
    if (name) return { brand, name };
  }
  return null;
}
