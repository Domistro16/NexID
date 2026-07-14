import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";
import { PrismaClient as SqlitePrismaClient } from "@/generated/sqlite";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { nexPrisma?: PrismaClient };

export function getPrisma() {
  if (!globalForPrisma.nexPrisma) {
    globalForPrisma.nexPrisma = env.databaseProvider === "postgresql"
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString: env.databaseUrl }) })
      : (new SqlitePrismaClient({
          adapter: new PrismaBetterSqlite3({ url: env.databaseUrl })
        }) as unknown as PrismaClient);
  }
  return globalForPrisma.nexPrisma;
}
