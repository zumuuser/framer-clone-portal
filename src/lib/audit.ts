import { prisma } from ./prisma;

export async function logAudit({
  userId,
  action,
  resource,
  metadata,
  ip,
}: {
  userId?: string;
  action: string;
  resource: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ip,
      },
    });
  } catch (err) {
    console.error([AuditLog] Failed to log:, err);
  }
}
