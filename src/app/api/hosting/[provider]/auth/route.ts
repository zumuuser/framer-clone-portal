import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSessionWithToken } from "@/lib/session";
import {
  type HostingProviderId,
  providerConfigured,
  baseUrlFromRequest,
} from "@/lib/hosting-providers";
import { buildCloudflareAuthUrl } from "@/lib/cloudflare";

const VALID: HostingProviderId[] = ["cloudflare"];

/**
 * Start OAuth / SSO for Cloudflare.
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
    return NextResponse.json(
      { error: "Only Cloudflare hosting is supported" },
      { status: 400 }
    );
  }
  const provider = raw as HostingProviderId;

  if (!providerConfigured(provider)) {
    return NextResponse.json(
      {
        error: "oauth_not_configured",
        message:
          "Cloudflare SSO is not configured on this server yet. Set CLOUDFLARE_OAUTH_CLIENT_ID and CLOUDFLARE_OAUTH_CLIENT_SECRET.",
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
  const url = buildCloudflareAuthUrl(state, redirectUri);

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
