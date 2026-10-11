/**
 * A package size as a shopper reads it.
 *
 * Walmart captures store a size worked back from the unit price ("~1994 ml"),
 * kept raw on purpose: the matcher's size tolerance compares against it (see
 * `deriveSizeFromUnitPrice`). On screen that reads like a measurement, so an
 * approximate size is rounded to what is on the label: "~2 L", "~1 L",
 * "~1.4 kg". Everything else is shown as stored.
 */
export function displaySize(size: string | null | undefined): string | null {
  if (!size) return null;
  const m = size.match(/^~\s*(\d+(?:\.\d+)?)\s*(ml|g)$/i);
  if (!m) return size;
  const qty = Number(m[1]);
  const isVolume = m[2].toLowerCase() === "ml";
  if (qty >= 1000) {
    const big = Math.round(qty / 100) / 10;
    return `~${Number.isInteger(big) ? big : big.toFixed(1)} ${isVolume ? "L" : "kg"}`;
  }
  // Small sizes: the nearest 5 is as precise as a derived figure deserves.
  return `~${Math.round(qty / 5) * 5} ${isVolume ? "ml" : "g"}`;
}
