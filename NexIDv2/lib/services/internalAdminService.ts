import { withDatabase } from "@/lib/server/db";
import { recordPointsEvent } from "@/lib/services/pointsEngine";

export async function updateReferralAdmin(id: string, input: { status?: string; riskFlag?: string | null }) {
  return withDatabase(
    async (db) => {
      const row = await db.referral.update({
        where: { id },
        data: {
          status: input.status,
          riskFlag: input.riskFlag
        }
      });
      await db.adminAuditLog.create({
        data: { action: "update_referral", target: id, metadata: input }
      });
      return {
        id: row.id,
        status: row.status,
        riskFlag: row.riskFlag
      };
    },
    async () => ({
      id,
      status: input.status ?? "pending",
      riskFlag: input.riskFlag ?? null
    })
  );
}

export async function adjustPointsAdmin(input: { userId: string; points: number; reason: string }) {
  await recordPointsEvent({
    userId: input.userId,
    points: input.points,
    reason: `admin:${input.reason}`,
    metadata: { adminAdjustment: true }
  });
  return withDatabase(
    async (db) => {
      await db.adminAuditLog.create({
        data: { action: "adjust_points", target: input.userId, metadata: input }
      });
      return { ok: true };
    },
    async () => ({ ok: true })
  );
}
