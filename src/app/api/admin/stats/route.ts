import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [
    totalUsers,
    totalProjects,
    totalSyncs,
    recentSyncs,
    syncSuccessRate,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.syncLog.count(),
    prisma.syncLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { project: { select: { name: true } } },
    }),
    prisma.syncLog.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  const successCount = syncSuccessRate.find((s) => s.status === "success")?._count.status ?? 0;
  const errorCount = syncSuccessRate.find((s) => s.status === "error")?._count.status ?? 0;
  const total = successCount + errorCount;
  const successRate = total > 0 ? Math.round((successCount / total) * 100) : 100;

  return NextResponse.json({
    totalUsers,
    totalProjects,
    totalSyncs,
    recentSyncs: recentSyncs.map((s) => ({
      id: s.id,
      projectName: s.project?.name ?? "Unknown",
      status: s.status,
      changesDetected: s.changesDetected,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      errorMessage: s.errorMessage,
    })),
    syncSuccessRate: successRate,
    syncBreakdown: syncSuccessRate,
  });
}
