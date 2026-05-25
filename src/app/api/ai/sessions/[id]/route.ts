import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  if (cookieStore.get("panion-guest")?.value === "1") {
    return NextResponse.json({ id: "guest-session", title: null, messages: [] });
  }

  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;

  const session = await prisma.aiChatSession.findFirst({
    where: { id, userId: user.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(session);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  if (cookieStore.get("panion-guest")?.value === "1") {
    return NextResponse.json({ success: true });
  }

  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;
  const { title } = await request.json();

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const session = await prisma.aiChatSession.findFirst({
    where: { id, userId: user.id },
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.aiChatSession.update({
    where: { id },
    data: { title: title.trim() },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  if (cookieStore.get("panion-guest")?.value === "1") {
    return NextResponse.json({ success: true });
  }

  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { id } = await params;

  const session = await prisma.aiChatSession.findFirst({
    where: { id, userId: user.id },
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.aiChatSession.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
