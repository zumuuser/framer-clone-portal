import { prisma } from "./prisma";

export interface ActionLogInput {
  action: string;
  resource: string;
  metadata?: Record<string, unknown>;
  reason: string;
  decisionPoint: string;
  result: "success" | "failure" | "partial" | "pending";
  acssLayer: "Prevent" | "Detect" | "Verify" | null;
  stopStep: "Search" | "Test" | "Observe" | "Prove" | null;
  userId?: string;
  ip?: string;
}

export async function logAction(input: ActionLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        resource: input.resource,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        reason: input.reason,
        decisionPoint: input.decisionPoint,
        result: input.result,
        acssLayer: input.acssLayer,
        stopStep: input.stopStep,
        userId: input.userId || null,
        ip: input.ip || null,
      },
    });
  } catch (e) {
    console.error("[ActionLog] Failed to log action:", input.action, e);
  }
}

export async function getActionLogs(options?: {
  acssLayer?: string;
  stopStep?: string;
  result?: string;
  limit?: number;
  offset?: number;
}) {
  const { acssLayer, stopStep, result, limit = 100, offset = 0 } = options || {};
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

  return { logs, total };
}
