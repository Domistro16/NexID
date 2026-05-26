import type { Prisma } from "@prisma/client";
import { withDatabase } from "@/lib/server/db";

export async function logAnalyticsEvent(name: string, metadata?: Prisma.InputJsonValue, userId?: string) {
  return withDatabase(
    async (db) => {
      await db.analyticsEvent.create({ data: { name, metadata, userId } });
      return { ok: true };
    },
    async () => ({ ok: true })
  );
}
