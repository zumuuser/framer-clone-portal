/**
 * Hosting provider metadata.
 * Cloudflare Pages is the only host target (commercial-friendly free plan).
 */

export type HostingProviderId = "cloudflare";

export const HOSTING_PROVIDERS: Record<
  HostingProviderId,
  {
    id: HostingProviderId;
    name: string;
    recommended: boolean;
    freePlanNote: string;
    commercialOnFree: boolean;
    connectLabel: string;
    docsUrl: string;
  }
> = {
  cloudflare: {
    id: "cloudflare",
    name: "Cloudflare Pages",
    recommended: true,
    commercialOnFree: true,
    freePlanNote:
      "Connect with an API token (Pages Edit + Account Settings Read). Free plan allows commercial projects.",
    connectLabel: "Connect with API token",
    docsUrl:
      "https://developers.cloudflare.com/fundamentals/api/get-started/create-token/",
  },
};

/** API-token connect is always available (no OAuth env required). */
export function providerConfigured(provider: HostingProviderId): boolean {
  return provider === "cloudflare";
}

export function baseUrlFromRequest(origin: string): string {
  return process.env.NEXTAUTH_URL || origin;
}
