import { NextRequest, NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOctokit, createTreeAndCommit } from "@/lib/github";
import { scrapeFramerSite } from "@/lib/scraper";

export async function POST(
  _req: NextRequest,
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

  // Concurrency lock: prevent double-sync
  if (project.status === "syncing") {
    return NextResponse.json({ error: "Sync already in progress" }, { status: 409 });
  }

  // Create sync log entry
  const syncLog = await prisma.syncLog.create({
    data: {
      projectId: project.id,
      status: "running",
    },
  });

  // Update project status
  await prisma.project.update({
    where: { id: project.id },
    data: { status: "syncing" },
  });

  try {
    // 1. Scrape the Framer site
    const result = await scrapeFramerSite(project.framerUrl);

    // 2. Check for changes
    const changesDetected = !project.lastContentHash || project.lastContentHash !== result.contentHash;

    if (!changesDetected) {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "success",
          changesDetected: false,
          completedAt: new Date(),
        },
      });
      await prisma.project.update({
        where: { id: project.id },
        data: { status: "idle", lastSyncAt: new Date() },
      });
      return NextResponse.json({ success: true, changesDetected: false });
    }

    // 3. Push to GitHub
    const octokit = getOctokit(session.accessToken);
    const [owner, repo] = project.githubRepo.split("/");

    if (!owner || !repo) {
      throw new Error("Invalid GitHub repo format. Expected: owner/repo");
    }

    // Add deployment config files
    const deployFiles = [...result.files];

    if (project.deployProvider === "netlify") {
      deployFiles.push({
        path: "netlify.toml",
        content: Buffer.from(
          `[build]\n  publish = "."\n\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`,
          "utf-8"
        ),
      });
      deployFiles.push({
        path: "_redirects",
        content: Buffer.from("/* /index.html 200\n", "utf-8"),
      });
    }

    const commitSha = await createTreeAndCommit(
      octokit,
      owner,
      repo,
      project.githubBranch,
      deployFiles,
      `FramerClone sync: ${project.framerDomain} (${new Date().toISOString()})`
    );

    // 4. Update database
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "success",
        changesDetected: true,
        filesChanged: deployFiles.length,
        commitSha,
        commitMessage: `FramerClone sync: ${project.framerDomain}`,
        completedAt: new Date(),
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: "idle",
        lastSyncAt: new Date(),
        lastContentHash: result.contentHash,
      },
    });

    return NextResponse.json({
      success: true,
      changesDetected: true,
      commitSha,
      filesChanged: deployFiles.length,
    });
  } catch (err: unknown) {
    console.error("Sync failed:", err);
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

    return NextResponse.json(
      { error: "Sync failed", message },
      { status: 500 }
    );
  }
}
