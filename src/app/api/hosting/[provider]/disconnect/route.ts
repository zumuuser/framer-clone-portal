import { NextRequest, NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { HostingProviderId } from "@/lib/hosting-providers";

const VALID: HostingProviderId[] = ["cloudflare", "vercel", "netlify"];

export async function POST(
  _req: NextRequest,
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

  if (provider === "cloudflare") {
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
  } else if (provider === "vercel") {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        vercelToken: null,
        vercelTeamId: null,
        vercelTeamName: null,
        vercelTokenExpiresAt: null,
      },
    });
  } else {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        netlifyToken: null,
        netlifyUserId: null,
        netlifyUserName: null,
        netlifyTokenExpiresAt: null,
      },
    });
  }

  return NextResponse.json({ success: true, provider });
}
