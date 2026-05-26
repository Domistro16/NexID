import { withDatabase } from "@/lib/server/db";
import { assertNarrativeTradable } from "@/lib/services/eligibilityService";
import { executionPolicy, getPolymarketOrderStatus, placeOrderThroughAdapter, type PlaceOrderInput } from "@/lib/services/executionAdapter";
import { getExecutionMarket } from "@/lib/services/executionMarketService";
import { getNarrativeById } from "@/lib/services/narrativeService";
import { pointsForPosition, recordPointsEvent } from "@/lib/services/pointsEngine";
import { recordTradingFeeLedger } from "@/lib/services/rewardService";
import type { Position } from "@/lib/types/nexid";

function sharesFor(amount: number, entryPrice: number) {
  return amount / Math.max(entryPrice, 0.01);
}

const finalPositionStatuses = new Set(["closed", "resolved"]);

type PositionStatus = "pending" | "live" | "partial_fill" | "filled" | "closed" | "resolved" | "failed";

type UserSignedPositionSyncInput = {
  positionId: string;
  userId: string;
  userWalletAddress: string;
  executionId: string;
  walletAddress?: string;
  outcomeToken?: string | null;
  status: PositionStatus;
  fillStatus?: string;
  exitPrice?: number | null;
  settlementPrice?: number | null;
  averagePrice?: number | null;
  filledSize?: number | null;
  originalSize?: number | null;
  settledAt?: string | null;
  raw?: Record<string, unknown>;
};

