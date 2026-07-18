import { NextRequest, NextResponse } from "next/server";
export const maxDuration = 60;
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOctokit, createTreeAndCommit } from "@/lib/github";
import { scrapeFramerSite } from "@/lib/scraper";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { guardedScrape, SecurityError } from "@/lib/security";
import { z } from "zod";

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

  const idSchema = z.string().min(1).max(50);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  }
  const session = await getServerSessionWithToken();
  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(getRateLimitKey(req, `sync:${id}`), {
    windowMs: 300_000,
    maxRequests: 3,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

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
    // 1. Scrape the Framer site (with URL validation guard)
    const result = await guardedScrape(project.framerUrl, scrapeFramerSite);

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
    const rawMessage = err instanceof Error ? err.message : String(err);

    // Detect common failure modes and provide actionable messages
    let userMessage = rawMessage;
    let statusCode = 500;

    if (err instanceof SecurityError) {
      userMessage = `Security check failed: ${rawMessage}`;
      statusCode = 400;
    } else if (rawMessage.includes("FUNCTION_INVOCATION_TIMEOUT") || rawMessage.includes("Task timed out")) {
      userMessage = "Sync timed out — the site has too many pages/assets for the current server plan. Try a simpler site or upgrade to Vercel Pro for longer timeouts.";
      statusCode = 504;
    } else if (rawMessage.includes("browserType.launch") || rawMessage.includes("executable") || rawMessage.includes("Chromium")) {
      userMessage = "Browser engine failed to start. This may be a temporary serverless issue — please try again in a moment.";
    } else if (rawMessage.includes("Bad credentials") || rawMessage.includes("401")) {
      userMessage = "GitHub authentication failed. Please sign out and sign back in to refresh your access token.";
      statusCode = 401;
    } else if (rawMessage.includes("Not Found") && rawMessage.includes("404")) {
      userMessage = "GitHub repository not found. Make sure the repo exists and you have write access to it.";
      statusCode = 404;
    }

    try {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "error",
          errorMessage: userMessage,
          completedAt: new Date(),
        },
      });

      await prisma.project.update({
        where: { id: project.id },
        data: { status: "error" },
      });
    } catch (dbErr) {
      console.error("Failed to update sync log after error:", dbErr);
    }

    return NextResponse.json(
      { error: "Sync failed", message: userMessage },
      { status: statusCode }
    );
  }
}
