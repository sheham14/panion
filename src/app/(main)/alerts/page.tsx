import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, redirectToSignIn } from "@/lib/auth-utils";
import { Suspense } from "react";
import AlertsClient from "@/components/alerts/AlertsClient";

export type AlertPayload = {
  productName: string;
  emoji: string;
  oldPrice: number;
  newPrice: number;
  storeName: string;
  storeColor: string;
  productId?: string;
};

export type SerializedAlert = {
  id: string;
  type: string;
  payload: AlertPayload;
  readAt: string | null;
  createdAt: string;
};

async function AlertsData({ userId }: { userId: string }) {
  const alerts = await prisma.alert.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const serialized: SerializedAlert[] = alerts.map((a) => ({
    id: a.id,
    type: a.type,
    payload: a.payload as AlertPayload,
    readAt: a.readAt ? a.readAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  }));

  return <AlertsClient initialAlerts={serialized} />;
}

function AlertsSkeleton() {
  return (
    <div className="animate-pulse px-4 pt-4 flex flex-col gap-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="h-[72px] rounded-xl bg-[#f4f4f4] dark:bg-[#242b2e]"
        />
      ))}
    </div>
  );
}

export default async function AlertsPage() {
  const { user, error } = await getAuthenticatedUser();
  if (error) redirectToSignIn();

  return (
    <div className="bg-[#f7f7f7] dark:bg-[#161b1e] min-h-screen">
      <Suspense fallback={<AlertsSkeleton />}>
        <AlertsData userId={user!.id} />
      </Suspense>
    </div>
  );
}
