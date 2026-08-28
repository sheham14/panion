import { config as loadEnv } from "dotenv";

/*
 * Local by default, matching `prisma.config.ts` (CLAUDE.md rule 2).
 * `--production` redirects only DATABASE_URL, and refuses to run if `.env`
 * does not resolve to Neon.
 */
const TARGET_PRODUCTION = process.argv.includes("--production");

loadEnv({ path: ".env" });
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;
loadEnv({ path: ".env.local", override: true });
if (TARGET_PRODUCTION) process.env.DATABASE_URL = PRODUCTION_DATABASE_URL;

if (TARGET_PRODUCTION && !/neon\.tech/i.test(process.env.DATABASE_URL ?? "")) {
  console.error(
    "\n❌ --production expects the Neon database, but .env does not resolve to one. Refusing to run.\n",
  );
  process.exit(1);
}

/**
 * How many products actually have an image, and which surfaces are therefore
 * showing the placeholder.
 *
 * Read-only. The home and pantry tiles already render `product.imageUrl`
 * through the proxy and fall back to an emoji, so a screen full of trolleys is
 * a data question, not a UI one — this answers it before anything is changed.
 *
 * Prints the target host on start (rule 2).
 *
 *   npm run images
 *   npm run images -- --production
 */
function hostOf(url: string | undefined): string {
  if (!url) return "(unset)";
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  console.log(
    `\nDatabase: ${hostOf(process.env.DATABASE_URL)}${TARGET_PRODUCTION ? "  [--production]" : ""}\n`,
  );

  // Imported after the env juggling above — the client reads DATABASE_URL at
  // module load, so a static import would connect to the wrong database.
  const { prisma } = await import("@/lib/prisma");

  const [total, withImage] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { imageUrl: { not: null } } }),
  ]);

  const pct = total ? Math.round((withImage / total) * 100) : 0;
  console.log(`products with an image   ${withImage} of ${total}  (${pct}%)`);

  // Which hosts the images point at. Anything not in ALLOWED_IMAGE_HOSTS in
  // `src/app/api/products/[id]/image/route.ts` renders a broken tile rather
  // than a placeholder, which is the worse of the two failures (rule 5).
  const images = await prisma.product.findMany({
    where: { imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  const byHost = new Map<string, number>();
  for (const { imageUrl } of images) {
    const host = hostOf(imageUrl ?? undefined);
    byHost.set(host, (byHost.get(host) ?? 0) + 1);
  }
  console.log("\nimage hosts");
  for (const [host, count] of [...byHost].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${host.padEnd(28)} ${count}`);
  }

  // The two surfaces that show a placeholder today.
  const [watchedTotal, watchedWithImage, pantryTotal, pantryWithImage] =
    await Promise.all([
      prisma.watchlist.count(),
      prisma.watchlist.count({ where: { product: { imageUrl: { not: null } } } }),
      prisma.pantryItem.count(),
      prisma.pantryItem.count({
        where: { product: { imageUrl: { not: null } } },
      }),
    ]);

  console.log("\nsurfaces");
  console.log(`  watchlist rows with an image   ${watchedWithImage} of ${watchedTotal}`);
  console.log(`  pantry rows with an image      ${pantryWithImage} of ${pantryTotal}`);

  // Pantry items can be free-text with no product at all — those can never
  // have an image, and are a different problem from a product that simply
  // lacks one.
  const pantryNoProduct = await prisma.pantryItem.count({
    where: { productId: null },
  });
  console.log(`  pantry rows with no product    ${pantryNoProduct}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
