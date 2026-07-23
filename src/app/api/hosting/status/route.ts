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

  const providers: HostingProviderId[] = ["cloudflare"];

  const status = providers.map((id) => {
    const meta = HOSTING_PROVIDERS[id];
    return {
      id,
      name: meta.name,
      recommended: meta.recommended,
      freePlanNote: meta.freePlanNote,
      commercialOnFree: meta.commercialOnFree,
      connectLabel: meta.connectLabel,
      docsUrl: meta.docsUrl,
      oauthConfigured: providerConfigured(id),
      connected: !!user.cloudflareToken,
      accountName: user.cloudflareAccountName,
      accountId: user.cloudflareAccountId,
    };
  });

  return NextResponse.json({
    providers: status,
    recommended: "cloudflare" as const,
    summary:
      "Connect a Cloudflare API token (Pages Edit + Account Settings Read), then deploy on Sync.",
  });
}
