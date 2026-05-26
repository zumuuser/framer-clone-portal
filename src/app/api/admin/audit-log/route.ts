import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminWithRateLimit, validationError, rateLimitError } from "@/lib/admin";
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
  if ("retryAfterMs" in auth) return rateLimitError(auth.retryAfterMs);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const parseResult = AuditLogQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parseResult.success) {
    return validationError(parseResult.error.errors.map((e) => ({ path: e.path, message: e.message })));
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

  return NextResponse.json({ logs, total });
}
