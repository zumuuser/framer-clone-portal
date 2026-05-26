import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { NextResponse } from "next/server";
import { checkRateLimit, getRateLimitKey } from "./rate-limit";
import type { Session } from "next-auth";

export async function requireAdmin() {
  const session = (await getServerSession(authOptions)) as Session | null;
  if (!session?.user?.email) {
    return { error: "Unauthorized", status: 401 };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, email: true },
  });

  if (!user || user.role !== "admin") {
    return { error: "Forbidden: Admin access required", status: 403 };
  }

  return { user };
}

/** Require admin + apply rate limiting (30 req/min per IP) */
export async function requireAdminWithRateLimit(req: Request) {
  const rateLimit = checkRateLimit(getRateLimitKey(req, "admin"), {
    windowMs: 60_000,
    maxRequests: 30,
  });

  if (!rateLimit.allowed) {
    return { error: "Rate limit exceeded", status: 429, retryAfterMs: rateLimit.retryAfterMs };
  }

  const session = (await getServerSession(authOptions)) as Session | null;
  if (!session?.user?.email) {
    return { error: "Unauthorized", status: 401 };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, email: true },
  });

  if (!user || user.role !== "admin") {
    return { error: "Forbidden: Admin access required", status: 403 };
  }

  return { user };
}

export function adminJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Helper to return Zod validation errors (Zod v4 compatible) */
export function validationError(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    { error: "Validation failed", issues },
    { status: 400 }
  );
}

/** Helper to return rate limit errors */
export function rateLimitError(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfterMs },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    }
  );
}

/** Type guard to check if auth result is a rate limit error */
export function isRateLimitError(auth: { retryAfterMs?: number }): auth is { retryAfterMs: number } {
  return auth.retryAfterMs !== undefined;
}
