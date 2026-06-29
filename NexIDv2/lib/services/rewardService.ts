import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";
import type { JsonInput } from "@/lib/types/json";

export type RewardLevel = {
  level: string;
  badge: string;
  minPoints: number;
  poolWeight: number;
};

export const rewardLevels: RewardLevel[] = [
  { level: "Scout", badge: "Signal Scout", minPoints: 0, poolWeight: 0.1 },
  { level: "Analyst", badge: "Edge Analyst", minPoints: 1000, poolWeight: 0.15 },
  { level: "Operator", badge: "Conviction Operator", minPoints: 5000, poolWeight: 0.2 },
  { level: "Strategist", badge: "Market Strategist", minPoints: 15000, poolWeight: 0.25 },
  { level: "Oracle", badge: "NexID Oracle", minPoints: 40000, poolWeight: 0.3 }
];

const tradingFeeRate = 0.005;
const tradingRewardRate = 0.9;
const mintRewardRate = 0.25;
export const nativeTradingFeeBps = 200;
export const nativeCreatorFeeRate = 0.01;
export const nativeProversPoolFeeRate = 0.002;
export const nativePlatformFeeRate = 0.0015;
export const nativeBuybackBurnFeeRate = 0.0065;

function roundUsd(value: number) {
  return Math.round(value * 100) / 100;
}

