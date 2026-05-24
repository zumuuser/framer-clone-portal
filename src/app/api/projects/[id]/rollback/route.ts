import { NextRequest, NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOctokit, rollbackToCommit } from "@/lib/github";
import { z } from "zod";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";

const idSchema = z.string().min(1).max(50);
const commitShaSchema = z.string().regex(/^[a-f0-9]{7,40}$/i);

function rateLimitResponse(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfter: Math.ceil(retryAfterMs / 1000) },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSessionWithToken();
  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(getRateLimitKey(req, "rollback"), {
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsedSha = commitShaSchema.safeParse(body.commitSha);
  if (!parsedSha.success) {
    return NextResponse.json({ error: "commitSha must be a valid hex SHA" }, { status: 400 });
  }
  const commitSha = parsedSha.data;

  const [owner, repo] = project.githubRepo.split("/");
  if (!owner || !repo) {
    return NextResponse.json({ error: "Invalid GitHub repo format" }, { status: 400 });
  }

  const syncLog = await prisma.syncLog.create({
    data: {
      projectId: project.id,
      status: "running",
      commitMessage: `Rollback to ${commitSha.slice(0, 7)}`,
    },
  });

  try {
    const octokit = getOctokit(session.accessToken);
    await rollbackToCommit(octokit, owner, repo, project.githubBranch, commitSha);

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "success",
        commitSha,
        completedAt: new Date(),
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { status: "idle", lastSyncAt: new Date() },
    });

    return NextResponse.json({ success: true, commitSha });
  } catch (err: unknown) {
    console.error("Rollback failed:", err);
    const message = err instanceof Error ? err.message : String(err);

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "error",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { status: "error" },
    });

    return NextResponse.json({ error: "Rollback failed", message }, { status: 500 });
  }
}
