import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { bookmarkletHref } from "@/lib/capture/bookmarklet";
import { buildWorklist, searchUrlFor } from "@/lib/capture/worklist";
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

  // The bookmarklet posts to this deployment's own origin. Read it from the
  // request so a local checkout and production each get a working bookmark
  // without configuration.
  const h = await headers();
  const host = h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : null;

  const [tokenRow, pendingBatches] = await Promise.all([
    prisma.captureToken.findFirst({
      where: { userId: user.id, revokedAt: null },
      select: { hint: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.captureBatch.findMany({
      where: { userId: user.id, status: "pending" },
      select: {
        id: true,
        source: true,
        url: true,
        itemCount: true,
        capturedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  // The worklist is per-store; default to the first store the user may write.
  const firstStore = stores[0];
  const worklist = firstStore ? await buildWorklist(firstStore.id) : null;

  const worklistRows =
    worklist?.rows.slice(0, 8).map((r) => ({
      category: r.category,
      missing: r.missing,
      covered: r.covered,
      links: r.groups
        .map((g) => ({
          term: g.term,
          missing: g.missing,
          examples: g.examples,
          url: searchUrlFor(worklist.chain, g.term),
        }))
        .filter(
          (l): l is { term: string; missing: number; examples: string[]; url: string } =>
            l.url !== null,
        )
        .slice(0, 16),
    })) ?? [];

  return (
    <ImportClient
      stores={stores}
      // Only the token's hash is stored, so the server cannot embed one it did
      // not just mint. This href is the no-token fallback — it copies to the
      // clipboard, the original behaviour. The client rebuilds it with the
      // plaintext at the moment a token is generated.
      bookmarkletHref={bookmarkletHref({ origin })}
      origin={origin}
      hasToken={tokenRow !== null}
      tokenHint={tokenRow?.hint ?? null}
      tokenLastUsedAt={tokenRow?.lastUsedAt?.toISOString() ?? null}
      pendingBatches={pendingBatches.map((b) => ({
        ...b,
        capturedAt: b.capturedAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
      }))}
      worklist={worklistRows}
      worklistStoreName={worklist?.storeName ?? null}
    />
  );
}
