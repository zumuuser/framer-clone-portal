import { NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userCloudflareStatus } from "@/lib/cloudflare-user";
import { cloudflareOAuthConfigured } from "@/lib/cloudflare";

export async function GET() {
  const session = await getServerSessionWithToken();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ...userCloudflareStatus(user),
    oauthAvailable: cloudflareOAuthConfigured(),
  });
}
