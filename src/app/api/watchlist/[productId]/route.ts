import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  notifyOnDrop: z.boolean().optional(),
  notifyOnRise: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { productId } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updated = await prisma.watchlist.updateMany({
    where: { userId: user.id, productId },
    data: parsed.data,
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { productId } = await params;

  await prisma.watchlist.deleteMany({
    where: { userId: user.id, productId },
  });

  return NextResponse.json({ success: true });
}
