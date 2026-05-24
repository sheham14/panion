import { Suspense } from "react";
import { auth } from "../../../auth";
import HomeClient from "@/components/home/HomeClient";
import HomePageSkeleton from "@/components/home/HomePageSkeleton";
import { getWatchlistSummary } from "@/lib/watchlist-summary";
import { prisma } from "@/lib/prisma";

async function HomeData() {
  const session = await auth();
  const userId = session!.user.id;

  const [data, hasUnreadAlerts] = await Promise.all([
    getWatchlistSummary(userId),
    prisma.alert.count({ where: { userId, readAt: null } }).then((n) => n > 0),
  ]);

  return (
    <HomeClient
      data={data}
      userName={session!.user.name ?? null}
      userImage={session!.user.image ?? null}
      hasUnreadAlerts={hasUnreadAlerts}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomePageSkeleton />}>
      <HomeData />
    </Suspense>
  );
}
