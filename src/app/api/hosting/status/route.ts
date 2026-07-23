import { NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  HOSTING_PROVIDERS,
  providerConfigured,
  type HostingProviderId,
} from "@/lib/hosting-providers";

export async function GET() {
  const session = await getServerSessionWithToken();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providers: HostingProviderId[] = ["cloudflare", "vercel", "netlify"];

  const status = providers.map((id) => {
    const meta = HOSTING_PROVIDERS[id];
    let connected = false;
    let accountName: string | null = null;
    let accountId: string | null = null;

    if (id === "cloudflare") {
      connected = !!user.cloudflareToken;
      accountName = user.cloudflareAccountName;
      accountId = user.cloudflareAccountId;
    } else if (id === "vercel") {
      connected = !!user.vercelToken;
      accountName = user.vercelTeamName;
      accountId = user.vercelTeamId;
    } else if (id === "netlify") {
      connected = !!user.netlifyToken;
      accountName = user.netlifyUserName;
      accountId = user.netlifyUserId;
    }

    return {
      id,
      name: meta.name,
      recommended: meta.recommended,
      freePlanNote: meta.freePlanNote,
      commercialOnFree: meta.commercialOnFree,
      connectLabel: meta.connectLabel,
      docsUrl: meta.docsUrl,
      oauthConfigured: providerConfigured(id),
      connected,
      accountName,
      accountId,
    };
  });

  return NextResponse.json({
    providers: status,
    recommended: "cloudflare" as const,
    summary:
      "Cloudflare Pages is recommended for commercial sites (no personal-only free-plan restriction). Vercel Hobby and Netlify free tiers are for personal / non-commercial projects.",
  });
}
