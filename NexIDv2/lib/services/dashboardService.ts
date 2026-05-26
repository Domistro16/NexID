import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";
import { listUserIdNames } from "@/lib/services/idService";
import { getMyPoints } from "@/lib/services/pointsEngine";
import { listPositions } from "@/lib/services/positionService";
import { listReferralEvents, referralSummary } from "@/lib/services/referralService";
import { getRewardSummary } from "@/lib/services/rewardService";
import type { AuthUser, DashboardSnapshot, Receipt, Side } from "@/lib/types/nexid";

export async function getDashboardSnapshot(user: AuthUser | null): Promise<DashboardSnapshot> {
  const positions = await listPositions(user?.id);
  const points = await getMyPoints(user?.id);
  const idNames = await listUserIdNames(user?.id);
  const referralStats = await referralSummary(user?.id);
  const referralEvents = await listReferralEvents(user?.id);
  const rewards = await getRewardSummary(user?.id);
  const receipts = await withDatabase(
    async (db) => {
      if (!user?.id) return [];
      const rows = await db.receipt.findMany({
        where: { userId: user.id },
        include: { position: { include: { narrative: true } } },
        orderBy: { createdAt: "desc" }
      });
      return rows.map((row): Receipt => ({
        id: row.id,
        positionId: row.positionId,
        narrativeName: row.position.narrative.name,
        side: row.position.side as Side,
        returnPct: row.returnPct,
        proofLevel: row.proofLevel,
        edgePoints: row.edgePoints,
        rank: row.rank,
        identity: resolveIdentityLabel(user),
        publicUrl: row.publicUrl,
        status: row.status,
        cardAsset: row.cardAsset
      }));
    },
    async () => []
  );

  return { user, positions, receipts, points, idNames, referralStats, referralEvents, rewards };
}
