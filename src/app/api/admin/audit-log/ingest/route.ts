import { NextResponse } from "next/server";
import { requireAdminWithRateLimit, rateLimitError } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { readFileSync } from "fs";

export async function POST(req: Request) {
  const auth = await requireAdminWithRateLimit(req);
  if (auth.retryAfterMs) return rateLimitError(auth.retryAfterMs);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const source = body.source || "/var/log/framerclone-actions.jsonl";

  let inserted = 0;
  let skipped = 0;

  try {
    const lines = readFileSync(source, "utf-8")
      .split("\n")
      .filter((line) => line.trim().length > 0);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const exists = await prisma.auditLog.findFirst({
          where: {
            action: entry.action,
            resource: entry.resource,
            createdAt: new Date(entry.timestamp),
          },
        });

        if (exists) {
          skipped++;
          continue;
        }

        await prisma.auditLog.create({
          data: {
            action: entry.action,
            resource: entry.resource,
            reason: entry.reason,
            decisionPoint: entry.decisionPoint,
            result: entry.result,
            acssLayer: entry.acssLayer,
            stopStep: entry.stopStep,
            metadata: JSON.stringify({
              timestamp: entry.timestamp,
              ...entry,
            }),
            createdAt: new Date(entry.timestamp),
          },
        });
        inserted++;
      } catch {
        skipped++;
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read source file", details: String(err) },
      { status: 500 }
    );
  }

  await logAudit({
    userId: auth.user?.id,
    action: "auditLog.ingest",
    resource: "auditLog",
    metadata: { source, inserted, skipped },
    ip: req.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json({ inserted, skipped, source });
}
