import { listUserIdNames } from "@/lib/services/idService";
import { listCurrentMarketPositions, listCurrentMarketReceipts } from "@/lib/services/marketActivityService";
import { getMyPoints } from "@/lib/services/pointsEngine";
import { listReferralEvents, referralSummary } from "@/lib/services/referralService";
import { getRewardSummary } from "@/lib/services/rewardService";
import type { AuthUser, DashboardSnapshot } from "@/lib/types/nexid";

export async function getDashboardSnapshot(user: AuthUser | null): Promise<DashboardSnapshot> {
  const positions = await listCurrentMarketPositions(user?.id);
  const points = await getMyPoints(user?.id);
  const idNames = await listUserIdNames(user?.id);
  const referralStats = await referralSummary(user?.id);
  const referralEvents = await listReferralEvents(user?.id);
  const rewards = await getRewardSummary(user?.id);
  const receipts = await listCurrentMarketReceipts(user?.id);

  return { user, positions, receipts, points, idNames, referralStats, referralEvents, rewards };
}
