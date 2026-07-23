import { NextRequest, NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/crypto";
import {
  type HostingProviderId,
  baseUrlFromRequest,
  providerConfigured,
} from "@/lib/hosting-providers";
import { exchangeCloudflareCode, listAccounts } from "@/lib/cloudflare";

const VALID: HostingProviderId[] = ["cloudflare"];

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

  const legacyState = req.cookies.get("cf_oauth_state")?.value;
  const legacyReturn = req.cookies.get("cf_oauth_return")?.value;

  const expectedState = cookieState || legacyState;
  const dest = returnTo || legacyReturn || "/dashboard";

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      `${base}${dest}?error=host_oauth_state&provider=${provider}`
    );
  }

  const redirectUri = `${base}/api/hosting/${provider}/callback`;

  try {
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
  res.cookies.set("cf_oauth_state", "", { maxAge: 0, path: "/" });
  res.cookies.set("cf_oauth_return", "", { maxAge: 0, path: "/" });
  return res;
}
