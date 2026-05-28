import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

function createPrismaClient() {
  if (!process.env.DATABASE_URL) return undefined;
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX || 1)
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.prisma = prisma;
}

export async function withDatabase<T>(fn: (client: PrismaClient) => Promise<T>, fallback: () => Promise<T>) {
  if (!hasDatabaseUrl() || !prisma) {
    return fallback();
  }
  try {
    return await fn(prisma);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Database unavailable, using fallback data.", error);
      return fallback();
    }
    throw error;
  }
}

export function requireDatabase() {
  if (!hasDatabaseUrl()) throw new Error("DATABASE_URL is not configured.");
  if (!prisma) throw new Error("Prisma client is not available.");
  return prisma;
}
