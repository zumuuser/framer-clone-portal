import { prisma } from ./prisma;

export interface RateLimitRule {
  route: string;
  windowMs: number;
  maxRequests: number;
  description?: string;
}

export async function getRateLimitConfig(route: string): Promise<RateLimitRule | null> {
  const config = await prisma.rateLimitConfig.findUnique({ where: { route } });
  if (!config) return null;
  return {
    route: config.route,
    windowMs: config.windowMs,
    maxRequests: config.maxRequests,
    description: config.description ?? undefined,
  };
}

export async function getAllRateLimitConfigs(): Promise<RateLimitRule[]> {
  const configs = await prisma.rateLimitConfig.findMany({ orderBy: { route: asc } });
  return configs.map((c) => ({
    route: c.route,
    windowMs: c.windowMs,
    maxRequests: c.maxRequests,
    description: c.description ?? undefined,
  }));
}

export async function setRateLimitConfig(rule: RateLimitRule) {
  return prisma.rateLimitConfig.upsert({
    where: { route: rule.route },
    update: {
      windowMs: rule.windowMs,
      maxRequests: rule.maxRequests,
      description: rule.description,
    },
    create: {
      route: rule.route,
      windowMs: rule.windowMs,
      maxRequests: rule.maxRequests,
      description: rule.description,
    },
  });
}
