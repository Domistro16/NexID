import {
  PARTNER_REWARD_CURVE,
  type PartnerCampaignPlanId,
} from "@/lib/partner-campaign-plans";

export type RankedRewardAllocation = {
  rank: number;
  amountAtomic: bigint;
};

function splitEvenly(total: bigint, count: number): bigint[] {
  if (count <= 0) {
    return [];
  }

  const base = total / BigInt(count);
  let remainder = total % BigInt(count);

  return Array.from({ length: count }, () => {
    const bonus = remainder > 0n ? 1n : 0n;
    if (remainder > 0n) {
      remainder -= 1n;
    }
    return base + bonus;
  });
}

function percentageOf(total: bigint, bps: number): bigint {
  return (total * BigInt(bps)) / BigInt(PARTNER_REWARD_CURVE.denominatorBps);
}

export function buildRankedRewardAllocations({
  totalRewardAtomic,
  winnerCount,
}: {
  totalRewardAtomic: bigint;
  winnerCount: number;
}): RankedRewardAllocation[] {
  if (winnerCount <= 0) {
    return [];
  }

  const count = Math.floor(winnerCount);
  const allocations = new Array<bigint>(count).fill(0n);

  if (count >= 1) {
    allocations[0] += percentageOf(
      totalRewardAtomic,
      PARTNER_REWARD_CURVE.firstPlaceBps,
    );
  }
  if (count >= 2) {
    allocations[1] += percentageOf(
      totalRewardAtomic,
      PARTNER_REWARD_CURVE.secondPlaceBps,
    );
  }
  if (count >= 3) {
    allocations[2] += percentageOf(
      totalRewardAtomic,
      PARTNER_REWARD_CURVE.thirdPlaceBps,
    );
  }

  const midCount = Math.max(Math.min(count, 10) - 3, 0);
  if (midCount > 0) {
    const midPool = percentageOf(
      totalRewardAtomic,
      PARTNER_REWARD_CURVE.ranksFourToTenBps,
    );
    const midShares = splitEvenly(midPool, midCount);
    for (let index = 0; index < midCount; index += 1) {
      allocations[index + 3] += midShares[index];
    }
  }

  const allocated = allocations.reduce((sum, value) => sum + value, 0n);
  const remainingPool = totalRewardAtomic - allocated;
  const tailStartIndex = count > 10 ? 10 : count > 3 ? 3 : 0;
  const tailCount = count - tailStartIndex;

  if (remainingPool > 0n && tailCount > 0) {
    const tailShares = splitEvenly(remainingPool, tailCount);
    for (let index = 0; index < tailCount; index += 1) {
      allocations[tailStartIndex + index] += tailShares[index];
    }
  }

  return allocations.map((amountAtomic, index) => ({
    rank: index + 1,
    amountAtomic,
  }));
}

export function resolveWinnerCountForPlan({
  participantCount,
  winnerCap,
}: {
  participantCount: number;
  winnerCap: number;
}): number {
  return Math.max(0, Math.min(Math.floor(participantCount), Math.floor(winnerCap)));
}

export function parseUsdcToAtomicAmount(value: number | string): bigint {
  const [wholePart, fractionalPart = ""] = String(value).split(".");
  const whole = BigInt(wholePart || "0");
  const fractional = BigInt((fractionalPart.padEnd(6, "0") || "0").slice(0, 6));
  return whole * 1_000_000n + fractional;
}

export function formatAtomicUsdc(value: bigint): string {
  const whole = value / 1_000_000n;
  const fractional = (value % 1_000_000n).toString().padStart(6, "0");
  return `${whole.toString()}.${fractional}`;
}

export function buildPlanRewardAllocations({
  planId,
  totalRewardUsdc,
  winnerCap,
  participantCount,
}: {
  planId: PartnerCampaignPlanId;
  totalRewardUsdc: number | string;
  winnerCap: number;
  participantCount: number;
}) {
  const totalRewardAtomic = parseUsdcToAtomicAmount(totalRewardUsdc);
  const winnerCount = resolveWinnerCountForPlan({ participantCount, winnerCap });
  const allocations = buildRankedRewardAllocations({
    totalRewardAtomic,
    winnerCount,
  });

  return {
    planId,
    winnerCount,
    allocations: allocations.map((allocation) => ({
      ...allocation,
      amountUsdc: formatAtomicUsdc(allocation.amountAtomic),
    })),
  };
}
