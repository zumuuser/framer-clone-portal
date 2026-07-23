import { NextRequest, NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/crypto";
import {
  type HostingProviderId,
  baseUrlFromRequest,
  providerConfigured,
} from "@/lib/hosting-providers";
import {
  exchangeCloudflareCode,
  listAccounts,
} from "@/lib/cloudflare";
import { VERCEL_OAUTH, vercelUser, vercelTeams } from "@/lib/vercel-hosting";
import { NETLIFY_OAUTH, netlifyUser } from "@/lib/netlify-hosting";

const VALID: HostingProviderId[] = ["cloudflare", "vercel", "netlify"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: raw } = await params;
  const base = baseUrlFromRequest(req.nextUrl.origin);

  if (!VALID.includes(raw as HostingProviderId)) {
    return NextResponse.redirect(`${base}/dashboard?error=host_unknown`);
  }
  const provider = raw as HostingProviderId;

  const session = await getServerSessionWithToken();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${base}/?error=host_auth_required`);
  }

  if (!providerConfigured(provider)) {
    return NextResponse.redirect(
      `${base}/dashboard?error=host_oauth_not_configured&provider=${provider}`
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get(`host_oauth_state_${provider}`)?.value;
  const returnTo =
    req.cookies.get(`host_oauth_return_${provider}`)?.value || "/dashboard";

  // Also accept legacy cf cookies for cloudflare
  const legacyState =
    provider === "cloudflare"
      ? req.cookies.get("cf_oauth_state")?.value
      : undefined;
  const legacyReturn =
    provider === "cloudflare"
      ? req.cookies.get("cf_oauth_return")?.value
      : undefined;

  const expectedState = cookieState || legacyState;
  const dest = returnTo || legacyReturn || "/dashboard";

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      `${base}${dest}?error=host_oauth_state&provider=${provider}`
    );
  }

  const redirectUri = `${base}/api/hosting/${provider}/callback`;

  try {
    if (provider === "cloudflare") {
      const exchanged = await exchangeCloudflareCode(code, redirectUri);
      if (!exchanged.success) {
        return NextResponse.redirect(
          `${base}${dest}?error=host_oauth_token&provider=cloudflare&msg=${encodeURIComponent(exchanged.error)}`
        );
      }
      const token = exchanged.result.access_token;
      const accounts = await listAccounts(token);
      if (!accounts.success || !accounts.result.length) {
        return NextResponse.redirect(
          `${base}${dest}?error=host_no_account&provider=cloudflare`
        );
      }
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
    } else if (provider === "vercel") {
      const body = new URLSearchParams({
        client_id: process.env.VERCEL_OAUTH_CLIENT_ID!,
        client_secret: process.env.VERCEL_OAUTH_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(VERCEL_OAUTH.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
        error_description?: string;
      };
      if (!tokenRes.ok || !tokenData.access_token) {
        return NextResponse.redirect(
          `${base}${dest}?error=host_oauth_token&provider=vercel&msg=${encodeURIComponent(
            tokenData.error_description || tokenData.error || "token failed"
          )}`
        );
      }
      const token = tokenData.access_token;
      const user = await vercelUser(token);
      const teams = await vercelTeams(token);
      const team =
        teams.success && teams.result.teams?.length
          ? teams.result.teams[0]
          : null;
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          vercelToken: encryptToken(token),
          vercelTeamId: team?.id || null,
          vercelTeamName:
            team?.name ||
            (user.success
              ? user.result.user.username || user.result.user.name || null
              : null),
          vercelTokenExpiresAt: null,
        },
      });
    } else {
      // Netlify
      const body = new URLSearchParams({
        client_id: process.env.NETLIFY_OAUTH_CLIENT_ID!,
        client_secret: process.env.NETLIFY_OAUTH_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });
      const tokenRes = await fetch(NETLIFY_OAUTH.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
        error_description?: string;
      };
      if (!tokenRes.ok || !tokenData.access_token) {
        return NextResponse.redirect(
          `${base}${dest}?error=host_oauth_token&provider=netlify&msg=${encodeURIComponent(
            tokenData.error_description || tokenData.error || "token failed"
          )}`
        );
      }
      const token = tokenData.access_token;
      const user = await netlifyUser(token);
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          netlifyToken: encryptToken(token),
          netlifyUserId: user.success ? user.result.id : null,
          netlifyUserName: user.success
            ? user.result.full_name || user.result.email || user.result.slug || null
            : null,
          netlifyTokenExpiresAt: null,
        },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      `${base}${dest}?error=host_oauth_token&provider=${provider}&msg=${encodeURIComponent(msg)}`
    );
  }

  const res = NextResponse.redirect(
    `${base}${dest}?host=connected&provider=${provider}`
  );
  res.cookies.set(`host_oauth_state_${provider}`, "", { maxAge: 0, path: "/" });
  res.cookies.set(`host_oauth_return_${provider}`, "", { maxAge: 0, path: "/" });
  if (provider === "cloudflare") {
    res.cookies.set("cf_oauth_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("cf_oauth_return", "", { maxAge: 0, path: "/" });
  }
  return res;
}
