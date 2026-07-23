import { NextRequest, NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  framerDomain: z.string().min(1),
  githubRepo: z.string().min(1),
  githubBranch: z.string().default("main"),
  deployProvider: z
    .enum(["none", "cloudflare", "self-hosted"])
    .default("none"),
});

function rateLimitResponse(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfter: Math.ceil(retryAfterMs / 1000) },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
  );
}

export async function GET(req: NextRequest) {
  const session = await getServerSessionWithToken();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(getRateLimitKey(req, "projects:get"), {
    windowMs: 60_000,
    maxRequests: 100,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    include: { syncLogs: { orderBy: { startedAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await getServerSessionWithToken();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(getRateLimitKey(req, "projects:create"), {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const body = await req.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const { name, framerDomain, githubRepo, githubBranch, deployProvider } = parsed.data;
  const framerUrl = framerDomain.startsWith("http") ? framerDomain : `https://${framerDomain}`;

  const project = await prisma.project.create({
    data: {
      userId: session.user.id,
      name,
      framerDomain: framerDomain.replace(/^https?:\/\//, ""),
      framerUrl,
      githubRepo,
      githubBranch,
      deployProvider,
    },
  });

  return NextResponse.json(project, { status: 201 });
}
