import type { Position, Receipt } from "@/lib/types/nexid";
import { withDatabase } from "@/lib/server/db";
import { getBoard } from "@/lib/services/boardService";
import { antiGamingPenalty } from "@/lib/services/antiGamingService";
import type { JsonInput } from "@/lib/types/json";

export type EdgeScoreBreakdown = {
  outcomeQuality: number;
  timingQuality: number;
  riskAdjustedReturn: number;
  marketQuality: number;
  proofStrength: number;
  consistency: number;
  antiGamingPenalty: number;
};

export type EdgeScoreResult = {
  score: number;
  breakdown: EdgeScoreBreakdown;
  riskSignals: string[];
};

export function activeSeason() {
  return process.env.NEXID_ACTIVE_SEASON || "Season 1";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function proofStrength(proofLevel?: string | null) {
  if (proofLevel === ".id Verified") return 18;
  if (proofLevel === "Verified") return 14;
  if (proofLevel === "Tracked") return 8;
  return 3;
}

export function calculateEdgeScore(input: {
  returnPct: number;
  amount: number;
  marketQualityScore?: number | null;
  proofLevel?: string | null;
  consistencyCount?: number;
  positionAgeHours?: number;
  executionMode?: string | null;
}): EdgeScoreResult {
  const risk = antiGamingPenalty({
    amount: input.amount,
    returnPct: input.returnPct,
    marketQualityScore: input.marketQualityScore,
    proofLevel: input.proofLevel,
    repeatNarrativeCount: input.consistencyCount,
    executionMode: input.executionMode
  });
  const outcomeQuality = clamp(Math.round(Math.max(input.returnPct, 0) * 0.28), 0, 22);
  const timingQuality = clamp(input.positionAgeHours == null ? 10 : Math.round(18 - input.positionAgeHours / 48), 4, 18);
  const riskAdjustedReturn = clamp(Math.round((Math.max(input.returnPct, -80) + 20) * Math.min(input.amount, 250) / 650), 0, 18);
  const marketQuality = clamp(Math.round((input.marketQualityScore ?? 50) * 0.18), 0, 18);
  const consistency = clamp(Math.round((input.consistencyCount ?? 0) * 2.5), 0, 12);
  const breakdown = {
    outcomeQuality,
    timingQuality,
    riskAdjustedReturn,
    marketQuality,
    proofStrength: proofStrength(input.proofLevel),
    consistency,
    antiGamingPenalty: risk.penalty
  };
  const score = clamp(
    breakdown.outcomeQuality +
    breakdown.timingQuality +
    breakdown.riskAdjustedReturn +
    breakdown.marketQuality +
    breakdown.proofStrength +
    breakdown.consistency -
    breakdown.antiGamingPenalty,
    0,
    100
  );
  return { score, breakdown, riskSignals: risk.signals };
}

export function pointsForPosition(position: Position) {
  const qualityMultiplier = clamp((position.marketQualityScore ?? 55) / 100, 0.35, 1);
  const statusMultiplier = position.status === "pending" ? 0.55 : position.status === "failed" ? 0 : 1;
  return Math.round(clamp(position.amount * 1.4, 4, 120) * qualityMultiplier * statusMultiplier);
}

export function pointsForReceipt(receipt: Pick<Receipt, "returnPct">, amount: number, edgeScore = 0) {
  const profitComponent = clamp(Math.max(receipt.returnPct, 0) * 4, 0, 420);
  const proofComponent = clamp(edgeScore * 9, 0, 900);
  const sizeComponent = clamp(amount * 1.5, 0, 180);
  return Math.round(proofComponent + profitComponent + sizeComponent);
}

export function pointsForIdMint() {
  return 750;
}

export async function recordPointsEvent(input: {
  userId?: string;
  reason: string;
  points: number;
  metadata?: JsonInput;
}) {
  return withDatabase(
    async (db) => {
      await db.pointsEvent.create({
        data: {
          userId: input.userId,
          season: activeSeason(),
          reason: input.reason,
          points: input.points,
          metadata: input.metadata
        }
      });
      if (input.userId) {
        await db.user.update({
          where: { id: input.userId },
          data: { pointsTotal: { increment: input.points } }
        });
      }
      return { ok: true };
    },
    async () => ({ ok: true })
  );
}

export async function getMyPoints(userId?: string) {
  return withDatabase(
    async (db) => {
      const user = userId
        ? await db.user.findUnique({ where: { id: userId }, include: { pointsEvents: { orderBy: { createdAt: "desc" }, take: 20 } } })
        : null;
      const total = user?.pointsTotal ?? user?.pointsEvents.reduce((sum, event) => sum + event.points, 0) ?? 0;
      const rank = userId && total > 0
        ? await db.user.count({ where: { pointsTotal: { gt: total } } }).then((count) => `#${count + 1}`)
        : "Unranked";
      return {
        total,
        rank,
        season: activeSeason(),
        events: user?.pointsEvents.map((event) => ({
          id: event.id,
          reason: event.reason,
          points: event.points,
          createdAt: event.createdAt.toISOString()
        })) ?? []
      };
    },
    async () => ({
      total: 0,
      rank: "Unranked",
      season: activeSeason(),
      events: []
    })
  );
}

export async function getGlobalPointsBoard() {
  return getBoard("global");
}
