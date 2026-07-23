import { prisma } from "./prisma";
import { decryptToken, encryptToken } from "./crypto";
import {
  listAccounts,
  refreshCloudflareToken,
  cloudflareOAuthConfigured,
} from "./cloudflare";

export interface UserCloudflareAuth {
  token: string;
  accountId: string;
  accountName: string | null;
}

/**
 * Resolve a usable Cloudflare API token for the user.
 * Refreshes OAuth tokens when expired (if refresh token present).
 */
export async function getUserCloudflareAuth(
  userId: string
): Promise<
  | { ok: true; auth: UserCloudflareAuth }
  | { ok: false; reason: "not_connected" | "token_invalid" | "no_account"; message: string }
> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.cloudflareToken) {
    return {
      ok: false,
      reason: "not_connected",
      message:
        "Connect Cloudflare with an API token first (Pages Edit + Account Settings Read).",
    };
  }

  let token = decryptToken(user.cloudflareToken) || user.cloudflareToken;
  const refresh =
    user.cloudflareRefreshToken
      ? decryptToken(user.cloudflareRefreshToken) || user.cloudflareRefreshToken
      : null;

  const expiresAt = user.cloudflareTokenExpiresAt;
  const isExpired =
    expiresAt && expiresAt.getTime() < Date.now() + 60_000; // 1 min skew

  if (isExpired && refresh && cloudflareOAuthConfigured()) {
    const refreshed = await refreshCloudflareToken(refresh);
    if (refreshed.success) {
      token = refreshed.result.access_token;
      const newRefresh = refreshed.result.refresh_token || refresh;
      const expiresIn = refreshed.result.expires_in || 3600;
      await prisma.user.update({
        where: { id: userId },
        data: {
          cloudflareToken: encryptToken(token),
          cloudflareRefreshToken: encryptToken(newRefresh),
          cloudflareTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        },
      });
    } else {
      return {
        ok: false,
        reason: "token_invalid",
        message: "Cloudflare session expired. Please reconnect Cloudflare.",
      };
    }
  }

  let accountId = user.cloudflareAccountId;
  let accountName = user.cloudflareAccountName;

  if (!accountId) {
    const accounts = await listAccounts(token);
    if (!accounts.success || !accounts.result.length) {
      return {
        ok: false,
        reason: "no_account",
        message:
          accounts.success === false
            ? accounts.error
            : "No Cloudflare accounts found for this connection.",
      };
    }
    accountId = accounts.result[0].id;
    accountName = accounts.result[0].name;
    await prisma.user.update({
      where: { id: userId },
      data: {
        cloudflareAccountId: accountId,
        cloudflareAccountName: accountName,
      },
    });
  }

  return {
    ok: true,
    auth: {
      token,
      accountId,
      accountName: accountName || null,
    },
  };
}

export function userCloudflareStatus(user: {
  cloudflareToken: string | null;
  cloudflareAccountId: string | null;
  cloudflareAccountName: string | null;
  cloudflareTokenExpiresAt: Date | null;
}) {
  return {
    connected: !!user.cloudflareToken,
    accountId: user.cloudflareAccountId,
    accountName: user.cloudflareAccountName,
    expiresAt: user.cloudflareTokenExpiresAt,
    oauthAvailable: cloudflareOAuthConfigured(),
  };
}
