import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";
import { getNarrativeById } from "@/lib/services/narrativeService";
import { calculateEdgeScore, pointsForReceipt, recordPointsEvent, type EdgeScoreResult } from "@/lib/services/pointsEngine";
import type { Position, Receipt, Side } from "@/lib/types/nexid";

function isSettlementEligible(status: string) {
  return status === "closed" || status === "resolved";
}

function returnPctForSettlement(input: { amount: number; entryPrice: number; settlementPrice: number; exitValue?: number | null }) {
  const shares = input.amount / Math.max(input.entryPrice, 0.01);
  const exitValue = input.exitValue ?? shares * input.settlementPrice;
  return Math.round(((exitValue - input.amount) / Math.max(input.amount, 0.01)) * 100);
}

type ReceiptSettlementLoad =
  | { ok: false; error: string }
  | {
      ok: true;
      narrativeId: string;
      narrativeName: string;
      side: Side;
      amount: number;
      entryPrice: number;
      identity: string;
      returnPct: number;
      proofLevel: string;
      edge: EdgeScoreResult;
      existingReceiptId: string | null;
      settlementSource: string;
      settledAt: Date;
    };

export async function createReceiptForPosition(input: {
  positionId: string;
  userId?: string;
  narrativeId?: string;
  narrativeName?: string;
  side: Side;
  identity: string;
  amount: number;
  entryPrice?: number;
}): Promise<Receipt> {
  const dbPosition = await withDatabase<ReceiptSettlementLoad>(
    async (db) => {
      const row = await db.position.findFirst({
        where: { id: input.positionId, ...(input.userId ? { userId: input.userId } : {}) },
        include: { narrative: true, user: true, market: true, receipt: true }
      });
      if (!row) return { ok: false as const, error: "Position not found" };
      if (!isSettlementEligible(row.status)) {
        return { ok: false as const, error: "Position has not settled yet. Receipts unlock after closure or resolution." };
      }
      const settlementPrice = row.settlementPrice ?? row.exitPrice;
      if (settlementPrice == null) {
        return { ok: false as const, error: "Position is marked settled but has no settlement price yet." };
      }
      const returnPct = returnPctForSettlement({
        amount: row.amount,
        entryPrice: row.entryPrice,
        settlementPrice,
        exitValue: row.exitValue
      });
      const proofLevel = row.user?.primaryIdName ? ".id Verified" : "Verified";
      const consistencyCount = row.userId ? await db.receipt.count({ where: { userId: row.userId, status: "ready" } }) : 0;
      const positionAgeHours = Math.max(0, (Date.now() - row.createdAt.getTime()) / 36e5);
      const edge = calculateEdgeScore({
        returnPct,
        amount: row.amount,
        marketQualityScore: row.marketQualityScore ?? row.market?.qualityScore ?? 0,
        proofLevel,
        consistencyCount,
        positionAgeHours,
        executionMode: row.executionMode
      });
      return {
        ok: true as const,
        narrativeId: row.narrativeId,
        narrativeName: row.narrative.name,
        side: row.side as Side,
        amount: row.amount,
        entryPrice: row.entryPrice,
        identity: row.user ? resolveIdentityLabel(row.user, input.identity) : input.identity,
        returnPct,
        proofLevel,
        edge,
        existingReceiptId: row.receipt?.id ?? null,
        settlementSource: row.settlementSource ?? "settled-position",
        settledAt: row.settledAt ?? new Date()
      };
    },
    async () => ({ ok: false as const, error: "Database settlement data is required to create receipts." })
  );
  if (!dbPosition.ok) throw new Error(dbPosition.error);

  const narrativeId = dbPosition?.narrativeId ?? input.narrativeId;
  const narrative = narrativeId ? await getNarrativeById(narrativeId) : undefined;
  const side = dbPosition?.side ?? input.side;
  const amount = dbPosition?.amount ?? input.amount;
  const identity = dbPosition?.identity ?? input.identity;
  const narrativeName = dbPosition?.narrativeName ?? input.narrativeName ?? narrative?.name ?? "Narrative";
  const returnPct = dbPosition.returnPct;
  const edgePoints = pointsForReceipt({ returnPct }, amount, dbPosition.edge.score);
  const proofLevel = dbPosition.proofLevel;
  const receipt = await withDatabase(
    async (db) => {
      const row = await db.receipt.upsert({
        where: { positionId: input.positionId },
        update: {
          returnPct,
          proofLevel,
          edgePoints,
          edgeScore: dbPosition.edge.score,
          scoreBreakdown: dbPosition.edge.breakdown,
          rank: side === "fade" ? "#3 Top Faders" : "#4 Top Riders",
          publicUrl: `/receipt/${input.positionId}`,
          resultSource: dbPosition.settlementSource,
          settlementSource: dbPosition.settlementSource,
          settledAt: dbPosition.settledAt
        },
        create: {
          positionId: input.positionId,
          userId: input.userId,
          returnPct,
          proofLevel,
          edgePoints,
          edgeScore: dbPosition.edge.score,
          scoreBreakdown: dbPosition.edge.breakdown,
          rank: side === "fade" ? "#3 Top Faders" : "#4 Top Riders",
          publicUrl: `/receipt/${input.positionId}`,
          resultSource: dbPosition.settlementSource,
          settlementSource: dbPosition.settlementSource,
          settledAt: dbPosition.settledAt
        }
      });
      return {
        id: row.id,
        positionId: input.positionId,
        narrativeName,
        side,
        returnPct: row.returnPct,
        proofLevel: row.proofLevel,
        edgePoints: row.edgePoints,
        edgeScore: row.edgeScore,
        scoreBreakdown: row.scoreBreakdown as Record<string, number> | null,
        rank: row.rank,
        identity,
        publicUrl: row.publicUrl,
        status: row.status,
        cardAsset: row.cardAsset,
        settlementSource: row.settlementSource,
        settledAt: row.settledAt?.toISOString() ?? null
      };
    },
    async () => {
      throw new Error("Database is required to create receipts");
    }
  );
  if (input.userId && !dbPosition.existingReceiptId) {
    await recordPointsEvent({
      userId: input.userId,
      reason: "settled_receipt_verified",
      points: edgePoints,
      metadata: {
        receiptId: receipt.id,
        positionId: input.positionId,
        returnPct,
        edgeScore: dbPosition.edge.score,
        edgeBreakdown: dbPosition.edge.breakdown,
        riskSignals: dbPosition.edge.riskSignals
      }
    });
    await withDatabase(
      async (db) => {
        await db.user.update({
          where: { id: input.userId },
          data: { edgeScoreTotal: { increment: dbPosition.edge.score } }
        });
        return true;
      },
      async () => true
    );
  }
  return receipt;
}

