import { withDatabase } from "@/lib/server/db";
import type { JsonInput } from "@/lib/types/json";

export async function logAnalyticsEvent(name: string, metadata?: JsonInput, userId?: string) {
  return withDatabase(
    async (db) => {
      await db.analyticsEvent.create({ data: { name, metadata, userId } });
      return { ok: true };
    },
    async () => ({ ok: true })
  );
}
