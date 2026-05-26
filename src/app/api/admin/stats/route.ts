import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [
    totalUsers,
    totalProjects,
    totalSyncs,
    recentSyncs,
    activeUsers,
    suspendedUsers,
    bannedUsers,
    successSyncs,
    errorSyncs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.syncLog.count(),
    prisma.syncLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { project: { select: { name: true } } },
    }),
    prisma.user.count({ where: { status: "active" } }),
    prisma.user.count({ where: { status: "suspended" } }),
    prisma.user.count({ where: { status: "banned" } }),
    prisma.syncLog.count({ where: { status: "success" } }),
    prisma.syncLog.count({ where: { status: "error" } }),
  ]);

  const syncSuccessRate = totalSyncs > 0 ? Math.round((successSyncs / totalSyncs) * 100) : 0;

  const syncBreakdown = [
    { status: "success", _count: { status: successSyncs } },
    { status: "error", _count: { status: errorSyncs } },
    { status: "other", _count: { status: totalSyncs - successSyncs - errorSyncs } },
  ];

  // Format recent syncs to match frontend interface
  const formattedRecentSyncs = recentSyncs.map((sync) => ({
    id: sync.id,
    projectName: sync.project?.name || "Unknown",
    status: sync.status,
    changesDetected: sync.changesDetected,
    startedAt: sync.startedAt.toISOString(),
    errorMessage: sync.errorMessage,
  }));

  return NextResponse.json({
    totalUsers,
    totalProjects,
    totalSyncs,
    syncSuccessRate,
    recentSyncs: formattedRecentSyncs,
    syncBreakdown,
    activeUsers,
    suspendedUsers,
    bannedUsers,
  });
}
