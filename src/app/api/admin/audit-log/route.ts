import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { requireAdminWithRateLimit, validationError, rateLimitError, isRateLimitError } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const AuditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  acssLayer: z.enum(["Prevent", "Detect", "Verify", "Prove"]).optional(),
  stopStep: z.string().max(50).optional(),
  result: z.enum(["success", "failure", "partial", "pending"]).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdminWithRateLimit(req);
  if (auth.retryAfterMs) return rateLimitError(auth.retryAfterMs);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const parseResult = AuditLogQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parseResult.success) {
    return validationError(parseResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message })));
  }

  const { limit, offset, acssLayer, stopStep, result } = parseResult.data;

  const where: Record<string, unknown> = {};
  if (acssLayer) where.acssLayer = acssLayer;
  if (stopStep) where.stopStep = stopStep;
  if (result) where.result = result;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { user: { select: { email: true, name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  await logAudit({
    userId: auth.user?.id,
    action: "auditLog.view",
    resource: "auditLog",
    metadata: { limit, offset, acssLayer, stopStep, result },
    ip: req.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json({ logs, total });
}
