import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { validateBody } from "@/lib/validate";
import { notFound } from "@/lib/api-error";

// `digestFrequency: "banana"` previously reached Prisma and threw an invalid-
// enum 500. The enum is enforced here instead (audit H4).
const PreferencesSchema = z
  .object({
    emailNotifications: z.boolean(),
    pushNotifications: z.boolean(),
    marketingOptIn: z.boolean(),
    digestFrequency: z.enum(["immediate", "daily", "weekly", "none"]),
  })
  .partial();

export async function GET() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const prefs = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      emailNotifications: true,
      pushNotifications: true,
      marketingOptIn: true,
      digestFrequency: true,
    },
  });

  if (!prefs) return notFound("User not found");

  return NextResponse.json(prefs);
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { data, error: invalid } = await validateBody(request, PreferencesSchema);
  if (invalid) return invalid;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      emailNotifications: true,
      pushNotifications: true,
      marketingOptIn: true,
      digestFrequency: true,
    },
  });

  return NextResponse.json(updated);
}
