import { NextRequest, NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOctokit, rollbackToCommit } from "@/lib/github";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSessionWithToken();
  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { commitSha } = body;

  if (!commitSha || typeof commitSha !== "string") {
    return NextResponse.json({ error: "commitSha is required" }, { status: 400 });
  }

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
