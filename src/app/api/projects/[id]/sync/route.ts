import { NextRequest, NextResponse } from "next/server";
export const maxDuration = 300;
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOctokit, createTreeAndCommit } from "@/lib/github";
import { scrapeFramerSite } from "@/lib/scraper";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { guardedScrape, SecurityError } from "@/lib/security";
import { getUserHostingToken } from "@/lib/hosting-user";
import {
  deployPagesFiles,
  getOrCreatePagesProject,
  slugifyProjectName,
} from "@/lib/cloudflare";
import type { HostingProviderId } from "@/lib/hosting-providers";
import { z } from "zod";

function rateLimitResponse(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfter: Math.ceil(retryAfterMs / 1000) },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
  );
}

/**
 * Sync Framer → GitHub.
 * Optional body: {
 *   hostTarget?: "none" | "cloudflare"
 *   deployToCloudflare?: boolean  // legacy alias for hostTarget=cloudflare
 * }
 * GitHub always works. Cloudflare deploy only if target set and API token connected.
 */
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

  let hostTarget: "none" | HostingProviderId = "none";
  try {
    const body = (await req.json().catch(() => ({}))) as {
      hostTarget?: string;
      deployToCloudflare?: boolean;
    };
    if (body?.hostTarget === "cloudflare") {
      hostTarget = "cloudflare";
    } else if (body?.deployToCloudflare) {
      hostTarget = "cloudflare";
    }
  } catch {
    /* empty body ok */
  }

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Default: if client didn't specify, deploy to CF when project prefers cloudflare
  // (actual deploy still requires a connected token below)
  // Client always sends explicit flag from UI.

  if (project.status === "syncing") {
    const lockAgeMs = Date.now() - new Date(project.updatedAt).getTime();
    if (lockAgeMs < 180_000) {
      return NextResponse.json({ error: "Sync already in progress" }, { status: 409 });
    }
    await prisma.syncLog.updateMany({
      where: { projectId: project.id, status: "running" },
      data: {
        status: "error",
        errorMessage: "Sync was interrupted",
        completedAt: new Date(),
      },
    });
  }

  const syncLog = await prisma.syncLog.create({
    data: {
      projectId: project.id,
      status: "running",
    },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: { status: "syncing" },
  });

  try {
    // Map known Pages projects → public apex so canonicals don't stay on *.framer.website
    const CANONICAL_BY_REPO: Record<string, string> = {
      "zumuuser/clonesitetestkeydispatchers": "https://keydispatchers.com",
      "zumuuser/travelteam": "https://travelteam.ge",
      "zumuuser/renderform.studio": "https://renderform.studio",
    };
    const canonicalOrigin = CANONICAL_BY_REPO[project.githubRepo];

    const result = await guardedScrape(project.framerUrl, (url) =>
      scrapeFramerSite(url, { canonicalOrigin, maxPages: 200 })
    );

    const changesDetected =
      !project.lastContentHash || project.lastContentHash !== result.contentHash;

    // Always prepare files (even if hash matches, CF redeploy may still be requested)
    const octokit = getOctokit(session.accessToken);
    const [owner, repo] = project.githubRepo.split("/");

    if (!owner || !repo) {
      throw new Error("Invalid GitHub repo format. Expected: owner/repo");
    }

    // Scraper emits _redirects (no SPA soft-404), robots.txt, sitemap.xml, _headers.
    const deployFiles = [...result.files];

    let commitSha: string | null = null;
    let filesChanged = 0;

    if (changesDetected) {
      commitSha = await createTreeAndCommit(
        octokit,
        owner,
        repo,
        project.githubBranch,
        deployFiles,
        `FramerClone sync: ${project.framerDomain} (${new Date().toISOString()})`
      );
      filesChanged = deployFiles.length;
    }

    // Optional Cloudflare Pages deploy via stored API token
    let deployUrl: string | null = null;
    let cloudflareProjectName: string | null = project.cloudflareProjectName;
    let domainSetup: {
      message: string;
      steps: string[];
      dashboardUrl?: string;
    } | null = null;
    let hostDeployed = false;
    let hostProvider: HostingProviderId | null = null;

    const hostFiles = deployFiles;

    if (hostTarget !== "none") {
      const auth = await getUserHostingToken(session.user.id, hostTarget);
      if (!auth.ok) {
        if (changesDetected && commitSha) {
          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: {
              status: "success",
              changesDetected: true,
              filesChanged,
              commitSha,
              commitMessage: `Synced to GitHub (${hostTarget} skipped: ${auth.message})`,
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
            filesChanged,
            hosting: {
              deployed: false,
              provider: hostTarget,
              message: auth.message,
            },
          });
        }
        return NextResponse.json(
          {
            error: "hosting_required",
            provider: hostTarget,
            message: auth.message,
          },
          { status: 412 }
        );
      }

      const siteName =
        project.name || project.framerDomain.replace(/\./g, "-");

      if (hostTarget === "cloudflare") {
        if (!auth.accountId) {
          throw new Error("Cloudflare account id missing — reconnect Cloudflare.");
        }
        cloudflareProjectName =
          project.cloudflareProjectName || slugifyProjectName(siteName);
        const pagesProject = await getOrCreatePagesProject(
          auth.token,
          auth.accountId,
          cloudflareProjectName
        );
        if (!pagesProject.success) {
          throw new Error(`Cloudflare Pages project: ${pagesProject.error}`);
        }
        const deployment = await deployPagesFiles(
          auth.token,
          auth.accountId,
          cloudflareProjectName,
          hostFiles
        );
        if (!deployment.success) {
          throw new Error(`Cloudflare deploy failed: ${deployment.error}`);
        }
        deployUrl =
          deployment.result.url ||
          `https://${cloudflareProjectName}.pages.dev`;
        hostDeployed = true;
        hostProvider = "cloudflare";
        domainSetup = {
          message:
            "Live on Cloudflare Pages (recommended for commercial sites). Custom domain is the only remaining step.",
          steps: [
            `Dashboard → Workers & Pages → ${cloudflareProjectName}`,
            "Custom domains → Set up a domain",
            "Point DNS as instructed (easiest if domain is already on Cloudflare)",
          ],
          dashboardUrl: `https://dash.cloudflare.com/?to=/:account/pages/view/${cloudflareProjectName}`,
        };
      }

      if (hostDeployed && !changesDetected) {
        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: {
            status: "success",
            changesDetected: false,
            filesChanged: hostFiles.length,
            commitMessage: `Redeployed to ${hostProvider}: ${deployUrl}`,
            completedAt: new Date(),
          },
        });
        await prisma.project.update({
          where: { id: project.id },
          data: {
            status: "idle",
            lastSyncAt: new Date(),
            lastDeployAt: new Date(),
            deployProvider: hostProvider || "none",
            deployUrl,
            ...(hostProvider === "cloudflare"
              ? {
                  cloudflareProjectName,
                  cloudflareDeployUrl: deployUrl,
                }
              : {}),
          },
        });
        return NextResponse.json({
          success: true,
          changesDetected: false,
          filesChanged: hostFiles.length,
          deployUrl,
          domainSetup,
          hosting: { deployed: true, provider: hostProvider },
        });
      }
    }

    if (!changesDetected && !hostDeployed) {
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

    const commitMessage = hostDeployed
      ? `Synced to GitHub + ${hostProvider}: ${deployUrl}`
      : `FramerClone sync: ${project.framerDomain}`;

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "success",
        changesDetected: true,
        filesChanged,
        commitSha,
        commitMessage,
        completedAt: new Date(),
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: "idle",
        lastSyncAt: new Date(),
        lastContentHash: result.contentHash,
        ...(hostDeployed
          ? {
              lastDeployAt: new Date(),
              deployProvider: hostProvider || "none",
              deployUrl,
              ...(hostProvider === "cloudflare"
                ? {
                    cloudflareProjectName,
                    cloudflareDeployUrl: deployUrl,
                  }
                : {}),
            }
          : {}),
      },
    });

    return NextResponse.json({
      success: true,
      changesDetected: true,
      commitSha,
      filesChanged,
      ...(hostDeployed
        ? {
            deployUrl,
            domainSetup,
            hosting: { deployed: true, provider: hostProvider },
          }
        : { hosting: { deployed: false } }),
    });
  } catch (err: unknown) {
    console.error("Sync failed:", err);
    const rawMessage = err instanceof Error ? err.message : String(err);

    let userMessage = rawMessage;
    let statusCode = 500;

    if (err instanceof SecurityError) {
      userMessage = `Security check failed: ${rawMessage}`;
      statusCode = 400;
    } else if (
      rawMessage.includes("FUNCTION_INVOCATION_TIMEOUT") ||
      rawMessage.includes("Task timed out")
    ) {
      userMessage =
        "Sync timed out — the site has too many pages/assets. Try again or simplify the site.";
      statusCode = 504;
    } else if (
      rawMessage.includes("browserType.launch") ||
      rawMessage.includes("executable") ||
      rawMessage.includes("Chromium")
    ) {
      userMessage =
        "Browser engine failed to start. Please try again in a moment.";
    } else if (rawMessage.includes("Bad credentials") || rawMessage.includes("401")) {
      userMessage =
        "GitHub authentication failed. Please sign out and sign back in to refresh your access token.";
      statusCode = 401;
    } else if (rawMessage.includes("Not Found") && rawMessage.includes("404")) {
      userMessage =
        "GitHub repository not found. Make sure the repo exists and you have write access to it.";
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
