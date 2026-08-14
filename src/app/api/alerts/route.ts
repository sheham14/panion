import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { parsePagination } from "@/lib/query-params";

export async function GET(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.alert.count({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({
    alerts,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
