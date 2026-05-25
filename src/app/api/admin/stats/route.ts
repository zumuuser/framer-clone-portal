import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [userCount, projectCount, syncCount, recentSyncs, activeUsers, suspendedUsers, bannedUsers] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.syncLog.count(),
    prisma.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    prisma.user.count({ where: { status: "active" } }),
    prisma.user.count({ where: { status: "suspended" } }),
    prisma.user.count({ where: { status: "banned" } }),
  ]);

  return NextResponse.json({
    users: userCount,
    projects: projectCount,
    syncs: syncCount,
    activeUsers,
    suspendedUsers,
    bannedUsers,
    recentSyncs,
  });
}
