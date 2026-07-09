import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Initialize SQLite database in /tmp for write access on serverless environments
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:/tmp/')) {
  const dbPath = process.env.DATABASE_URL.replace('file:', '');
  if (!fs.existsSync(dbPath)) {
    try {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      const templatePath = path.join(process.cwd(), 'prisma', 'template.db');
      if (fs.existsSync(templatePath)) {
        fs.copyFileSync(templatePath, dbPath);
        console.log('Successfully initialized database at:', dbPath);
      } else {
        console.warn('Template database not found at:', templatePath);
      }
    } catch (err) {
      console.error('Error copying template database:', err);
    }
  }
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

