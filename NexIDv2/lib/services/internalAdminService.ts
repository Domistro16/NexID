import { withDatabase } from "@/lib/server/db";
import { recordPointsEvent } from "@/lib/services/pointsEngine";

export async function updateNarrativeAdmin(
  id: string,
  input: {
    quality?: "Strong" | "Hot" | "Clean" | "Mixed";
    tradable?: boolean;
    fallbackReason?: string | null;
    bestMarketId?: string | null;
  }
) {
  return withDatabase(
    async (db) => {
      const row = await db.narrative.update({
        where: { id },
        data: {
          quality: input.quality,
          tradable: input.tradable,
          fallbackReason: input.fallbackReason,
          bestMarketId: input.bestMarketId
        }
      });
      await db.adminAuditLog.create({
        data: { action: "update_narrative", target: id, metadata: input }
      });
      return {
        id: row.id,
        quality: row.quality,
        tradable: row.tradable,
        fallbackReason: row.fallbackReason,
        bestMarketId: row.bestMarketId
      };
    },
    async () => {
      throw new Error("Database is required to update narratives");
    }
  );
}

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

export async function updateReceiptAdmin(id: string, input: { status?: "draft" | "ready" | "disputed" | "archived"; proofLevel?: string }) {
  return withDatabase(
    async (db) => {
      const row = await db.receipt.update({
        where: { id },
        data: {
          status: input.status,
          proofLevel: input.proofLevel
        }
      });
      await db.adminAuditLog.create({ data: { action: "update_receipt", target: id, metadata: input } });
      return { id: row.id, status: row.status, proofLevel: row.proofLevel };
    },
    async () => ({ id, status: input.status ?? "ready", proofLevel: input.proofLevel ?? "Verified" })
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
