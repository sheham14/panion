import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateBody, idSchema } from "@/lib/validate";
import { notFound } from "@/lib/api-error";
import { requireElevatedRole } from "@/lib/admin/require-role";

/**
 * The pending capture queue.
 *
 * GET lists what the bookmarklet has queued for this user; DELETE discards one
 * without importing it. Both are session-gated — the token only ever grants
 * *enqueue*, never read or write (see `/api/capture/submit`).
 */

export async function GET() {
  const { user, error } = await requireElevatedRole();
  if (error) return error;

  const batches = await prisma.captureBatch.findMany({
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
  });

  return NextResponse.json({ batches });
}

const DeleteSchema = z.object({ batchId: idSchema });

export async function DELETE(req: NextRequest) {
  const { user, error } = await requireElevatedRole();
  if (error) return error;

  const { data, error: invalid } = await validateBody(req, DeleteSchema);
  if (invalid) return invalid;

  // Scoped to the caller's own batches, so an id from elsewhere is a 404.
  const { count } = await prisma.captureBatch.updateMany({
    where: { id: data.batchId, userId: user.id, status: "pending" },
    data: { status: "discarded", reviewedAt: new Date() },
  });

  if (count === 0) return notFound("Capture not found");

  return NextResponse.json({ ok: true });
}
