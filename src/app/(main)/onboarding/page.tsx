import { prisma } from "@/lib/prisma";
import { loadShowcase } from "@/lib/showcase";
import { productImageSrc } from "@/lib/product-image";
import OnboardingClient, { type WatchSuggestion } from "./OnboardingClient";

/** How many everyday products onboarding offers to watch. */
const SUGGESTIONS = 5;

export default async function OnboardingPage() {
  const [stores, showcase] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, chain: true, name: true },
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

  return <OnboardingClient stores={stores} suggestions={suggestions} />;
}
