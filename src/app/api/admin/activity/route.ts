import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminWithRateLimit, validationError, rateLimitError } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const ActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  action: z.string().max(100).optional(),
  userId: z.string().min(1).max(50).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdminWithRateLimit(req);
  if ("retryAfterMs" in auth) return rateLimitError(auth.retryAfterMs);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const parseResult = ActivityQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parseResult.success) {
    return validationError(parseResult.error.errors.map((e) => ({ path: e.path, message: e.message })));
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

  return NextResponse.json({ logs, total, page, limit });
}
