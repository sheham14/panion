import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { validateBody } from "@/lib/validate";
import { notFound } from "@/lib/api-error";
import { pantryFields } from "../route";

const UpdatePantryItemSchema = z.object(pantryFields).partial();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;
  const { data, error: invalid } = await validateBody(
    request,
    UpdatePantryItemSchema,
  );
  if (invalid) return invalid;

  // updateMany is already scoped to the caller, so this can't touch another
  // user's row.
  const item = await prisma.pantryItem.updateMany({
    where: { id, userId: user.id },
    data,
  });

  if (item.count === 0) {
    return notFound("Item not found");
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;

  const item = await prisma.pantryItem.deleteMany({
    where: { id, userId: user.id },
  });

  if (item.count === 0) {
    return notFound("Item not found");
  }

  return NextResponse.json({ success: true });
}