function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function toPosition(row: {
  id: string;
  userId: string | null;
  narrativeId: string;
  marketId: string | null;
  narrative: { name: string };
  side: "ride" | "fade";
  orderType: "market" | "limit";
  amount: number;
  entryPrice: number;
  requestedWalletAddress: string | null;
  executionMode: string;
  marketQualityScore: number | null;
  outcomeToken: string | null;
  executionId: string | null;
  proof: string | null;
  fillStatus: string | null;
  status: "pending" | "live" | "partial_fill" | "filled" | "closed" | "resolved" | "failed";
  exitPrice: number | null;
  settlementPrice: number | null;
  exitValue: number | null;
  settlementSource: string | null;
  settledAt: Date | null;
  createdAt: Date;
}): Position {
  return {
    id: row.id,
    userId: row.userId,
    narrativeId: row.narrativeId,
    marketId: row.marketId,
    narrativeName: row.narrative.name,
    side: row.side,
    orderType: row.orderType,
    amount: row.amount,
    entryPrice: row.entryPrice,
    requestedWalletAddress: row.requestedWalletAddress,
    executionMode: row.executionMode,
    marketQualityScore: row.marketQualityScore,
    outcomeToken: row.outcomeToken,
    executionId: row.executionId,
    proof: row.proof,
    fillStatus: row.fillStatus,
    status: row.status,
    exitPrice: row.exitPrice,
    settlementPrice: row.settlementPrice,
    exitValue: row.exitValue,
    settlementSource: row.settlementSource,
    settledAt: row.settledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

export async function listPositions(userId?: string): Promise<Position[]> {
  return withDatabase(
    async (db) => {
      const rows = await db.position.findMany({
        where: userId ? { userId } : undefined,
        include: { narrative: true },
        orderBy: { createdAt: "desc" },
        take: 25
      });
      return rows.map(toPosition);
    },
    async () => []
  );
}

export async function placePosition(input: PlaceOrderInput & { userId?: string }): Promise<Position> {
  const narrative = await getNarrativeById(input.narrativeId);
  if (!narrative) throw new Error("Narrative not found");
  assertNarrativeTradable(narrative);
  const executionMarket = await getExecutionMarket(input.narrativeId, input.side);
  const marketId = executionMarket?.marketId ?? (narrative as { bestMarketId?: string | null }).bestMarketId ?? undefined;
  const execution = await placeOrderThroughAdapter(input);
  const orderIntent = {
    narrativeId: input.narrativeId,
    side: input.side,
    orderType: input.orderType,
    amount: input.amount,
    walletAddress: input.walletAddress ?? null
  };
  const orderPreview = {
    entryPrice: input.entryPrice,
    estimatedShares: sharesFor(input.amount, input.entryPrice),
    maxLoss: input.amount,
    maxReturn: sharesFor(input.amount, input.entryPrice),
    fee: input.amount * 0.0075,
    polymarketFee: input.amount * 0.0025,
    nexidFee: input.amount * 0.005,
    rewardContribution: input.amount * 0.005 * 0.9,
    marketQualityScore: executionMarket?.qualityScore ?? null
  };

  const position = await withDatabase<Position>(
    async (db) => {
      const row = await db.position.create({
        data: {
          userId: input.userId,
          narrativeId: narrative.id,
          marketId,
          side: input.side,
          orderType: input.orderType,
          amount: input.amount,
          entryPrice: input.entryPrice,
          requestedWalletAddress: input.walletAddress,
          executionMode: execution.executionMode,
          orderIntent,
          orderPreview,
          marketQualityScore: executionMarket?.qualityScore,
          outcomeToken: execution.outcomeToken,
          executionId: execution.executionId,
          builder: execution.builderAttribution,
          fillStatus: execution.fillStatus,
          proof: execution.proof,
          status: execution.status
        }
      });
      return toPosition({ ...row, narrative: { name: narrative.name } });
    },
    async () => {
      throw new Error("Database is required to place positions");
    }
  );
  if (input.userId) {
    await recordTradingFeeLedger({
      userId: input.userId,
      positionId: position.id,
      narrativeId: position.narrativeId,
      side: position.side,
      amountUsd: position.amount,
      executionMode: position.executionMode
    });
    await recordPointsEvent({
      userId: input.userId,
      reason: "position_placed",
      points: pointsForPosition(position),
      metadata: {
        positionId: position.id,
        narrativeId: position.narrativeId,
        side: position.side,
        marketQualityScore: position.marketQualityScore ?? 0,
        executionMode: position.executionMode ?? "unknown"
      }
    });
  }
  return position;
}

export async function recordUserSignedPosition(input: PlaceOrderInput & {
  userId?: string;
  marketId?: string | null;
  outcomeToken: string;
  executionId: string;
  fillStatus?: string;
  executionStatus: "pending" | "live" | "partial_fill" | "filled" | "failed";
  raw?: Record<string, unknown>;
}): Promise<Position> {
  const policy = executionPolicy();
  if (!policy.userSignedAvailable) {
    throw new Error("User-signed Polymarket execution is not enabled for this deployment.");
  }
  const narrative = await getNarrativeById(input.narrativeId);
  if (!narrative) throw new Error("Narrative not found");
  assertNarrativeTradable(narrative);
  const executionMarket = await getExecutionMarket(input.narrativeId, input.side);
  if (!executionMarket?.tokenId || executionMarket.tokenId !== input.outcomeToken) {
    throw new Error("Signed order token does not match the mapped Ride/Fade market.");
  }
  const orderIntent = {
    narrativeId: input.narrativeId,
    side: input.side,
    orderType: input.orderType,
    amount: input.amount,
    walletAddress: input.walletAddress ?? null,
    custody: "user_signed"
  };
  const orderPreview = {
    entryPrice: input.entryPrice,
    estimatedShares: sharesFor(input.amount, input.entryPrice),
    maxLoss: input.amount,
    maxReturn: sharesFor(input.amount, input.entryPrice),
    fee: input.amount * 0.0075,
    polymarketFee: input.amount * 0.0025,
    nexidFee: input.amount * 0.005,
    rewardContribution: input.amount * 0.005 * 0.9,
    marketQualityScore: executionMarket.qualityScore
  };
  const position = await withDatabase<Position>(
    async (db) => {
      const row = await db.position.create({
        data: {
          userId: input.userId,
          narrativeId: narrative.id,
          marketId: executionMarket.marketId ?? input.marketId ?? undefined,
          side: input.side,
          orderType: input.orderType,
          amount: input.amount,
          entryPrice: input.entryPrice,
          requestedWalletAddress: input.walletAddress,
          executionMode: "user_signed",
          orderIntent,
          orderPreview,
          marketQualityScore: executionMarket.qualityScore,
          outcomeToken: input.outcomeToken,
          executionId: input.executionId,
          builder: process.env.POLYMARKET_BUILDER_CODE ?? process.env.NEXT_PUBLIC_POLYMARKET_BUILDER_CODE ?? "nexid",
          fillStatus: input.fillStatus ?? "submitted",
          proof: "Polymarket user-signed CLOB",
          status: input.executionStatus
        }
      });
      return toPosition({ ...row, narrative: { name: narrative.name } });
    },
    async () => {
      throw new Error("Database is required to record user-signed positions");
    }
  );
  if (input.userId) {
    await recordTradingFeeLedger({
      userId: input.userId,
      positionId: position.id,
      narrativeId: position.narrativeId,
      side: position.side,
      amountUsd: position.amount,
      executionMode: "user_signed"
    });
    await recordPointsEvent({
      userId: input.userId,
      reason: "position_placed:user_signed",
      points: pointsForPosition(position),
      metadata: {
        positionId: position.id,
        narrativeId: position.narrativeId,
        side: position.side,
        marketQualityScore: position.marketQualityScore ?? 0,
        executionMode: "user_signed",
        executionId: input.executionId,
        clobStatus: input.fillStatus ?? input.executionStatus
      }
    });
  }
  return position;
}

export async function syncPositionExecution(positionId: string, userId?: string) {
  return withDatabase(
    async (db) => {
      const position = await db.position.findFirst({ where: { id: positionId, ...(userId ? { userId } : {}) } });
      if (!position) throw new Error("Position not found");
      if (position.executionMode === "user_signed") {
        throw new Error("User-signed positions must be synced from the connected wallet.");
      }
      if (!position.executionId) throw new Error("Position has no execution id");
      const execution = await getPolymarketOrderStatus(position.executionId);
      const exitPrice = execution.exitPrice ?? execution.settlementPrice ?? undefined;
      const exitValue = exitPrice == null ? undefined : sharesFor(position.amount, position.entryPrice) * exitPrice;
      const settledAt = execution.settledAt ? new Date(execution.settledAt) : undefined;
      const updated = await db.position.update({
        where: { id: position.id },
        data: {
          status: execution.status,
          fillStatus: execution.fillStatus,
          proof: execution.raw ? "Polymarket CLOB synced" : position.proof,
          exitPrice,
          settlementPrice: execution.settlementPrice ?? undefined,
          exitValue,
          settlementSource: execution.settlementSource ?? undefined,
          settledAt
        },
        include: { narrative: true }
      });
      return toPosition(updated);
    },
    async () => {
      throw new Error("Database is required to sync position execution");
    }
  );
}

export async function syncUserSignedPositionSettlement(input: UserSignedPositionSyncInput) {
  return withDatabase(
    async (db) => {
      const position = await db.position.findFirst({
        where: { id: input.positionId, userId: input.userId },
        include: { narrative: true, receipt: true }
      });
      if (!position) throw new Error("Position not found");
      if (position.executionMode !== "user_signed") {
        throw new Error("This position is not a user-signed Polymarket position.");
      }
      if (!position.executionId || position.executionId !== input.executionId) {
        throw new Error("Synced Polymarket order does not match this position.");
      }
      if (input.walletAddress && !sameAddress(input.walletAddress, input.userWalletAddress)) {
        throw new Error("Connected wallet does not match the authenticated NexID session.");
      }
      if (position.requestedWalletAddress && !sameAddress(position.requestedWalletAddress, input.userWalletAddress)) {
        throw new Error("This position belongs to a different signing wallet.");
      }
      if (position.outcomeToken && input.outcomeToken && position.outcomeToken !== input.outcomeToken) {
        throw new Error("Synced Polymarket token does not match this position.");
      }

      const incomingFinal = finalPositionStatuses.has(input.status);
      const currentFinal = finalPositionStatuses.has(position.status);
      const settlementPrice = input.settlementPrice ?? null;
      const exitPrice = input.exitPrice ?? settlementPrice;
      if (incomingFinal && exitPrice == null) {
        throw new Error("Polymarket sync did not include a settlement or exit price yet. Try again after market finalization.");
      }
      if (position.receipt && exitPrice != null) {
        const currentSettlement = position.settlementPrice ?? position.exitPrice;
        if (currentSettlement != null && Math.abs(currentSettlement - exitPrice) > 0.000001) {
          throw new Error("This position already has a receipt. Settlement changes require internal review.");
        }
      }

      const nextStatus = currentFinal && !incomingFinal ? position.status : input.status;
      const nextExitPrice = incomingFinal ? exitPrice : position.exitPrice;
      const nextSettlementPrice = incomingFinal ? settlementPrice ?? exitPrice : position.settlementPrice;
      const nextExitValue = nextExitPrice == null ? position.exitValue : sharesFor(position.amount, position.entryPrice) * nextExitPrice;
      const syncedAt = input.settledAt ? new Date(input.settledAt) : new Date();
      const orderPreview = position.orderPreview && typeof position.orderPreview === "object" && !Array.isArray(position.orderPreview)
        ? position.orderPreview as Record<string, unknown>
        : {};

      const updated = await db.position.update({
        where: { id: position.id },
        data: {
          status: nextStatus,
          fillStatus: input.fillStatus ?? position.fillStatus,
          proof: "Polymarket user-signed CLOB browser sync",
          exitPrice: nextExitPrice ?? undefined,
          settlementPrice: nextSettlementPrice ?? undefined,
          exitValue: nextExitValue ?? undefined,
          settlementSource: incomingFinal ? "Polymarket user-signed browser sync" : position.settlementSource,
          settledAt: incomingFinal ? syncedAt : position.settledAt,
          orderPreview: {
            ...orderPreview,
            lastUserSync: {
              status: input.status,
              fillStatus: input.fillStatus ?? null,
              averagePrice: input.averagePrice ?? null,
              filledSize: input.filledSize ?? null,
              originalSize: input.originalSize ?? null,
              syncedAt: new Date().toISOString()
            }
          }
        },
        include: { narrative: true }
      });
      return toPosition(updated);
    },
    async () => {
      throw new Error("Database is required to sync user-signed positions");
    }
  );
}
