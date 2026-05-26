import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { requireAdminWithRateLimit, validationError, rateLimitError, isRateLimitError } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const UserIdSchema = z.object({
  id: z.string().min(1).max(50),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminWithRateLimit(_req);
  if (auth.retryAfterMs) return rateLimitError(auth.retryAfterMs);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parseResult = UserIdSchema.safeParse({ id });
  if (!parseResult.success) {
    return validationError(parseResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message })));
  }

  const user = await prisma.user.findUnique({
    where: { id: parseResult.data.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      githubId: true,
      role: true,
      status: true,
      lastLoginAt: true,
      lastIp: true,
      createdAt: true,
      updatedAt: true,
      projectLimit: true,
      projects: {
        select: {
          id: true,
          name: true,
          framerDomain: true,
          githubRepo: true,
          status: true,
          lastSyncAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      sessions: {
        select: { id: true, expires: true },
        orderBy: { expires: "desc" },
        take: 5,
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await logAudit({
    userId: auth.user?.id,
    action: "user.view",
    resource: `user:${id}`,
    metadata: { userId: id },
    ip: _req.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json(user);
}
