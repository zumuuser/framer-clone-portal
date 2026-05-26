import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminWithRateLimit, validationError, rateLimitError } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const GetUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  status: z.enum(["active", "suspended", "banned"]).optional(),
  role: z.enum(["user", "admin"]).optional(),
});

const PatchUserBodySchema = z.object({
  userId: z.string().min(1).max(50),
  role: z.enum(["user", "admin"]).optional(),
  status: z.enum(["active", "suspended", "banned"]).optional(),
  projectLimit: z.coerce.number().int().min(0).max(1000).optional(),
}).refine((data) => data.role !== undefined || data.status !== undefined || data.projectLimit !== undefined, {
  message: "At least one of role, status, or projectLimit must be provided",
});

export async function GET(req: Request) {
  const auth = await requireAdminWithRateLimit(req);
  if ("retryAfterMs" in auth) return rateLimitError(auth.retryAfterMs);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const parseResult = GetUsersQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parseResult.success) {
    return validationError(parseResult.error.errors.map((e) => ({ path: e.path, message: e.message })));
  }

  const { page, limit, search, status, role } = parseResult.data;

  const where: any = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { githubId: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;
  if (role) where.role = role;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        githubId: true,
        role: true,
        status: true,
        lastLoginAt: true,
        lastIp: true,
        createdAt: true,
        _count: { select: { projects: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, limit });
}

export async function PATCH(req: Request) {
  const auth = await requireAdminWithRateLimit(req);
  if ("retryAfterMs" in auth) return rateLimitError(auth.retryAfterMs);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parseResult = PatchUserBodySchema.safeParse(body);
  if (!parseResult.success) {
    return validationError(parseResult.error.errors.map((e) => ({ path: e.path, message: e.message })));
  }

  const { userId, role, status, projectLimit } = parseResult.data;

  const updateData: any = {};
  if (role !== undefined) updateData.role = role;
  if (status !== undefined) updateData.status = status;
  if (projectLimit !== undefined) updateData.projectLimit = projectLimit;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: { id: true, email: true, role: true, status: true, projectLimit: true },
  });

  await logAudit({
    userId: auth.user?.id,
    action: "user.update",
    resource: `user:${userId}`,
    metadata: updateData,
    ip: req.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json(updated);
}
