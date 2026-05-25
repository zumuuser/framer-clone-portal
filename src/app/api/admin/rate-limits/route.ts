import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAllRateLimitConfigs, setRateLimitConfig } from "@/lib/rate-limit-config";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const configs = await getAllRateLimitConfigs();
  return NextResponse.json(configs);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const { route, windowMs, maxRequests, description } = body;

  if (!route || typeof windowMs !== "number" || typeof maxRequests !== "number") {
    return NextResponse.json({ error: "route, windowMs, maxRequests required" }, { status: 400 });
  }

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
