import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      githubId: true,
      role: true,
      status: true,
      lastLoginAt: true,
      lastIp: true,
      createdAt: true,
      updatedAt: true,
      projects: {
        select: {
          id: true,
          name: true,
          framerDomain: true,
          githubRepo: true,
          status: true,
          lastSyncAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      sessions: {
        select: { id: true, expires: true },
        orderBy: { expires: "desc" },
        take: 5,
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}
