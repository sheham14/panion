import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import HomeClient from "@/components/home/HomeClient";
import HomePageSkeleton from "@/components/home/HomePageSkeleton";
import { getWatchlistSummary } from "@/lib/watchlist-summary";
import { GUEST_WATCHLIST_SUMMARY } from "@/lib/guest-data";
import { prisma } from "@/lib/prisma";

async function HomeData() {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get("panion-guest")?.value === "1";

  if (isGuest) {
    return (
      <HomeClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data={GUEST_WATCHLIST_SUMMARY as any}
        userName="Guest"
        userImage={null}
        hasUnreadAlerts={false}
      />
    );
  }

  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const userId = session.user.id;

  const [data, hasUnreadAlerts] = await Promise.all([
    getWatchlistSummary(userId),
    prisma.alert.count({ where: { userId, readAt: null } }).then((n) => n > 0),
  ]);

  return (
    <HomeClient
      data={data}
      userName={session.user.name ?? null}
      userImage={session.user.image ?? null}
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
