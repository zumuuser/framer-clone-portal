import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminWithRateLimit, validationError, rateLimitError, isRateLimitError } from "@/lib/admin";
import { getAllRateLimitConfigs, setRateLimitConfig } from "@/lib/rate-limit-config";
import { logAudit } from "@/lib/audit";

const PostRateLimitBodySchema = z.object({
  route: z.string().min(1).max(200).regex(/^\//, "Route must start with /"),
  windowMs: z.number().int().min(1000).max(86400000),
  maxRequests: z.number().int().min(1).max(100000),
  description: z.string().max(500).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdminWithRateLimit(req);
  if (auth.retryAfterMs) return rateLimitError(auth.retryAfterMs);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const configs = await getAllRateLimitConfigs();

  await logAudit({
    userId: auth.user?.id,
    action: "rateLimit.list",
    resource: "rateLimits",
    metadata: { count: configs.length },
    ip: req.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json(configs);
}

export async function POST(req: Request) {
  const auth = await requireAdminWithRateLimit(req);
  if (auth.retryAfterMs) return rateLimitError(auth.retryAfterMs);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parseResult = PostRateLimitBodySchema.safeParse(body);
  if (!parseResult.success) {
    return validationError(parseResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message })));
  }

  const { route, windowMs, maxRequests, description } = parseResult.data;
  const updated = await setRateLimitConfig({ route, windowMs, maxRequests, description });

  await logAudit({
    userId: auth.user?.id,
    action: "rateLimit.update",
    resource: `rateLimit:${route}`,
    metadata: { windowMs, maxRequests },
    ip: req.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json(updated);
}
