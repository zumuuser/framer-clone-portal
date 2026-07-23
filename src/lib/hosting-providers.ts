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
      "Free plan allows commercial projects with generous bandwidth. Default for client work and production sites.",
    connectLabel: "Connect Cloudflare",
    docsUrl: "https://developers.cloudflare.com/pages/",
  },
};

export function providerConfigured(provider: HostingProviderId): boolean {
  if (provider === "cloudflare") {
    return !!(
      process.env.CLOUDFLARE_OAUTH_CLIENT_ID &&
      process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET
    );
  }
  return false;
}

export function baseUrlFromRequest(origin: string): string {
  return process.env.NEXTAUTH_URL || origin;
}
