import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { bookmarkletHref } from "@/lib/capture/bookmarklet";
import ImportClient from "@/components/admin/ImportClient";

/**
 * Manual price import — the only source with no asterisk on it.
 *
 * Every automated path is compromised in some way: PC Express and Voilà
 * disallow the endpoints in use, Walmart permits crawling but blocks it with
 * PerimeterX, and Flipp only ever returns flyer specials. Prices read by a
 * person from a page they opened themselves carry none of that, which is why
 * this page exists rather than a fourth scraper.
 */
export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const { user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  // Role is read from the database, never trusted from the session — a stale
  // token must not retain write access after a demotion.
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, managedStoreId: true, deletedAt: true },
  });

  const elevated =
    record !== null &&
    record.deletedAt === null &&
    (record.role === "moderator" || record.role === "store_admin");

  if (!elevated) redirect("/");

  const stores = await prisma.store.findMany({
    where: {
      isActive: true,
      // A store admin may only write to the store they manage.
      ...(record.role === "store_admin" && record.managedStoreId
        ? { id: record.managedStoreId }
        : {}),
    },
    select: { id: true, name: true, chain: true },
    orderBy: { name: "asc" },
  });

  return (
    <ImportClient stores={stores} bookmarkletHref={bookmarkletHref()} />
  );
}
