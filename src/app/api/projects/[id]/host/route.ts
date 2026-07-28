import { NextRequest, NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOctokit, createTreeAndCommit } from "@/lib/github";
import { scrapeFramerSite } from "@/lib/scraper";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { guardedScrape, SecurityError } from "@/lib/security";
import { getUserCloudflareAuth } from "@/lib/cloudflare-user";
import {
  deployPagesFiles,
  getOrCreatePagesProject,
  slugifyProjectName,
} from "@/lib/cloudflare";
import { z } from "zod";

export const maxDuration = 300;

function rateLimitResponse(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfter: Math.ceil(retryAfterMs / 1000) },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
  );
}

/**
 * One-click Host:
 * 1. Scrape Framer site
 * 2. Push to GitHub
 * 3. Deploy to Cloudflare Pages (requires CF connected)
 * Domain setup is left to the user in Cloudflare dashboard.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = z.string().min(1).max(50).safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  }

  const session = await getServerSessionWithToken();
  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(getRateLimitKey(req, `host:${id}`), {
    windowMs: 300_000,
    maxRequests: 3,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  // Cloudflare required for full host
  const cf = await getUserCloudflareAuth(session.user.id);
  if (!cf.ok) {
    return NextResponse.json(
      {
        error: "cloudflare_required",
        reason: cf.reason,
        message: cf.message,
      },
      { status: 412 }
    );
  }

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (project.status === "syncing") {
    const lockAgeMs = Date.now() - new Date(project.updatedAt).getTime();
    if (lockAgeMs < 180_000) {
      return NextResponse.json({ error: "Host already in progress" }, { status: 409 });
    }
    await prisma.syncLog.updateMany({
      where: { projectId: project.id, status: "running" },
      data: {
        status: "error",
        errorMessage: "Host was interrupted",
        completedAt: new Date(),
      },
    });
  }

  const syncLog = await prisma.syncLog.create({
    data: { projectId: project.id, status: "running" },
  });
  await prisma.project.update({
    where: { id: project.id },
    data: { status: "syncing" },
  });

  try {
    // 1. Scrape
    const result = await guardedScrape(project.framerUrl, scrapeFramerSite);

    // 2. Push GitHub (always on host so repo stays source of truth)
    const octokit = getOctokit(session.accessToken);
    const [owner, repo] = project.githubRepo.split("/");
    if (!owner || !repo) {
      throw new Error("Invalid GitHub repo format. Expected: owner/repo");
    }

    const deployFiles = [...result.files];
    // Cloudflare Pages SPA redirect
    if (!deployFiles.some((f) => f.path === "_redirects")) {
      deployFiles.push({
        path: "_redirects",
        content: Buffer.from("/*    /index.html   200\n", "utf-8"),
      });
    }

    const commitSha = await createTreeAndCommit(
      octokit,
      owner,
      repo,
      project.githubBranch,
      deployFiles,
      `FramerClone host: ${project.framerDomain} (${new Date().toISOString()})`
    );

    // 3. Cloudflare Pages
    const cfProjectName =
      project.cloudflareProjectName ||
      slugifyProjectName(
        project.name || project.framerDomain.replace(/\./g, "-")
      );

    const pagesProject = await getOrCreatePagesProject(
      cf.auth.token,
      cf.auth.accountId,
      cfProjectName
    );
    if (!pagesProject.success) {
      throw new Error(`Cloudflare Pages project: ${pagesProject.error}`);
    }

    const deployment = await deployPagesFiles(
      cf.auth.token,
      cf.auth.accountId,
      cfProjectName,
      deployFiles
    );
    if (!deployment.success) {
      throw new Error(`Cloudflare deploy failed: ${deployment.error}`);
    }

    const deployUrl =
      deployment.result.url ||
      `https://${cfProjectName}.pages.dev`;

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "success",
        changesDetected: true,
        filesChanged: deployFiles.length,
        commitSha,
        commitMessage: `Hosted on Cloudflare Pages: ${deployUrl}`,
        completedAt: new Date(),
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: "idle",
        lastSyncAt: new Date(),
        lastDeployAt: new Date(),
        lastContentHash: result.contentHash,
        deployProvider: "cloudflare",
        deployUrl,
        cloudflareProjectName: cfProjectName,
        cloudflareDeployUrl: deployUrl,
      },
    });

    return NextResponse.json({
      success: true,
      commitSha,
      filesChanged: deployFiles.length,
      deployUrl,
      cloudflareProjectName: cfProjectName,
      pagesDevUrl: `https://${cfProjectName}.pages.dev`,
      domainSetup: {
        message:
          "Site is live on Cloudflare Pages. Custom domain is the only remaining step.",
        steps: [
          `Open https://dash.cloudflare.com → Workers & Pages → ${cfProjectName}`,
          "Custom domains → Set up a domain",
          "Add the domain you own and follow DNS instructions",
          "If the domain is already on Cloudflare, it can attach in one click",
        ],
        dashboardUrl: `https://dash.cloudflare.com/?to=/:account/pages/view/${cfProjectName}`,
      },
    });
  } catch (err: unknown) {
    console.error("Host failed:", err);
    const rawMessage = err instanceof Error ? err.message : String(err);
    let userMessage = rawMessage;
    let statusCode = 500;

    if (err instanceof SecurityError) {
      userMessage = `Security check failed: ${rawMessage}`;
      statusCode = 400;
    } else if (rawMessage.includes("Bad credentials") || rawMessage.includes("401")) {
      userMessage =
        "GitHub or Cloudflare authentication failed. Reconnect and try again.";
      statusCode = 401;
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
      console.error("Failed to update after host error:", dbErr);
    }

    return NextResponse.json(
      { error: "Host failed", message: userMessage },
      { status: statusCode }
    );
  }
}
