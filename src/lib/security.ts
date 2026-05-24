/**
 * Security utilities for scraper validation and request guards.
 * All functions are pure and additive — they wrap existing logic without
 * modifying core scraper/sync behaviour.
 */

const ALLOWED_FRAMER_DOMAINS = [
  ".framer.website",
  ".framer.com",
  ".framer.app",
  ".framer.ai",
];

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

/**
 * Validate a Framer URL before scraping.
 * Throws SecurityError if the URL is disallowed.
 */
export function validateScrapeUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new SecurityError("Invalid URL format");
  }

  // 1. Enforce HTTPS
  if (url.protocol !== "https:") {
    throw new SecurityError("Only HTTPS URLs are allowed");
  }

  // 2. Reject URLs with embedded credentials
  if (url.username || url.password) {
    throw new SecurityError("URLs with embedded credentials are not allowed");
  }

  // 3. Reject private / loopback / metadata hostnames
  const hostname = url.hostname.toLowerCase();
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new SecurityError("Private or internal addresses are not allowed");
    }
  }

  // 4. Require known Framer domain suffix (configurable)
  const isFramerDomain = ALLOWED_FRAMER_DOMAINS.some((suffix) =>
    hostname.endsWith(suffix)
  );
  if (!isFramerDomain) {
    throw new SecurityError(
      `URL must be a hosted Framer domain (e.g. *.framer.website, *.framer.com)`
    );
  }

  // 5. Length sanity check
  if (rawUrl.length > 2048) {
    throw new SecurityError("URL exceeds maximum length");
  }
}

/**
 * Guard wrapper for scrapeFramerSite — validates first, then delegates.
 */
export async function guardedScrape<T>(
  url: string,
  scrapeFn: (url: string) => Promise<T>
): Promise<T> {
  validateScrapeUrl(url);
  return scrapeFn(url);
}
