import { NextResponse } from next/server;
import { requireAdmin } from @/lib/admin;
import { prisma } from @/lib/prisma;

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get(page) || 1);
  const limit = parseInt(searchParams.get(limit) || 50);
  const action = searchParams.get(action) || undefined;
  const userId = searchParams.get(userId) || undefined;

  const where: any = {};
  if (action) where.action = action;
  if (userId) where.userId = userId;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: desc },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
