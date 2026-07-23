import { prisma } from "./prisma";
import { decryptToken } from "./crypto";
import type { HostingProviderId } from "./hosting-providers";
import { getUserCloudflareAuth } from "./cloudflare-user";

export async function getUserHostingToken(
  userId: string,
  provider: HostingProviderId
): Promise<
  | {
      ok: true;
      token: string;
      accountId: string | null;
      accountName: string | null;
    }
  | { ok: false; message: string }
> {
  if (provider === "cloudflare") {
    const cf = await getUserCloudflareAuth(userId);
    if (!cf.ok) return { ok: false, message: cf.message };
    return {
      ok: true,
      token: cf.auth.token,
      accountId: cf.auth.accountId,
      accountName: cf.auth.accountName,
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, message: "User not found" };

  if (provider === "vercel") {
    if (!user.vercelToken) {
      return {
        ok: false,
        message: "Connect Vercel with one-click SSO first.",
      };
    }
    const token = decryptToken(user.vercelToken) || user.vercelToken;
    return {
      ok: true,
      token,
      accountId: user.vercelTeamId,
      accountName: user.vercelTeamName,
    };
  }

  if (!user.netlifyToken) {
    return {
      ok: false,
      message: "Connect Netlify with one-click SSO first.",
    };
  }
  const token = decryptToken(user.netlifyToken) || user.netlifyToken;
  return {
    ok: true,
    token,
    accountId: user.netlifyUserId,
    accountName: user.netlifyUserName,
  };
}
