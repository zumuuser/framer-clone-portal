import { NextRequest, NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { getOctokit, listRepos, createRepo } from "@/lib/github";
import { z } from "zod";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";

function rateLimitResponse(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfter: Math.ceil(retryAfterMs / 1000) },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
  );
}

const createRepoSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Repo name can only contain letters, numbers, hyphens, underscores, and dots"
    ),
  description: z.string().max(350).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSessionWithToken();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(getRateLimitKey(req, "github:repos:get"), {
    windowMs: 60_000,
    maxRequests: 60,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  try {
    const octokit = getOctokit(session.accessToken);
    const repos = await listRepos(octokit);
    return NextResponse.json(repos);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to fetch repos", message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSessionWithToken();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(getRateLimitKey(req, "github:repos:create"), {
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  try {
    const body = await req.json();
    const parsed = createRepoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }
    const octokit = getOctokit(session.accessToken);
    const repo = await createRepo(octokit, parsed.data.name, parsed.data.description);
    return NextResponse.json(repo, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to create repo", message },
      { status: 500 }
    );
  }
}
