import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy path — redirects to unified hosting SSO.
 * GET /api/cloudflare/auth?returnTo=/projects/xxx
 */
export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/dashboard";
  const url = new URL("/api/hosting/cloudflare/auth", req.nextUrl.origin);
  url.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(url);
}
