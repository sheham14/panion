import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { conflict, notFound } from "@/lib/api-error";
import { DELETION_GRACE_DAYS } from "@/lib/inngest/functions/purge-deleted-accounts";

/** Request account deletion. Honoured by the `purge-deleted-accounts` cron. */
export async function POST() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const userData = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, deletionRequestedAt: true, anonymizedAt: true },
  });

  if (!userData || userData.anonymizedAt) return notFound("User not found");

  if (userData.deletionRequestedAt) {
    return conflict("Deletion has already been requested for this account");
  }

  const requestedAt = new Date();
  const scheduledFor = new Date(
    requestedAt.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { deletionRequestedAt: requestedAt },
  });

  return NextResponse.json({
    message: `Deletion requested. Your personal data will be permanently removed on ${scheduledFor.toISOString().slice(0, 10)}. You can cancel any time before then.`,
    requestedAt,
    scheduledFor,
    graceDays: DELETION_GRACE_DAYS,
  });
}

/**
 * Cancel a pending deletion request.
 *
 * Previously `deletionRequestedAt` had no un-set path, so a user who changed
 * their mind was stuck with a 409 forever (audit C2).
 */
export async function DELETE() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const userData = await prisma.user.findUnique({
    where: { id: user.id },
    select: { deletionRequestedAt: true, anonymizedAt: true },
  });

  if (!userData || userData.anonymizedAt) return notFound("User not found");

  if (!userData.deletionRequestedAt) {
    return conflict("No pending deletion request to cancel");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { deletionRequestedAt: null },
  });

  return NextResponse.json({ message: "Deletion request cancelled." });
}
