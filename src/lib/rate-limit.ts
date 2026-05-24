/**
 * Lightweight in-memory rate limiter for Next.js API routes.
 * Uses a simple Map with TTL sweep — no Redis required.
 * Additive layer; does not modify business logic.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const store = new Map<string, Bucket>();
const CLEANUP_INTERVAL_MS = 60_000;

function sweep() {
  const now = Date.now();
  for (const [key, bucket] of store.entries()) {
    if (now - bucket.lastRefill > CLEANUP_INTERVAL_MS * 5) {
      store.delete(key);
    }
  }
}

setInterval(sweep, CLEANUP_INTERVAL_MS);

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; retryAfterMs: number; remaining: number } {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket) {
    store.set(key, { tokens: config.maxRequests - 1, lastRefill: now });
    return { allowed: true, retryAfterMs: 0, remaining: config.maxRequests - 1 };
  }

  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = (elapsed / config.windowMs) * config.maxRequests;

  bucket.tokens = Math.min(bucket.tokens + tokensToAdd, config.maxRequests);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const retryAfterMs = Math.ceil(
      (1 - bucket.tokens) * (config.windowMs / config.maxRequests)
    );
    return { allowed: false, retryAfterMs, remaining: 0 };
  }

  bucket.tokens -= 1;
  return { allowed: true, retryAfterMs: 0, remaining: Math.floor(bucket.tokens) };
}

/** Helper to build rate-limit keys from NextRequest */
export function getRateLimitKey(
  req: Request,
  identifier: string
): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${ip}:${identifier}`;
}
