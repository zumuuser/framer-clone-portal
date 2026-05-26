import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminWithRateLimit, validationError, rateLimitError, isRateLimitError } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const ActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  action: z.string().max(100).optional(),
  userId: z.string().min(1).max(50).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdminWithRateLimit(req);
  if (auth.retryAfterMs) return rateLimitError(auth.retryAfterMs);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const parseResult = ActivityQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parseResult.success) {
    return validationError(parseResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message })));
  }

  const { page, limit, action, userId } = parseResult.data;

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
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ]);

  await logAudit({
    userId: auth.user?.id,
    action: "activity.view",
    resource: "activity",
    metadata: { page, limit, action, userId },
    ip: req.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json({ logs, total, page, limit });
}