export async function settlePositionForReceipt(input: {
  positionId: string;
  userId?: string;
  settlementPrice: number;
  source?: string;
}) {
  if (input.settlementPrice < 0 || input.settlementPrice > 1) throw new Error("Settlement price must be between 0 and 1.");
  return withDatabase(
    async (db) => {
      const position = await db.position.findFirst({ where: { id: input.positionId, ...(input.userId ? { userId: input.userId } : {}) } });
      if (!position) throw new Error("Position not found");
      const exitValue = returnPctForSettlement({
        amount: position.amount,
        entryPrice: position.entryPrice,
        settlementPrice: input.settlementPrice
      });
      const shares = position.amount / Math.max(position.entryPrice, 0.01);
      const row = await db.position.update({
        where: { id: position.id },
        data: {
          status: "resolved",
          settlementPrice: input.settlementPrice,
          exitPrice: input.settlementPrice,
          exitValue: shares * input.settlementPrice,
          settlementSource: input.source ?? "manual-settlement",
          settledAt: new Date()
        },
        include: { narrative: true }
      });
      return {
        id: row.id,
        returnPct: exitValue,
        status: row.status,
        settlementPrice: row.settlementPrice
      };
    },
    async () => {
      throw new Error("Database is required to settle positions");
    });
}

export async function getReceiptById(id: string) {
  return withDatabase(
    async (db) => {
      const row = await db.receipt.findUnique({
        where: { id },
        include: { position: { include: { narrative: true, user: true } } }
      });
      if (!row) return null;
      const identity = row.position.user ? resolveIdentityLabel(row.position.user) : "tracked";
      return {
        id: row.id,
        positionId: row.positionId,
        narrativeName: row.position.narrative.name,
        side: row.position.side as Side,
        returnPct: row.returnPct,
        proofLevel: row.proofLevel,
        edgePoints: row.edgePoints,
        edgeScore: row.edgeScore,
        scoreBreakdown: row.scoreBreakdown as Record<string, number> | null,
        rank: row.rank,
        identity,
        publicUrl: row.publicUrl,
        status: row.status,
        cardAsset: row.cardAsset,
        settlementSource: row.settlementSource,
        settledAt: row.settledAt?.toISOString() ?? null
      };
    },
    async () => null
  );
}
