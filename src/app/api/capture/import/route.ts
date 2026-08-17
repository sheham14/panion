import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateBody, idSchema } from "@/lib/validate";
import { badRequest, forbidden, notFound } from "@/lib/api-error";
import { requireElevatedRole, canWriteStore } from "@/lib/admin/require-role";
import { resolveAndIngest } from "@/lib/admin/ingest-items";
import { parseCapture, matchNameFor } from "@/lib/capture/parse-capture";

/**
 * Import a browser capture: parse → resolve → preview or write.
 *
 * The capture arrives as the raw clipboard string from the bookmarklet, and is
 * parsed here rather than in the browser so that a retailer changing their
 * payload shape is a server-side fix instead of a bookmark reinstall.
 *
 * Nothing is fetched. The data came from a page a person opened in their own
 * browser — the distinction that makes this path legitimate where an automated
 * fetcher is not (DATA-SOURCING.md §1.1).
 */

const BodySchema = z.object({
  storeId: idSchema,
  /** Raw clipboard text. Parsed leniently — it is pasted by hand. */
  capture: z.string().min(2).max(8_000_000),
  dryRun: z.boolean().optional().default(true),
  skipIndexes: z.array(z.number().int().min(0)).max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const { user, role, managedStoreId, error } = await requireElevatedRole();
  if (error) return error;

  const { data, error: invalid } = await validateBody(req, BodySchema);
  if (invalid) return invalid;

  if (!canWriteStore(role, managedStoreId, data.storeId)) {
    return forbidden("You may not write prices for this store");
  }

  const store = await prisma.store.findUnique({
    where: { id: data.storeId },
    select: { id: true, name: true, isActive: true },
  });
  if (!store) return notFound("Store not found");
  if (!store.isActive) return badRequest("Store is not active");

  let payload: unknown;
  try {
    payload = JSON.parse(data.capture);
  } catch {
    return badRequest(
      "That doesn't look like a capture. Click the bookmarklet on a store " +
        "search page, then paste the whole clipboard here.",
    );
  }

  const parsed = parseCapture(payload);

  if (parsed.items.length === 0) {
    // The bookmarklet copies a diagnostic when it finds no products, so say so
    // rather than reporting a generic empty result.
    const hasDiagnostic =
      typeof payload === "object" &&
      payload !== null &&
      "diagnostic" in (payload as Record<string, unknown>);

    return badRequest(
      hasDiagnostic
        ? "The capture found no products on that page — it copied a diagnostic " +
            "instead. Paste it in a message so the extractor can be fixed."
        : "No usable products in that capture.",
    );
  }

  const now = new Date();
  const result = await resolveAndIngest({
    storeId: store.id,
    // Brand and size are folded into the name here: with no barcode from
    // either Walmart or Voilà, that string is the only identity a capture has,
    // and omitting size bypasses the size guard entirely.
    items: parsed.items.map((i) => ({
      name: matchNameFor(i),
      price: i.price,
      isSale: i.isSale,
      regularPrice: i.regularPrice,
      storeSku: i.storeSku,
    })),
    submittedBy: user.id,
    observedAt: now,
    now,
    dryRun: data.dryRun,
    skipIndexes: data.skipIndexes,
  });

  return NextResponse.json({
    dryRun: data.dryRun,
    store: { id: store.id, name: store.name },
    source: parsed.source,
    capturedFrom: parsed.url,
    skippedUnusable: parsed.skipped,
    ...result,
  });
}
