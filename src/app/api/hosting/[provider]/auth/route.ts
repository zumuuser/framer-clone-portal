import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSessionWithToken } from "@/lib/session";
import {
  type HostingProviderId,
  providerConfigured,
  baseUrlFromRequest,
} from "@/lib/hosting-providers";
import { buildCloudflareAuthUrl, CF_OAUTH } from "@/lib/cloudflare";
import { VERCEL_OAUTH } from "@/lib/vercel-hosting";
import { NETLIFY_OAUTH } from "@/lib/netlify-hosting";

const VALID: HostingProviderId[] = ["cloudflare", "vercel", "netlify"];

/**
 * Start OAuth / SSO for a hosting provider.
 * GET /api/hosting/cloudflare/auth?returnTo=/projects/xxx
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const session = await getServerSessionWithToken();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider: raw } = await params;
  if (!VALID.includes(raw as HostingProviderId)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  const provider = raw as HostingProviderId;

  if (!providerConfigured(provider)) {
    return NextResponse.json(
      {
        error: "oauth_not_configured",
        message: `${provider} SSO is not configured on this server yet. Ask the admin to set OAuth client credentials.`,
        provider,
      },
      { status: 501 }
    );
  }

  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/dashboard";
  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/dashboard";

  const state = randomBytes(24).toString("hex");
  const base = baseUrlFromRequest(req.nextUrl.origin);
  const redirectUri = `${base}/api/hosting/${provider}/callback`;

  let url: string;
  if (provider === "cloudflare") {
    url = buildCloudflareAuthUrl(state, redirectUri);
  } else if (provider === "vercel") {
    const q = new URLSearchParams({
      client_id: process.env.VERCEL_OAUTH_CLIENT_ID!,
      redirect_uri: redirectUri,
      scope: VERCEL_OAUTH.scopes,
      state,
      response_type: "code",
    });
    url = `${VERCEL_OAUTH.authorize}?${q.toString()}`;
  } else {
    // Netlify authorization code flow
    const q = new URLSearchParams({
      client_id: process.env.NETLIFY_OAUTH_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    });
    url = `${NETLIFY_OAUTH.authorize}?${q.toString()}`;
  }

  // silence unused import warning for CF_OAUTH if any
  void CF_OAUTH;

  const res = NextResponse.redirect(url);
  res.cookies.set(`host_oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  res.cookies.set(`host_oauth_return_${provider}`, safeReturn, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
