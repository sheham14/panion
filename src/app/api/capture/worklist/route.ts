import { NextRequest, NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api-error";
import { requireElevatedRole, canWriteStore } from "@/lib/admin/require-role";
import { buildWorklist, searchUrlFor } from "@/lib/capture/worklist";

/**
 * What is worth capturing next at one store.
 *
 * Served per store rather than rendered once with the page: the worklist is
 * only meaningful for the store being captured, and the page cannot know which
 * that is until the dropdown is set. Rendering it for whichever store happened
 * to sort first produced a panel for Colemans — a store with no prices and no
 * search path — on every visit.
 */
export async function GET(req: NextRequest) {
  const { role, managedStoreId, error } = await requireElevatedRole();
  if (error) return error;

  const storeId = req.nextUrl.searchParams.get("storeId");
  if (!storeId) return badRequest("storeId is required");
  if (!canWriteStore(role, managedStoreId, storeId)) {
    return NextResponse.json({ rows: [], storeName: null });
  }

  const worklist = await buildWorklist(storeId);
  if (!worklist) return notFound("Store not found");

  const rows = worklist.rows.slice(0, 8).map((r) => ({
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
  }));

  return NextResponse.json({
    storeName: worklist.storeName,
    chain: worklist.chain,
    rows,
  });
}
