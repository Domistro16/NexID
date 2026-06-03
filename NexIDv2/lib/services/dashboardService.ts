import { listUserIdNames } from "@/lib/services/idService";
import { listCurrentCreatedMarkets, listCurrentMarketPositions, listCurrentMarketReceipts } from "@/lib/services/marketActivityService";
import { getMyPoints } from "@/lib/services/pointsEngine";
import { listReferralEvents, referralSummary } from "@/lib/services/referralService";
import { getRewardSummary } from "@/lib/services/rewardService";
import { getClaimableBalanceSummary } from "@/lib/services/claimableBalanceService";
import { listCreatorNotifications } from "@/lib/services/nexmind/nexmindNotificationService";
import type { AuthUser, DashboardSnapshot } from "@/lib/types/nexid";

export async function getDashboardSnapshot(user: AuthUser | null): Promise<DashboardSnapshot> {
  const positions = await listCurrentMarketPositions(user?.id);
  const points = await getMyPoints(user?.id);
  const idNames = await listUserIdNames(user?.id);
  const referralStats = await referralSummary(user?.id);
  const referralEvents = await listReferralEvents(user?.id);
  const rewards = await getRewardSummary(user?.id);
  const claimableBalance = await getClaimableBalanceSummary(user?.id);
  const receipts = await listCurrentMarketReceipts(user?.id);
  const createdMarkets = await listCurrentCreatedMarkets(user?.id);
  const notifications = await listCreatorNotifications(user);

  return { user, positions, receipts, createdMarkets, notifications, points, idNames, referralStats, referralEvents, rewards, claimableBalance };
}
