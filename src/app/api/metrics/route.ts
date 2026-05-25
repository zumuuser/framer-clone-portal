import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const [users, projects, syncs] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.syncLog.count(),
  ]);

  const metrics = [
    `# HELP framerclone_users_total Total number of users`,
    `# TYPE framerclone_users_total gauge`,
    `framerclone_users_total ${users}`,
    ``,
    `# HELP framerclone_projects_total Total number of projects`,
    `# TYPE framerclone_projects_total gauge`,
    `framerclone_projects_total ${projects}`,
    ``,
    `# HELP framerclone_syncs_total Total number of sync logs`,
    `# TYPE framerclone_syncs_total gauge`,
    `framerclone_syncs_total ${syncs}`,
  ].join("\n");

  return new NextResponse(metrics, {
    headers: { "Content-Type": "text/plain" },
  });
}
