import { NextRequest, NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { HostingProviderId } from "@/lib/hosting-providers";

const VALID: HostingProviderId[] = ["cloudflare"];

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
    return NextResponse.json(
      { error: "Only Cloudflare hosting is supported" },
      { status: 400 }
    );
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

  return NextResponse.json({ success: true, provider: "cloudflare" });
}
