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
  if (provider !== "cloudflare") {
    return { ok: false, message: "Only Cloudflare hosting is supported." };
  }

  const cf = await getUserCloudflareAuth(userId);
  if (!cf.ok) return { ok: false, message: cf.message };
  return {
    ok: true,
    token: cf.auth.token,
    accountId: cf.auth.accountId,
    accountName: cf.auth.accountName,
  };
}
