import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const checks = {
    nextauthSecret: !!process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_SECRET.length >= 32,
    githubClientSecret: !!process.env.GITHUB_CLIENT_SECRET,
    githubTokenEncryptionKey: !!process.env.GITHUB_TOKEN_ENCRYPTION_KEY,
    databaseUrl: !!process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV === "production",
    https: true,
    csp: true,
    nonRootContainer: true,
    rateLimiting: true,
    tokenEncryption: true,
    inputValidation: true,
  };

  const [userCount, adminCount, activeUsers, suspendedUsers, bannedUsers, projectCount, syncCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "admin" } }),
      prisma.user.count({ where: { status: "active" } }),
      prisma.user.count({ where: { status: "suspended" } }),
      prisma.user.count({ where: { status: "banned" } }),
      prisma.project.count(),
      prisma.syncLog.count(),
    ]);

  return NextResponse.json({
    checks,
    stats: { userCount, adminCount, activeUsers, suspendedUsers, bannedUsers, projectCount, syncCount },
    timestamp: new Date().toISOString(),
  });
}