function roundUsdc(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function nativeTradingFeeSplit(input: { notionalUsdc: number; feeUsdc: number }) {
  const creatorFeeUsd = roundUsdc(input.notionalUsdc * nativeCreatorFeeRate);
  const proversPoolFeeUsd = roundUsdc(input.notionalUsdc * nativeProversPoolFeeRate);
  const platformFeeUsd = roundUsdc(input.notionalUsdc * nativePlatformFeeRate);
  const buybackBurnFeeUsd = roundUsdc(Math.max(input.feeUsdc - creatorFeeUsd - proversPoolFeeUsd - platformFeeUsd, 0));

  return {
    creatorFeeUsd,
    proversPoolFeeUsd,
    platformFeeUsd,
    buybackBurnFeeUsd
  };
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function startOfUtcWeek(date: Date) {
  const current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() - day + 1);
  current.setUTCHours(0, 0, 0, 0);
  return current;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function activeRewardSeasonWindow(now = new Date()) {
  const start = startOfUtcWeek(now);
  const end = addDays(start, 7);
  const envCode = process.env.NEXID_ACTIVE_REWARD_SEASON?.trim();
  const code = envCode || `${start.getUTCFullYear()}-W${String(isoWeek(start)).padStart(2, "0")}`;
  return {
    code,
    title: `Rewards ${code}`,
    startsAt: start,
    endsAt: end
  };
}

function levelWeightsJson() {
  return rewardLevels.reduce<Record<string, number>>((map, level) => {
    map[level.level] = level.poolWeight;
    return map;
  }, {});
}

export function rewardLevelForPoints(points: number) {
  return rewardLevels.reduce((current, level) => points >= level.minPoints ? level : current, rewardLevels[0]);
}

export function nextRewardLevel(points: number) {
  return rewardLevels.find((level) => points < level.minPoints) ?? null;
}

export function rewardProgress(points: number) {
  const current = rewardLevelForPoints(points);
  const next = nextRewardLevel(points);
  if (!next) return 100;
  const span = Math.max(next.minPoints - current.minPoints, 1);
  return Math.max(0, Math.min(100, Math.round(((points - current.minPoints) / span) * 100)));
}

export async function ensureRewardSeason() {
  const season = activeRewardSeasonWindow();
  return withDatabase(
    async (db) => {
      const row = await db.rewardSeason.upsert({
        where: { code: season.code },
        update: {
          title: season.title,
          startsAt: season.startsAt,
          endsAt: season.endsAt,
          tradingPoolRate: tradingRewardRate,
          mintPoolRate: mintRewardRate,
          levelWeights: levelWeightsJson() as JsonInput
        },
        create: {
          code: season.code,
          title: season.title,
          startsAt: season.startsAt,
          endsAt: season.endsAt,
          tradingPoolRate: tradingRewardRate,
          mintPoolRate: mintRewardRate,
          levelWeights: levelWeightsJson() as JsonInput
        }
      });
      return row;
    },
    async () => ({
      id: season.code,
      code: season.code,
      title: season.title,
      status: "open",
      startsAt: season.startsAt,
      endsAt: season.endsAt,
      tradingRevenueUsd: 0,
      mintRevenueUsd: 0,
      rewardPoolUsd: 0,
      tradingPoolRate: tradingRewardRate,
      mintPoolRate: mintRewardRate,
      levelWeights: levelWeightsJson(),
      finalizedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    })
  );
}

async function recordFeeLedger(input: {
  userId?: string | null;
  source: "trade" | "id_mint" | "manual";
  sourceId?: string | null;
  volumeUsd?: number;
  grossRevenueUsd: number;
  nexidFeeUsd: number;
  rewardContributionUsd: number;
  metadata?: JsonInput;
}) {
  const season = await ensureRewardSeason();
  return withDatabase(
    async (db) => {
      if (input.sourceId) {
        const existing = await db.feeLedger.findUnique({
          where: { source_sourceId: { source: input.source, sourceId: input.sourceId } }
        });
        if (existing) return existing;
      }
      const row = await db.feeLedger.create({
        data: {
          userId: input.userId || undefined,
          seasonCode: season.code,
          source: input.source,
          sourceId: input.sourceId || undefined,
          volumeUsd: roundUsd(input.volumeUsd ?? 0),
          grossRevenueUsd: roundUsd(input.grossRevenueUsd),
          nexidFeeUsd: roundUsd(input.nexidFeeUsd),
          rewardContributionUsd: roundUsd(input.rewardContributionUsd),
          metadata: input.metadata
        }
      });
      await db.rewardSeason.update({
        where: { code: season.code },
        data: {
          tradingRevenueUsd: input.source === "trade" ? { increment: roundUsd(input.nexidFeeUsd) } : undefined,
          mintRevenueUsd: input.source === "id_mint" ? { increment: roundUsd(input.grossRevenueUsd) } : undefined,
          rewardPoolUsd: { increment: roundUsd(input.rewardContributionUsd) }
        }
      });
      return row;
    },
    async () => ({
      id: `${input.source}_${input.sourceId ?? Date.now()}`,
      userId: input.userId ?? null,
      seasonCode: season.code,
      source: String(input.source),
      sourceId: input.sourceId ?? null,
      volumeUsd: input.volumeUsd ?? 0,
      grossRevenueUsd: input.grossRevenueUsd,
      nexidFeeUsd: input.nexidFeeUsd,
      rewardContributionUsd: input.rewardContributionUsd,
      metadata: input.metadata ?? null,
      createdAt: new Date()
    })
  );
}

export async function recordTradingFeeLedger(input: {
  userId?: string | null;
  positionId: string;
  narrativeId: string;
  side: string;
  amountUsd: number;
  executionMode?: string | null;
}) {
  const nexidFeeUsd = roundUsd(input.amountUsd * tradingFeeRate);
  if (nexidFeeUsd <= 0) return null;
  return recordFeeLedger({
    userId: input.userId,
    source: "trade",
    sourceId: input.positionId,
    volumeUsd: input.amountUsd,
    grossRevenueUsd: nexidFeeUsd,
    nexidFeeUsd,
    rewardContributionUsd: roundUsd(nexidFeeUsd * tradingRewardRate),
    metadata: {
      positionId: input.positionId,
      narrativeId: input.narrativeId,
      side: input.side,
      executionMode: input.executionMode ?? "unknown",
      feeRate: tradingFeeRate,
      rewardRate: tradingRewardRate
    }
  });
}

export async function recordNativeTradingFeeLedger(input: {
  userId?: string | null;
  tradeId: string;
  marketId: string;
  side: string;
  notionalUsdc: number;
  feeUsdc: number;
  txHash: string;
}) {
  const split = nativeTradingFeeSplit(input);
  return recordFeeLedger({
    userId: input.userId,
    source: "trade",
    sourceId: `native_trade:${input.tradeId}`,
    volumeUsd: input.notionalUsdc,
    grossRevenueUsd: input.feeUsdc,
    nexidFeeUsd: roundUsd(split.platformFeeUsd + split.proversPoolFeeUsd + split.buybackBurnFeeUsd),
    rewardContributionUsd: split.proversPoolFeeUsd,
    metadata: {
      executionMode: "native_onchain",
      tradeId: input.tradeId,
      marketId: input.marketId,
      side: input.side,
      txHash: input.txHash,
      nativeTradingFeeBps,
      split: {
        creatorFeeUsd: split.creatorFeeUsd,
        platformFeeUsd: split.platformFeeUsd,
        proversPoolFeeUsd: split.proversPoolFeeUsd,
        buybackBurnFeeUsd: split.buybackBurnFeeUsd,
        protocolFeeUsd: split.platformFeeUsd,
        rewardsFeeUsd: split.proversPoolFeeUsd,
        securityFeeUsd: split.buybackBurnFeeUsd
      }
    }
  });
}

export async function recordIdMintFeeLedger(input: {
  userId?: string | null;
  idName: string;
  priceUsd: number;
  txHash?: string | null;
}) {
  if (input.priceUsd <= 0) return null;
  return recordFeeLedger({
    userId: input.userId,
    source: "id_mint",
    sourceId: input.txHash || `id_mint_${input.idName}`,
    volumeUsd: input.priceUsd,
    grossRevenueUsd: input.priceUsd,
    nexidFeeUsd: input.priceUsd,
    rewardContributionUsd: roundUsd(input.priceUsd * mintRewardRate),
    metadata: {
      idName: input.idName,
      txHash: input.txHash ?? null,
      rewardRate: mintRewardRate
    }
  });
}

function scoreRewardInput(input: {
  feePaidUsd: number;
  volumeUsd: number;
  realizedProfitUsd: number;
  uniqueMarkets: number;
  receiptCount: number;
  activeDays: number;
  positionCount: number;
}) {
  const feeScore = Math.min(input.feePaidUsd * 120, 700);
  const volumeScore = Math.min(Math.sqrt(input.volumeUsd) * 3, 350);
  const profitScore = Math.min(input.realizedProfitUsd * 16, 520);
  const marketBonus = Math.min(input.uniqueMarkets * 35, 210);
  const receiptBonus = Math.min(input.receiptCount * 80, 480);
  const consistencyBonus = Math.min(input.activeDays * 12, 120);
  const churnPenalty = input.uniqueMarkets > 0 && input.positionCount > input.uniqueMarkets * 6 ? Math.min((input.positionCount - input.uniqueMarkets * 6) * 12, 240) : 0;
  const noReceiptPenalty = input.volumeUsd > 250 && input.receiptCount === 0 ? 75 : 0;
  const score = Math.max(0, feeScore + volumeScore + profitScore + marketBonus + receiptBonus + consistencyBonus - churnPenalty - noReceiptPenalty);
  return {
    score: roundScore(score),
    breakdown: {
      feeScore: roundScore(feeScore),
      volumeScore: roundScore(volumeScore),
      profitScore: roundScore(profitScore),
      marketBonus: roundScore(marketBonus),
      receiptBonus: roundScore(receiptBonus),
      consistencyBonus: roundScore(consistencyBonus),
      churnPenalty: roundScore(churnPenalty),
      noReceiptPenalty: roundScore(noReceiptPenalty)
    }
  };
}

function allocationStatus(input: { hasActiveId: boolean; riskFlag: string | null }) {
  if (input.riskFlag) return "review";
  if (!input.hasActiveId) return "locked_id_required";
  return "approved";
}

export async function generateRewardCycle() {
  const season = await ensureRewardSeason();
  return withDatabase(
    async (db) => {
      const users = await db.user.findMany({
        where: {
          OR: [
            { feeLedgers: { some: { seasonCode: season.code } } },
            { pointsEvents: { some: { createdAt: { gte: season.startsAt, lt: season.endsAt } } } }
          ]
        },
        include: {
          ids: { where: { status: "active" } },
          feeLedgers: { where: { seasonCode: season.code } }
        }
      });
      const userIds = users.map((user) => user.id);
      const [nativePositions, marketReceipts] = userIds.length
        ? await Promise.all([
          db.nativePosition.findMany({
            where: { userId: { in: userIds }, createdAt: { gte: season.startsAt, lt: season.endsAt } }
          }),
          db.marketReceipt.findMany({
            where: { userId: { in: userIds }, createdAt: { gte: season.startsAt, lt: season.endsAt } }
          })
        ])
        : [[], []];
      const nativePositionsByUser = new Map<string, typeof nativePositions>();
      const marketReceiptsByUser = new Map<string, typeof marketReceipts>();
      for (const position of nativePositions) {
        if (!position.userId) continue;
        nativePositionsByUser.set(position.userId, [...(nativePositionsByUser.get(position.userId) ?? []), position]);
      }
      for (const receipt of marketReceipts) {
        if (!receipt.userId) continue;
        marketReceiptsByUser.set(receipt.userId, [...(marketReceiptsByUser.get(receipt.userId) ?? []), receipt]);
      }

      const rawAllocations = users.map((user) => {
        const currentPositions = nativePositionsByUser.get(user.id) ?? [];
        const currentReceipts = marketReceiptsByUser.get(user.id) ?? [];
        const routedTradeCount = currentReceipts.filter((receipt) => receipt.proof === "Polymarket user-authenticated CLOB").length;
        const marketKeys = new Set([
          ...currentPositions.map((position) => position.marketId),
          ...currentReceipts.map((receipt) => receipt.marketId)
        ]);
        const positionCount = currentPositions.length + routedTradeCount;
        const feePaidUsd = user.feeLedgers.reduce((sum, row) => sum + row.nexidFeeUsd, 0);
        const volumeUsd = user.feeLedgers.reduce((sum, row) => sum + row.volumeUsd, 0);
        const profitUsd = 0;
        const activeDays = new Set(user.feeLedgers.map((row) => row.createdAt.toISOString().slice(0, 10))).size;
        const scored = scoreRewardInput({
          feePaidUsd,
          volumeUsd,
          realizedProfitUsd: profitUsd,
          uniqueMarkets: marketKeys.size,
          receiptCount: currentReceipts.length,
          activeDays,
          positionCount
        });
        const level = rewardLevelForPoints(user.pointsTotal);
        const riskSignals = [
          volumeUsd > 500 && marketKeys.size <= 1 ? "Concentrated single-market volume" : "",
          positionCount > Math.max(currentReceipts.length, 1) * 10 && volumeUsd > 250 ? "High churn without matching receipts" : ""
        ].filter(Boolean);
        return {
          user,
          level,
          weeklyScore: scored.score,
          breakdown: scored.breakdown,
          feePaidUsd: roundUsd(feePaidUsd),
          volumeUsd: roundUsd(volumeUsd),
          profitUsd: roundUsd(profitUsd),
          riskFlag: riskSignals.join("; ") || null,
          hasActiveId: user.ids.length > 0
        };
      });

      const eligible = rawAllocations.filter((row) => row.weeklyScore > 0 && !row.riskFlag);
      const activeLevelWeight = eligible.reduce((sum, row, index, list) => {
        if (list.findIndex((item) => item.level.level === row.level.level) !== index) return sum;
        return sum + row.level.poolWeight;
      }, 0);
      const poolUsd = season.rewardPoolUsd;

      const allocationRows = await Promise.all(rawAllocations.map(async (row) => {
        const levelUsers = eligible.filter((item) => item.level.level === row.level.level);
        const levelScore = levelUsers.reduce((sum, item) => sum + item.weeklyScore, 0);
        const levelPool = activeLevelWeight > 0 ? poolUsd * (row.level.poolWeight / activeLevelWeight) : 0;
        const rewardShareUsd = row.weeklyScore > 0 && !row.riskFlag && levelScore > 0
          ? roundUsd(levelPool * (row.weeklyScore / levelScore))
          : 0;
        const status = allocationStatus({ hasActiveId: row.hasActiveId, riskFlag: row.riskFlag });
        const allocation = await db.rewardAllocation.upsert({
          where: { seasonCode_userId: { seasonCode: season.code, userId: row.user.id } },
          update: {
            level: row.level.level,
            badge: row.level.badge,
            lifetimePoints: row.user.pointsTotal,
            weeklyScore: row.weeklyScore,
            eligibleVolumeUsd: row.volumeUsd,
            feePaidUsd: row.feePaidUsd,
            realizedProfitUsd: row.profitUsd,
            rewardShareUsd,
            status,
            riskFlag: row.riskFlag,
            breakdown: row.breakdown as JsonInput
          },
          create: {
            seasonCode: season.code,
            userId: row.user.id,
            level: row.level.level,
            badge: row.level.badge,
            lifetimePoints: row.user.pointsTotal,
            weeklyScore: row.weeklyScore,
            eligibleVolumeUsd: row.volumeUsd,
            feePaidUsd: row.feePaidUsd,
            realizedProfitUsd: row.profitUsd,
            rewardShareUsd,
            status,
            riskFlag: row.riskFlag,
            breakdown: row.breakdown as JsonInput
          }
        });
        const rewardScoreTotal = await db.rewardAllocation.aggregate({
          where: { userId: row.user.id },
          _sum: { weeklyScore: true }
        });
        await db.user.update({
          where: { id: row.user.id },
          data: {
            rewardLevel: row.level.level,
            rewardBadge: row.level.badge,
            rewardScoreTotal: roundScore(rewardScoreTotal._sum.weeklyScore ?? row.weeklyScore)
          }
        });
        return allocation;
      }));

      await db.rewardSeason.update({
        where: { code: season.code },
        data: { status: "review" }
      });
      await db.adminAuditLog.create({
        data: {
          action: "generate_reward_cycle",
          target: season.code,
          metadata: { allocations: allocationRows.length, poolUsd }
        }
      });

      return {
        seasonCode: season.code,
        rewardPoolUsd: roundUsd(poolUsd),
        allocations: allocationRows.length,
        pending: allocationRows.filter((row) => row.status === "pending").length,
        review: allocationRows.filter((row) => row.status === "review").length,
        blocked: allocationRows.filter((row) => row.status === "blocked").length,
        locked: allocationRows.filter((row) => row.status === "locked_id_required").length
      };
    },
    async () => ({
      seasonCode: season.code,
      rewardPoolUsd: 0,
      allocations: 0,
      pending: 0,
      review: 0,
      blocked: 0,
      locked: 0
    })
  );
}

export async function updateRewardAllocationAdmin(input: {
  id: string;
  status: string;
  txHash?: string | null;
  note?: string | null;
}) {
  return withDatabase(
    async (db) => {
      const current = await db.rewardAllocation.findUnique({
        where: { id: input.id },
        include: { payout: true }
      });
      const allocation = await db.rewardAllocation.update({
        where: { id: input.id },
        data: {
          status: input.status,
          reviewedAt: input.status === "approved" || input.status === "locked_id_required" || input.status === "blocked" || input.status === "paid" ? new Date() : undefined,
          paidAt: input.status === "paid" ? new Date() : undefined,
          txHash: input.txHash || undefined
        }
      });
      if (input.status === "paid") {
        await db.rewardPayout.upsert({
          where: { allocationId: allocation.id },
          update: {
            amountUsd: allocation.rewardShareUsd,
            status: "paid",
            txHash: input.txHash || undefined,
            note: input.note || undefined
          },
          create: {
            allocationId: allocation.id,
            userId: allocation.userId,
            amountUsd: allocation.rewardShareUsd,
            status: "paid",
            txHash: input.txHash || undefined,
            note: input.note || undefined
          }
        });
        const previousPaidAmount = current?.status === "paid" ? current.payout?.amountUsd ?? current.rewardShareUsd : 0;
        const delta = roundUsd(allocation.rewardShareUsd - previousPaidAmount);
        if (delta !== 0) {
          await db.user.update({
            where: { id: allocation.userId },
            data: { rewardEarnedUsd: { increment: delta } }
          });
        }
      }
      await db.adminAuditLog.create({
        data: { action: "update_reward_allocation", target: allocation.id, metadata: input }
      });
      return allocation;
    },
    async () => {
      throw new Error("Database is required to update reward allocations");
    }
  );
}

export async function getRewardSummary(userId?: string) {
  const season = await ensureRewardSeason();
  return withDatabase(
    async (db) => {
      const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
      const allocation = userId
        ? await db.rewardAllocation.findUnique({ where: { seasonCode_userId: { seasonCode: season.code, userId } } })
        : null;
      const ledgers = userId ? await db.feeLedger.findMany({ where: { seasonCode: season.code, userId } }) : [];
      const pendingUsd = userId
        ? await db.rewardAllocation.aggregate({ where: { userId, status: { in: ["pending", "review", "locked_id_required"] } }, _sum: { rewardShareUsd: true } })
        : null;
      const paidUsd = userId
        ? await db.rewardAllocation.aggregate({ where: { userId, status: "paid" }, _sum: { rewardShareUsd: true } })
        : null;
      const points = user?.pointsTotal ?? 0;
      const level = rewardLevelForPoints(points);
      const next = nextRewardLevel(points);
      return {
        seasonCode: season.code,
        seasonTitle: season.title,
        status: allocation?.status ?? "not_qualified",
        level: allocation?.level ?? level.level,
        badge: allocation?.badge ?? level.badge,
        lifetimePoints: points,
        weeklyScore: allocation?.weeklyScore ?? 0,
        rewardPoolUsd: roundUsd(season.rewardPoolUsd),
        pendingUsd: roundUsd(pendingUsd?._sum.rewardShareUsd ?? 0),
        paidUsd: roundUsd(paidUsd?._sum.rewardShareUsd ?? user?.rewardEarnedUsd ?? 0),
        projectedUsd: roundUsd(allocation?.rewardShareUsd ?? 0),
        feePaidUsd: roundUsd(ledgers.reduce((sum, row) => sum + row.nexidFeeUsd, 0)),
        eligibleVolumeUsd: roundUsd(ledgers.reduce((sum, row) => sum + row.volumeUsd, 0)),
        nextLevel: next ? { level: next.level, badge: next.badge, minPoints: next.minPoints } : null,
        progressPct: rewardProgress(points),
        riskFlag: allocation?.riskFlag ?? null
      };
    },
    async () => {
      const level = rewardLevelForPoints(0);
      return {
        seasonCode: season.code,
        seasonTitle: season.title,
        status: "not_qualified",
        level: level.level,
        badge: level.badge,
        lifetimePoints: 0,
        weeklyScore: 0,
        rewardPoolUsd: 0,
        pendingUsd: 0,
        paidUsd: 0,
        projectedUsd: 0,
        feePaidUsd: 0,
        eligibleVolumeUsd: 0,
        nextLevel: nextRewardLevel(0),
        progressPct: 0,
        riskFlag: null
      };
    }
  );
}

export async function listRewardRows() {
  const season = await ensureRewardSeason();
  return withDatabase(
    async (db) => {
      const rows = await db.rewardAllocation.findMany({
        where: { seasonCode: season.code },
        include: { user: true, payout: true },
        orderBy: [{ rewardShareUsd: "desc" }, { weeklyScore: "desc" }],
        take: 100
      });
      return rows.map((row, index) => ({
        id: row.id,
        rank: `#${index + 1}`,
        identity: resolveIdentityLabel(row.user),
        level: row.level,
        badge: row.badge,
        score: row.weeklyScore.toFixed(2),
        volume: `$${row.eligibleVolumeUsd.toFixed(2)}`,
        fees: `$${row.feePaidUsd.toFixed(2)}`,
        profit: `$${row.realizedProfitUsd.toFixed(2)}`,
        reward: `$${row.rewardShareUsd.toFixed(2)}`,
        status: row.status,
        risk: row.riskFlag ?? "Normal",
        payout: row.payout?.status ?? "none",
        txHash: row.txHash ?? row.payout?.txHash ?? ""
      }));
    },
    async () => []
  );
}

export async function rewardSeasonAdminSummary() {
  const season = await ensureRewardSeason();
  return withDatabase(
    async (db) => {
      const allocationCount = await db.rewardAllocation.count({ where: { seasonCode: season.code } });
      const reviewCount = await db.rewardAllocation.count({ where: { seasonCode: season.code, status: "review" } });
      const pendingUsd = await db.rewardAllocation.aggregate({ where: { seasonCode: season.code, status: { in: ["pending", "approved", "review", "locked_id_required"] } }, _sum: { rewardShareUsd: true } });
      const paidUsd = await db.rewardAllocation.aggregate({ where: { seasonCode: season.code, status: "paid" }, _sum: { rewardShareUsd: true } });
      return {
        code: season.code,
        status: season.status,
        tradingRevenueUsd: roundUsd(season.tradingRevenueUsd),
        mintRevenueUsd: roundUsd(season.mintRevenueUsd),
        rewardPoolUsd: roundUsd(season.rewardPoolUsd),
        allocationCount,
        reviewCount,
        pendingUsd: roundUsd(pendingUsd._sum.rewardShareUsd ?? 0),
        paidUsd: roundUsd(paidUsd._sum.rewardShareUsd ?? 0)
      };
    },
    async () => ({
      code: season.code,
      status: season.status,
      tradingRevenueUsd: 0,
      mintRevenueUsd: 0,
      rewardPoolUsd: 0,
      allocationCount: 0,
      reviewCount: 0,
      pendingUsd: 0,
      paidUsd: 0
    })
  );
}
