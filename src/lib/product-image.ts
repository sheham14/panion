/**
 * Where the UI should point an `<img src>` for a product.
 *
 * Always our own origin — see `src/app/api/products/[id]/image/route.ts` for
 * why (CSP, content-type, hotlinking). Callers pass the product id plus
 * whatever they know about whether an image exists, so a product with no image
 * still renders its placeholder instead of firing a request that 404s.
 */
export function productImageSrc(
  productId: string,
  hasImage: boolean | string | null | undefined,
): string | null {
  if (!productId) return null;
  if (!hasImage) return null;
  return `/api/products/${encodeURIComponent(productId)}/image`;
}
