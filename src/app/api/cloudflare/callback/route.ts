import { NextRequest, NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/crypto";
import {
  exchangeCloudflareCode,
  listAccounts,
  cloudflareOAuthConfigured,
} from "@/lib/cloudflare";

export async function GET(req: NextRequest) {
  const session = await getServerSessionWithToken();
  const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;

  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/?error=cf_auth_required`);
  }

  if (!cloudflareOAuthConfigured()) {
    return NextResponse.redirect(`${baseUrl}/dashboard?error=cf_oauth_not_configured`);
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("cf_oauth_state")?.value;
  const returnTo = req.cookies.get("cf_oauth_return")?.value || "/dashboard";

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${baseUrl}${returnTo}?error=cf_oauth_state`);
  }

  const redirectUri = `${baseUrl}/api/cloudflare/callback`;
  const exchanged = await exchangeCloudflareCode(code, redirectUri);
  if (!exchanged.success) {
    return NextResponse.redirect(
      `${baseUrl}${returnTo}?error=cf_oauth_token&msg=${encodeURIComponent(exchanged.error)}`
    );
  }

  const token = exchanged.result.access_token;
  const accounts = await listAccounts(token);
  if (!accounts.success || !accounts.result.length) {
    return NextResponse.redirect(
      `${baseUrl}${returnTo}?error=cf_no_account&msg=${encodeURIComponent(
        accounts.success === false ? accounts.error : "No accounts"
      )}`
    );
  }

  // Prefer first account (user can switch later if needed)
  const account = accounts.result[0];
  const expiresIn = exchanged.result.expires_in || 3600;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      cloudflareToken: encryptToken(token),
      cloudflareRefreshToken: exchanged.result.refresh_token
        ? encryptToken(exchanged.result.refresh_token)
        : null,
      cloudflareTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      cloudflareAccountId: account.id,
      cloudflareAccountName: account.name,
    },
  });

  const res = NextResponse.redirect(`${baseUrl}${returnTo}?cf=connected`);
  res.cookies.set("cf_oauth_state", "", { maxAge: 0, path: "/" });
  res.cookies.set("cf_oauth_return", "", { maxAge: 0, path: "/" });
  return res;
}
