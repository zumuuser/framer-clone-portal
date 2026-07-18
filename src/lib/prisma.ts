import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // Use Neon serverless adapter when DATABASE_URL is a Neon postgres:// URL
  if (
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL.startsWith("postgres")
  ) {
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
    return new PrismaClient({ adapter } as any);
  }

  // Fallback for local dev with SQLite or other providers
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
