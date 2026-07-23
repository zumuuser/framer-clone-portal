import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/crypto";
import { listAccounts, verifyToken } from "@/lib/cloudflare";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";

/**
 * Connect Cloudflare with an API token (fallback when OAuth not configured).
 * Token needs: Account.Cloudflare Pages:Edit, Account.Account Settings:Read
 * (or Account Read + Pages Write).
 */
const schema = z.object({
  apiToken: z.string().min(20).max(200),
  accountId: z.string().min(1).max(64).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSessionWithToken();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(getRateLimitKey(req, "cf:connect"), {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const token = parsed.data.apiToken.trim();

  // Verify token works
  const verified = await verifyToken(token);
  // User tokens (not API tokens) may fail /user/tokens/verify — fall through to accounts list
  const accounts = await listAccounts(token);
  if (!accounts.success) {
    return NextResponse.json(
      {
        error: "Invalid Cloudflare credentials",
        message: accounts.error,
        hint: verified.success
          ? undefined
          : "Create an API Token with Account → Cloudflare Pages → Edit and Account → Account Settings → Read",
      },
      { status: 400 }
    );
  }

  if (!accounts.result.length) {
    return NextResponse.json(
      { error: "No Cloudflare accounts found for this token" },
      { status: 400 }
    );
  }

  let account = accounts.result[0];
  if (parsed.data.accountId) {
    const match = accounts.result.find((a) => a.id === parsed.data.accountId);
    if (!match) {
      return NextResponse.json(
        { error: "Account not found for this token", accounts: accounts.result },
        { status: 400 }
      );
    }
    account = match;
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      cloudflareToken: encryptToken(token),
      cloudflareRefreshToken: null,
      cloudflareTokenExpiresAt: null, // API tokens don't expire the same way
      cloudflareAccountId: account.id,
      cloudflareAccountName: account.name,
    },
  });

  return NextResponse.json({
    success: true,
    accountId: account.id,
    accountName: account.name,
    accounts: accounts.result.map((a) => ({ id: a.id, name: a.name })),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSessionWithToken();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      cloudflareToken: null,
      cloudflareRefreshToken: null,
      cloudflareTokenExpiresAt: null,
      cloudflareAccountId: null,
      cloudflareAccountName: null,
    },
  });

  return NextResponse.json({ success: true });
}
