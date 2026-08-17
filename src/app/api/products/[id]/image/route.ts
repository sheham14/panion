import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api-error";

/**
 * Serve a product image through our own origin.
 *
 * Three problems this solves at once:
 *
 *  1. **CSP.** Product imagery comes from flyer CDNs (currently
 *     `f.wishabi.net`). Rather than adding every future source host to
 *     `img-src`, images are same-origin and the policy stays `'self'`.
 *  2. **Content type.** The upstream serves `application/octet-stream`, which
 *     browsers may refuse to render. We set a real image type.
 *  3. **Hotlinking.** Requests carry no referer to the origin CDN, and swapping
 *     the backing store for Vercel Blob later is a change here only — no
 *     schema change, no UI change.
 *
 * Takes a **product id**, never a URL, so there is no SSRF surface: a caller
 * cannot make the server fetch an arbitrary host.
 */

/**
 * Hosts we will fetch product imagery from.
 *
 * Keep this in step with the adapters — every entry here is a host some adapter
 * actually writes into `Product.imageUrl`. Adding an adapter without adding its
 * CDN silently 404s every image it imports, which is exactly what happened when
 * the PC Express import landed on `digital.loblaws.ca` while this list guessed
 * at `assets.shop.loblaws.ca`.
 */
const ALLOWED_IMAGE_HOSTS = [
  // Flipp flyer imagery
  "f.wishabi.net",
  "images.wishabi.net",
  // PC Express (Dominion / No Frills) — verified from a real imageAssets URL
  "digital.loblaws.ca",
  "assets.shop.loblaws.ca",
  // Voilà (Sobeys) — verified from a real product `image.src`
  "voila.ca",
  // Reserved for the Walmart adapter
  "i5.walmartimages.ca",
  "i5.walmartimages.com",
];

/** Cached hard at the edge — flyer imagery is immutable per flyer cycle. */
const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, immutable";

const isAllowedHost = (raw: string): boolean => {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.includes(url.hostname)
    );
  } catch {
    return false;
  }
};

/** Guess a sane image content-type; upstream often says octet-stream. */
function imageTypeFor(url: string, upstream: string | null): string {
  if (upstream && upstream.startsWith("image/")) return upstream;
  const path = url.split("?")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    select: { imageUrl: true },
  });

  if (!product?.imageUrl) return notFound("No image for this product");
  if (!isAllowedHost(product.imageUrl)) {
    console.error(
      `[product-image] blocked disallowed host for product ${id}: ${product.imageUrl}`,
    );
    return notFound("No image for this product");
  }

  try {
    const upstream = await fetch(product.imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
      // Let the platform cache the upstream fetch too.
      next: { revalidate: 604800 },
    });

    if (!upstream.ok || !upstream.body) {
      return notFound("Image unavailable");
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": imageTypeFor(
          product.imageUrl,
          upstream.headers.get("content-type"),
        ),
        "Cache-Control": CACHE_CONTROL,
        // Defence in depth: never let a mistyped upstream be treated as script.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error(`[product-image] fetch failed for product ${id}:`, err);
    return notFound("Image unavailable");
  }
}
