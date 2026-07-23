/**
 * Hosting provider metadata + free-plan guidance.
 * Cloudflare is the recommended default for commercial use.
 */

export type HostingProviderId = "cloudflare" | "vercel" | "netlify";

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
      "Free plan allows commercial projects with generous bandwidth. Best default for client work and production sites.",
    connectLabel: "Connect Cloudflare",
    docsUrl: "https://developers.cloudflare.com/pages/",
  },
  vercel: {
    id: "vercel",
    name: "Vercel",
    recommended: false,
    commercialOnFree: false,
    freePlanNote:
      "Hobby (free) is for personal, non-commercial use only. Commercial / client sites require a paid Pro plan.",
    connectLabel: "Connect Vercel",
    docsUrl: "https://vercel.com/docs/accounts/plans/hobby",
  },
  netlify: {
    id: "netlify",
    name: "Netlify",
    recommended: false,
    commercialOnFree: false,
    freePlanNote:
      "Free / Starter tier is intended for personal projects. Commercial sites typically need a paid plan.",
    connectLabel: "Connect Netlify",
    docsUrl: "https://www.netlify.com/pricing/",
  },
};

export function providerConfigured(provider: HostingProviderId): boolean {
  switch (provider) {
    case "cloudflare":
      return !!(
        process.env.CLOUDFLARE_OAUTH_CLIENT_ID &&
        process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET
      );
    case "vercel":
      return !!(
        process.env.VERCEL_OAUTH_CLIENT_ID &&
        process.env.VERCEL_OAUTH_CLIENT_SECRET
      );
    case "netlify":
      return !!(
        process.env.NETLIFY_OAUTH_CLIENT_ID &&
        process.env.NETLIFY_OAUTH_CLIENT_SECRET
      );
  }
}

export function baseUrlFromRequest(origin: string): string {
  return process.env.NEXTAUTH_URL || origin;
}
