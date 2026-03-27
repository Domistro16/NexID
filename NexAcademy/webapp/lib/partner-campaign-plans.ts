export const PARTNER_REWARD_CURVE = {
  firstPlaceBps: 1500,
  secondPlaceBps: 1000,
  thirdPlaceBps: 500,
  ranksFourToTenBps: 1000,
  remainingBps: 6000,
  denominatorBps: 10000,
} as const;

export type PartnerCampaignPlanId = "LAUNCH_SPRINT" | "DEEP_DIVE" | "CUSTOM";
export type PartnerLeaderboardMode = "FIXED" | "ROLLING_MONTHLY";
export type PartnerRewardPoolCadence = "CAMPAIGN" | "MONTHLY";

export type PartnerCampaignPlan = {
  id: PartnerCampaignPlanId;
  label: string;
  marketingLabel: string;
  hint: string;
  productionFeeUsd: number | null;
  minPrizePoolUsdc: number;
  durationDays: number;
  winnerCap: number | null;
  leaderboardMode: PartnerLeaderboardMode;
  rewardPoolCadence: PartnerRewardPoolCadence;
  payoutRounds: number;
  payoutIntervalDays: number;
  autoEnd: true;
};

export const PARTNER_CAMPAIGN_PLANS: Record<
  PartnerCampaignPlanId,
  PartnerCampaignPlan
> = {
  LAUNCH_SPRINT: {
    id: "LAUNCH_SPRINT",
    label: "Launch Sprint",
    marketingLabel: '1-Week "Launch Sprint"',
    hint: "Best for a focused activation with fast distribution.",
    productionFeeUsd: 3500,
    minPrizePoolUsdc: 5000,
    durationDays: 7,
    winnerCap: 150,
    leaderboardMode: "FIXED",
    rewardPoolCadence: "CAMPAIGN",
    payoutRounds: 1,
    payoutIntervalDays: 7,
    autoEnd: true,
  },
  DEEP_DIVE: {
    id: "DEEP_DIVE",
    label: "Deep Dive",
    marketingLabel: '1-Month "Deep Dive"',
    hint: "Structured onboarding for a longer campaign window.",
    productionFeeUsd: 8500,
    minPrizePoolUsdc: 15000,
    durationDays: 30,
    winnerCap: 500,
    leaderboardMode: "FIXED",
    rewardPoolCadence: "CAMPAIGN",
    payoutRounds: 1,
    payoutIntervalDays: 30,
    autoEnd: true,
  },
  CUSTOM: {
    id: "CUSTOM",
    label: "Academy Retainer",
    marketingLabel: '6-Month "Academy Retainer"',
    hint: "Rolling monthly leaderboard with a custom winner cap.",
    productionFeeUsd: null,
    minPrizePoolUsdc: 30000,
    durationDays: 180,
    winnerCap: null,
    leaderboardMode: "ROLLING_MONTHLY",
    rewardPoolCadence: "MONTHLY",
    payoutRounds: 6,
    payoutIntervalDays: 30,
    autoEnd: true,
  },
};

export const PARTNER_CAMPAIGN_PLAN_OPTIONS = Object.values(
  PARTNER_CAMPAIGN_PLANS,
);

export type PartnerCampaignSchedule = {
  planId: PartnerCampaignPlanId;
  productionFeeUsd: number | null;
  minPrizePoolUsdc: number;
  prizePoolUsdc: number;
  rewardPoolCadence: PartnerRewardPoolCadence;
  durationDays: number;
  startAt: Date;
  endAt: Date;
  autoEnd: true;
  winnerCap: number;
  leaderboardMode: PartnerLeaderboardMode;
  payoutRounds: number;
  payoutIntervalDays: number;
  payoutCurve: typeof PARTNER_REWARD_CURVE;
  customWinnerCap: number | null;
};

export function isPartnerCampaignPlan(
  value: string,
): value is PartnerCampaignPlanId {
  return value in PARTNER_CAMPAIGN_PLANS;
}

export function getPartnerCampaignPlan(
  value: string,
): PartnerCampaignPlan | null {
  return isPartnerCampaignPlan(value) ? PARTNER_CAMPAIGN_PLANS[value] : null;
}

export function formatPartnerCampaignPlan(value: string): string {
  return getPartnerCampaignPlan(value)?.label ?? value;
}

export function normalizePlanStartAt(value?: Date | string | null): Date {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid campaign start date");
  }
  return parsed;
}

export function resolvePartnerCampaignSchedule({
  planId,
  prizePoolUsdc,
  startAt,
  customWinnerCap,
}: {
  planId: PartnerCampaignPlanId;
  prizePoolUsdc: number;
  startAt?: Date | string | null;
  customWinnerCap?: number | null;
}): PartnerCampaignSchedule {
  const plan = PARTNER_CAMPAIGN_PLANS[planId];

  if (!Number.isFinite(prizePoolUsdc) || prizePoolUsdc < plan.minPrizePoolUsdc) {
    throw new Error(
      `${plan.label} requires at least ${plan.minPrizePoolUsdc.toLocaleString()} USDC`,
    );
  }

  const normalizedStartAt = normalizePlanStartAt(startAt);
  const normalizedEndAt = new Date(normalizedStartAt);
  normalizedEndAt.setUTCDate(normalizedEndAt.getUTCDate() + plan.durationDays);

  const winnerCap =
    plan.winnerCap ??
    (() => {
      const parsedCap = Number(customWinnerCap);
      if (!Number.isInteger(parsedCap) || parsedCap < 10) {
        throw new Error("Custom campaigns require a winner cap of at least 10");
      }
      return parsedCap;
    })();

  return {
    planId,
    productionFeeUsd: plan.productionFeeUsd,
    minPrizePoolUsdc: plan.minPrizePoolUsdc,
    prizePoolUsdc,
    rewardPoolCadence: plan.rewardPoolCadence,
    durationDays: plan.durationDays,
    startAt: normalizedStartAt,
    endAt: normalizedEndAt,
    autoEnd: true,
    winnerCap,
    leaderboardMode: plan.leaderboardMode,
    payoutRounds: plan.payoutRounds,
    payoutIntervalDays: plan.payoutIntervalDays,
    payoutCurve: PARTNER_REWARD_CURVE,
    customWinnerCap: plan.winnerCap === null ? winnerCap : null,
  };
}
