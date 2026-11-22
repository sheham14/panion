import { prisma } from "@/lib/prisma";
import { loadShowcase } from "@/lib/showcase";
import { productImageSrc } from "@/lib/product-image";
import OnboardingClient, { type WatchSuggestion } from "./OnboardingClient";

// Read the stores and their price counts per request. Nothing here touches
// cookies or headers, so Next prerendered the page at build time and every
// signup saw the catalogue as it was on the last deploy.
export const dynamic = "force-dynamic";

/** How many everyday products onboarding offers to watch. */
const SUGGESTIONS = 5;

/**
 * Stores preselected for a new account: those with enough prices to price an
 * ordinary list. No Frills has a handful from one flyer and Colemans and
 * Costco none, so preselecting them made every comparison look incomplete.
 * They stay on screen, unselected and marked, for a shopper who wants them.
 */
const PRESELECT_MIN_PRICES = 50;

export default async function OnboardingPage() {
  const [stores, showcase] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        chain: true,
        name: true,
        _count: {
          select: { storeProducts: { where: { isActive: true, currentPrice: { not: null } } } },
        },
      },
    }),
    loadShowcase(),
  ]);

  // Real catalogue rows. These were hard-coded ids from the deleted seed, so
  // the watchlist insert failed on its foreign key and took the whole
  // onboarding transaction with it.
  const suggestions: WatchSuggestion[] = showcase.slice(0, SUGGESTIONS).map((p) => {
    // Store rows come cheapest first.
    const cheapest = p.storeProducts[0];
    return {
      id: p.id,
      name: p.unitSize ? `${p.name} — ${p.unitSize}` : p.name,
      imageSrc: productImageSrc(p.id, p.imageUrl),
      price: cheapest
        ? `From $${Number(cheapest.currentPrice).toFixed(2)} at ${cheapest.store.name}`
        : null,
    };
  });

  const storeRows = stores.map(({ _count, ...s }) => ({
    ...s,
    hasPrices: _count.storeProducts > 0,
    preselect: _count.storeProducts >= PRESELECT_MIN_PRICES,
  }));

  return <OnboardingClient stores={storeRows} suggestions={suggestions} />;
}
