import { prisma } from "@/lib/prisma";
import OnboardingClient from "./OnboardingClient";

export default async function OnboardingPage() {
  const stores = await prisma.store.findMany({
    where: { isActive: true, chain: { not: "costco" } },
    orderBy: { name: "asc" },
    select: { id: true, chain: true, name: true },
  });

  return <OnboardingClient stores={stores} />;
}