import type { PrismaClient } from "@prisma/client";
import { keccak256, stringToBytes } from "viem";
import { nexMarketsContracts } from "@/config/nexmarkets-contracts";
import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";
import { getProofFlowSettlement, resolutionCardForDraft } from "@/lib/services/proofFlowService";
import { sourceQualificationBlocksLaunch } from "@/lib/services/sourceQualificationService";
import type { AuthUser } from "@/lib/types/nexid";
import type { NexMarket, RouteCandidate, RouteDecision, ShapedMarketDraft } from "@/lib/types/nexmarkets";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function openTimeFromRouteDecision(value: unknown) {
  const route = asRecord(value);
  const openAt = route.openAt;
  if (typeof openAt === "number") return new Date(openAt * 1000);
  if (typeof openAt === "bigint") return new Date(Number(openAt) * 1000);
  if (typeof openAt === "string" && /^\d+$/.test(openAt)) return new Date(Number(openAt) * 1000);
  if (typeof openAt === "string") {
    const parsed = new Date(openAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

const CLOSEABLE_MARKET_STATUSES = new Set(["live_pending_open", "trading_live"]);

function closeTimeReached(closeTime: Date | null, now = Date.now()) {
  return Boolean(closeTime && closeTime.getTime() <= now);
}

function effectiveMarketStatus(row: { status: string; origin: string; routeDecision: unknown; closeTime: Date | null }) {
  const now = Date.now();
  if (CLOSEABLE_MARKET_STATUSES.has(row.status) && closeTimeReached(row.closeTime, now)) return "closed";
  if (row.origin !== "native" || row.status !== "live_pending_open") return row.status;
  const openTime = openTimeFromRouteDecision(row.routeDecision);
  if (!openTime || openTime.getTime() > now) return row.status;
  return "trading_live";
}

function serializeMarket(row: {
  id: string;
  origin: string;
  status: string;
  title: string;
  question: string;
  arena: string;
  template: string | null;
  sourceUrl: string | null;
  closeTime: Date | null;
  polymarketMarketId: string | null;
  polymarketConditionId: string | null;
  polymarketClobTokenIds: unknown;
  creatorIdentity: string | null;
  creatorWallet: string | null;
  createdByType?: string | null;
  creatorAgentId?: string | null;
  creatorAgentProfileId?: string | null;
  creatorAgentPublicId?: string | null;
  chainId: number | null;
  contractAddress: string | null;
  resolutionManagerAddress: string | null;
  rulesHash: string | null;
  metadataHash: string | null;
  launchStakeStatus: string | null;
  resolutionState: string | null;
  resolutionCard?: unknown;
  settlementMode?: string | null;
  backupSourceUrl?: string | null;
  yesRule?: string | null;
  noRule?: string | null;
  invalidRule?: string | null;
  challengeWindowSeconds?: number | null;
  challengeWindowEndsAt?: Date | null;
  settlementStatus?: string | null;
  provisionalOutcome?: "ride" | "fade" | "invalid" | null;
  finalOutcome?: "ride" | "fade" | "invalid" | null;
  auditSummary?: string | null;
  finalResolutionNote?: unknown;
  bondAmount?: number | null;
  proposerBondStatus?: string | null;
  challengerBondStatus?: string | null;
  refundStatus?: string | null;
  sourceHealthStatus?: string | null;
  lastSourceCheckAt?: Date | null;
  sourceQualificationStatus?: string | null;
  sourceQualificationScore?: number | null;
  sourceQualificationReason?: string | null;
  sourceValidationTimestamp?: Date | null;
  sourceRepairAttempts?: unknown;
  extractorValidationStatus?: string | null;
  extractorValidationReason?: string | null;
  dryRunStatus?: string | null;
  dryRunResult?: unknown;
  resolutionStatus?: string | null;
  proposedOutcome?: "ride" | "fade" | "invalid" | null;
  routeDecision: unknown;
  createdAt: Date;
  updatedAt: Date;
}, proofFlow?: unknown, nativeStats?: NexMarket["nativeStats"]): NexMarket {
  return {
    id: row.id,
    origin: row.origin as NexMarket["origin"],
    status: effectiveMarketStatus(row) as NexMarket["status"],
    title: row.title,
    question: row.question,
    arena: row.arena,
    template: row.template,
    sourceUrl: row.sourceUrl,
    closeTime: row.closeTime?.toISOString() ?? null,
    polymarketMarketId: row.polymarketMarketId,
    polymarketConditionId: row.polymarketConditionId,
    polymarketClobTokenIds: row.polymarketClobTokenIds,
    creatorIdentity: row.creatorIdentity,
    creatorWallet: row.creatorWallet,
    createdByType: row.createdByType ?? "user",
    creatorAgentId: row.creatorAgentId ?? null,
    creatorAgentProfileId: row.creatorAgentProfileId ?? null,
    creatorAgentPublicId: row.creatorAgentPublicId ?? null,
    chainId: row.chainId,
    contractAddress: row.contractAddress,
    resolutionManagerAddress: row.resolutionManagerAddress,
    rulesHash: row.rulesHash,
    metadataHash: row.metadataHash,
    launchStakeStatus: row.launchStakeStatus,
    resolutionState: row.resolutionState,
    resolutionCard: row.resolutionCard ?? null,
    settlementMode: row.settlementMode ?? null,
    backupSourceUrl: row.backupSourceUrl ?? null,
    yesRule: row.yesRule ?? null,
    noRule: row.noRule ?? null,
    invalidRule: row.invalidRule ?? null,
    challengeWindowSeconds: row.challengeWindowSeconds ?? null,
    challengeWindowEndsAt: row.challengeWindowEndsAt?.toISOString() ?? null,
    settlementStatus: row.settlementStatus ?? "draft",
    provisionalOutcome: row.provisionalOutcome ?? null,
    finalOutcome: row.finalOutcome ?? null,
    auditSummary: row.auditSummary ?? null,
    finalResolutionNote: row.finalResolutionNote ?? null,
    bondAmount: row.bondAmount ?? null,
    proposerBondStatus: row.proposerBondStatus ?? null,
    challengerBondStatus: row.challengerBondStatus ?? null,
    refundStatus: row.refundStatus ?? null,
    proofFlow: proofFlow ?? null,
    nativeStats: nativeStats ?? null,
    sourceHealthStatus: row.sourceHealthStatus ?? "unknown",
    lastSourceCheckAt: row.lastSourceCheckAt?.toISOString() ?? null,
    sourceQualificationStatus: row.sourceQualificationStatus ?? null,
    sourceQualificationScore: row.sourceQualificationScore ?? null,
    sourceQualificationReason: row.sourceQualificationReason ?? null,
    sourceValidationTimestamp: row.sourceValidationTimestamp?.toISOString() ?? null,
    sourceRepairAttempts: row.sourceRepairAttempts ?? null,
    extractorValidationStatus: row.extractorValidationStatus ?? null,
    extractorValidationReason: row.extractorValidationReason ?? null,
    dryRunStatus: row.dryRunStatus ?? null,
    dryRunResult: row.dryRunResult ?? null,
    resolutionStatus: row.resolutionStatus ?? null,
    proposedOutcome: row.proposedOutcome ?? null,
    routeDecision: row.routeDecision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

type NativeListStats = NonNullable<NexMarket["nativeStats"]>;

function nativeStatsForMarket(input: {
  positions: Array<{ side: string; shares: number; notionalUsdc: number; walletAddress: string }>;
  trades: Array<{ notionalUsdc: number; walletAddress: string }>;
  launchStake?: { totalUsdc: number } | null;
}): NativeListStats {
  const traders = new Set([
    ...input.positions.map((row) => row.walletAddress.toLowerCase()),
    ...input.trades.map((row) => row.walletAddress.toLowerCase())
  ]);
  const tradeVolume = input.trades.reduce((sum, row) => sum + row.notionalUsdc, 0);
  const positionVolume = input.positions.reduce((sum, row) => sum + row.notionalUsdc, 0);

  return {
    rideShares: input.positions.filter((row) => row.side === "ride").reduce((sum, row) => sum + row.shares, 0),
    fadeShares: input.positions.filter((row) => row.side === "fade").reduce((sum, row) => sum + row.shares, 0),
    collateralUsdc: tradeVolume || positionVolume,
    launchStakeUsdc: input.launchStake?.totalUsdc ?? null,
    traderCount: traders.size
  };
}

async function nativeStatsForSingleMarket(db: PrismaClient, marketId: string): Promise<NativeListStats> {
  const [positionAgg, tradeAgg, uniquePositions, uniqueTrades, launchStake] = await Promise.all([
    db.nativePosition.groupBy({
      by: ["side"],
      where: { marketId },
      _sum: {
        shares: true,
        notionalUsdc: true
      }
    }),
    db.nativeTrade.aggregate({
      where: { marketId },
      _sum: {
        notionalUsdc: true
      }
    }),
    db.nativePosition.findMany({
      where: { marketId },
      select: { walletAddress: true },
      distinct: ["walletAddress"]
    }),
    db.nativeTrade.findMany({
      where: { marketId },
      select: { walletAddress: true },
      distinct: ["walletAddress"]
    }),
    db.launchStake.findUnique({ where: { marketId } })
  ]);

  const rideStats = positionAgg.find((row) => row.side === "ride");
  const fadeStats = positionAgg.find((row) => row.side === "fade");
  const rideShares = rideStats?._sum.shares ?? 0;
  const fadeShares = fadeStats?._sum.shares ?? 0;

  const tradeVolume = tradeAgg._sum.notionalUsdc ?? 0;
  const positionVolume = positionAgg.reduce((sum, row) => sum + (row._sum.notionalUsdc ?? 0), 0);

  const traders = new Set([
    ...uniquePositions.map((row) => row.walletAddress.toLowerCase()),
    ...uniqueTrades.map((row) => row.walletAddress.toLowerCase())
  ]);

  return {
    rideShares,
    fadeShares,
    collateralUsdc: tradeVolume || positionVolume,
    launchStakeUsdc: launchStake?.totalUsdc ?? null,
    traderCount: traders.size
  };
}

function routeRaw(candidate: RouteCandidate) {
  return {
    ...candidate,
    raw: candidate.raw ?? null
  };
}

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as never;
}

function parsedDate(value?: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function qualificationReasonForDraft(draft: ShapedMarketDraft) {
  return draft.sourceQualification?.reasoning?.join(" ")?.slice(0, 1000) ?? null;
}

function qualificationFieldsForDraft(draft: ShapedMarketDraft) {
  const report = draft.sourceQualification;
  return {
    sourceQualificationStatus: report?.status ?? null,
    sourceQualificationScore: report ? Math.round(report.score) : null,
    sourceQualificationReason: qualificationReasonForDraft(draft),
    sourceValidationTimestamp: parsedDate(report?.sourceValidationTimestamp),
    sourceRepairAttempts: report ? jsonInput(report.repairAttempts ?? []) : undefined,
    extractorValidationStatus: report?.extractorValidationStatus ?? null,
    extractorValidationReason: report?.extractorValidationReason ?? null,
    dryRunStatus: report?.dryRunStatus ?? null,
    dryRunResult: report?.dryRunResult ? jsonInput(report.dryRunResult) : undefined
  };
}

function sourceQualificationAuditMetadata(draft: ShapedMarketDraft) {
  const report = draft.sourceQualification;
  if (!report) return null;
  return jsonInput({
    sourceChosen: report.sourceUrl,
    qualificationStatus: report.status,
    qualificationScore: report.score,
    componentScores: report.componentScores,
    reasoning: report.reasoning,
    repairAttempts: report.repairAttempts,
    replacementSource: report.repairedSourceUrl ?? null,
    extractorValidationStatus: report.extractorValidationStatus,
    extractorValidationReason: report.extractorValidationReason,
    dryRunStatus: report.dryRunStatus,
    dryRunResult: report.dryRunResult,
    settlementMode: report.settlementMode,
    launchBlocked: report.launchBlocked
  });
}

function configuredAddress(value?: string | null) {
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : null;
}

function exactSourceUrlForDraft(draft: ShapedMarketDraft) {
  const sourceUrl = draft.resolution.sourceUrl?.trim();
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    throw new Error("Native market launch requires a locked source URL.");
  }
  return sourceUrl;
}

function assertSourceQualifiedForLaunch(draft: ShapedMarketDraft) {
  if (sourceQualificationBlocksLaunch(draft)) {
    throw new Error(draft.sourceQualification?.launchBlockReason ?? "Source qualification blocked this market launch.");
  }
  const requiresAutoQualification = draft.settlementMode === "auto_verifiable" ||
    ["api", "oracle", "official_score", "official_chart"].includes(draft.resolution.sourceType);
  if (requiresAutoQualification) {
    const report = draft.sourceQualification;
    const autoReady = report?.status === "ACCEPT" &&
      report.extractorValidationStatus === "valid" &&
      report.dryRunStatus === "passed" &&
      report.settlementMode === "auto_verifiable";
    if (!autoReady) {
      throw new Error("Auto-verifiable markets must pass source qualification, extractor validation and dry-run settlement before launch.");
    }
  }
}

function duplicateCheckForDecision(decision: RouteDecision): ShapedMarketDraft["duplicateCheck"] {
  const candidates = [...decision.polymarketCandidates, ...decision.nativeCandidates];
  const status =
    decision.recommendedAction === "trade_polymarket" ? "exact_polymarket" :
    decision.recommendedAction === "join_native" ? "exact_native" :
    decision.status === "related" && decision.polymarketCandidates.some((candidate) => candidate.matchType === "related") ? "related_polymarket" :
    decision.status === "related" && decision.nativeCandidates.some((candidate) => candidate.matchType === "related") ? "related_native" :
    "no_match";
  return {
    status,
    matches: candidates.map((candidate) => ({
      source: candidate.origin === "polymarket" ? "polymarket" : "nex_native",
      id: candidate.id,
      title: candidate.title,
      similarity: candidate.confidence,
      action:
        candidate.matchType === "exact" && candidate.origin === "polymarket" ? "trade_existing" :
        candidate.matchType === "exact" && candidate.origin === "native" ? "join_existing" :
        candidate.matchType === "related" ? "launch_variant" :
        "block_duplicate"
    }))
  };
}

export function rulesHashForDraft(draft: ShapedMarketDraft) {
  return keccak256(stringToBytes(JSON.stringify({
    question: draft.question,
    arena: draft.arena,
    template: draft.template,
    timeframe: draft.timeframe,
    settlementSource: draft.settlementSource,
    sourceUrl: draft.resolution.sourceUrl
  })));
}

export function metadataHashForDraft(draft: ShapedMarketDraft) {
  return keccak256(stringToBytes(JSON.stringify(draft)));
}

export async function listNexMarkets() {
  return withDatabase(
    async (db) => {
      await promoteOpenPendingNativeMarkets(db);
      const rows = await db.market.findMany({
        orderBy: [{ updatedAt: "desc" }],
        take: 50
      });
      const marketIds = rows.map((row) => row.id);
      const nativeMarketIds = rows.filter((row) => row.origin === "native").map((row) => row.id);
      
      const [resolutions, positionGroups, tradeAggregates, uniquePositions, uniqueTrades, launchStakes] = marketIds.length
        ? await Promise.all([
          db.marketResolution.findMany({
            where: { marketId: { in: marketIds } },
            orderBy: { updatedAt: "desc" }
          }),
          nativeMarketIds.length
            ? db.nativePosition.groupBy({
                by: ["marketId", "side"],
                where: { marketId: { in: nativeMarketIds } },
                _sum: { shares: true, notionalUsdc: true }
              })
            : Promise.resolve([]),
          nativeMarketIds.length
            ? db.nativeTrade.groupBy({
                by: ["marketId"],
                where: { marketId: { in: nativeMarketIds } },
                _sum: { notionalUsdc: true }
              })
            : Promise.resolve([]),
          nativeMarketIds.length
            ? db.nativePosition.findMany({
                where: { marketId: { in: nativeMarketIds } },
                select: { marketId: true, walletAddress: true },
                distinct: ["marketId", "walletAddress"]
              })
            : Promise.resolve([]),
          nativeMarketIds.length
            ? db.nativeTrade.findMany({
                where: { marketId: { in: nativeMarketIds } },
                select: { marketId: true, walletAddress: true },
                distinct: ["marketId", "walletAddress"]
              })
            : Promise.resolve([]),
          nativeMarketIds.length ? db.launchStake.findMany({ where: { marketId: { in: nativeMarketIds } } }) : Promise.resolve([])
        ])
        : [[], [], [], [], [], []];

      const resolutionByMarketId = new Map<string, (typeof resolutions)[number]>();
      for (const resolution of resolutions) {
        if (!resolutionByMarketId.has(resolution.marketId)) resolutionByMarketId.set(resolution.marketId, resolution);
      }

      const positionSums = new Map<string, Array<{ side: string; _sum: { shares: number | null; notionalUsdc: number | null } }>>();
      for (const row of positionGroups) {
        const list = positionSums.get(row.marketId) ?? [];
        list.push({ side: row.side, _sum: row._sum });
        positionSums.set(row.marketId, list);
      }

      const tradeSums = new Map(tradeAggregates.map((row) => [row.marketId, row._sum.notionalUsdc ?? 0]));

      const tradersByMarket = new Map<string, Set<string>>();
      for (const row of uniquePositions) {
        const set = tradersByMarket.get(row.marketId) ?? new Set<string>();
        set.add(row.walletAddress.toLowerCase());
        tradersByMarket.set(row.marketId, set);
      }
      for (const row of uniqueTrades) {
        const set = tradersByMarket.get(row.marketId) ?? new Set<string>();
        set.add(row.walletAddress.toLowerCase());
        tradersByMarket.set(row.marketId, set);
      }

      const stakeByMarketId = new Map(launchStakes.map((stake) => [stake.marketId, stake]));

      return rows.map((row) => {
        const resolution = resolutionByMarketId.get(row.id);
        let nativeStats: NativeListStats | null = null;
        if (row.origin === "native") {
          const posList = positionSums.get(row.id) ?? [];
          const rideRow = posList.find((p) => p.side === "ride");
          const fadeRow = posList.find((p) => p.side === "fade");
          const rideShares = rideRow?._sum.shares ?? 0;
          const fadeShares = fadeRow?._sum.shares ?? 0;
          const positionVol = posList.reduce((sum, p) => sum + (p._sum.notionalUsdc ?? 0), 0);
          const tradeVol = tradeSums.get(row.id) ?? 0;
          const traderCount = tradersByMarket.get(row.id)?.size ?? 0;
          const launchStake = stakeByMarketId.get(row.id);

          nativeStats = {
            rideShares,
            fadeShares,
            collateralUsdc: tradeVol || positionVol,
            launchStakeUsdc: launchStake?.totalUsdc ?? null,
            traderCount
          };
        }
        return serializeMarket({
          ...row,
          resolutionStatus: resolution?.status ?? null,
          proposedOutcome: resolution?.proposedOutcome ?? null,
          finalOutcome: resolution?.finalOutcome ?? null
        }, undefined, nativeStats);
      });
    },
    async () => []
  );
}

export async function getNexMarket(id: string) {
  return withDatabase(
    async (db) => {
      await promoteOpenPendingNativeMarkets(db);
      const row = await db.market.findUnique({ where: { id } });
      if (!row) return null;
      const resolution = await db.marketResolution.findFirst({
        where: { marketId: row.id },
        orderBy: { updatedAt: "desc" }
      });
      const proofFlow = row.origin === "native" ? await getProofFlowSettlement(row.id) : null;
      const nativeStats = row.origin === "native" ? await nativeStatsForSingleMarket(db, row.id) : null;
      return serializeMarket({
        ...row,
        resolutionStatus: resolution?.status ?? null,
        proposedOutcome: resolution?.proposedOutcome ?? null,
        finalOutcome: resolution?.finalOutcome ?? null
      }, proofFlow, nativeStats);
    },
    async () => null
  );
}

async function promoteOpenPendingNativeMarkets(db: PrismaClient) {
  const pending = await db.market.findMany({
    where: { origin: "native", status: "live_pending_open" },
    select: { id: true, origin: true, status: true, routeDecision: true, closeTime: true }
  });
  const now = Date.now();
  const readyIds = pending
    .filter((market) => {
      const openTime = openTimeFromRouteDecision(market.routeDecision);
      return Boolean(openTime && openTime.getTime() <= now && (!market.closeTime || market.closeTime.getTime() > now));
    })
    .map((market) => market.id);
  if (!readyIds.length) return;
  await db.market.updateMany({
    where: { id: { in: readyIds }, status: "live_pending_open" },
    data: { status: "trading_live", settlementStatus: "live", resolutionState: "live" }
  });
}

export async function saveMarketDraft(draft: ShapedMarketDraft, user?: AuthUser | null, options?: { creatorAgentId?: string | null; creatorAgentProfileId?: string | null }) {
  return withDatabase(
    async (db) => {
      const row = await db.marketDraft.create({
        data: {
          userId: user?.id,
          walletAddress: user?.walletAddress,
          creatorAgentId: options?.creatorAgentId ?? undefined,
          creatorAgentProfileId: options?.creatorAgentProfileId ?? undefined,
          rawThesis: draft.rawThesis,
          shaped: jsonInput(draft),
          riskStatus: draft.riskStatus,
          ...qualificationFieldsForDraft(draft)
        }
      });
      const auditMetadata = sourceQualificationAuditMetadata(draft);
      if (auditMetadata) {
        await db.adminAuditLog.create({
          data: {
            action: "source_qualification",
            target: row.id,
            metadata: auditMetadata
          }
        });
      }
      return { id: row.id };
    },
    async () => ({ id: `draft_${Date.now()}` })
  );
}

export async function getMarketDraft(draftId: string) {
  return withDatabase(
    async (db) => {
      const row = await db.marketDraft.findUnique({ where: { id: draftId } });
      if (!row || !row.shaped || typeof row.shaped !== "object" || Array.isArray(row.shaped)) return null;
      return row.shaped as ShapedMarketDraft;
    },
    async () => null
  );
}

export async function updateMarketDraftShape(draftId: string, draft: ShapedMarketDraft) {
  if (draftId.startsWith("draft_")) return;
  return withDatabase(
    async (db) => {
      await db.marketDraft.updateMany({
        where: { id: draftId },
        data: {
          shaped: jsonInput(draft),
          riskStatus: draft.riskStatus,
          ...qualificationFieldsForDraft(draft)
        }
      });
      const auditMetadata = sourceQualificationAuditMetadata(draft);
      if (auditMetadata) {
        await db.adminAuditLog.create({
          data: {
            action: "source_qualification_update",
            target: draftId,
            metadata: auditMetadata
          }
        });
      }
    },
    async () => undefined
  );
}

export async function recordRouteDecision(input: { draftId?: string; draft: ShapedMarketDraft; decision: RouteDecision }) {
  return withDatabase(
    async (db) => {
      const draftWithDuplicateCheck = {
        ...input.draft,
        duplicateCheck: duplicateCheckForDecision(input.decision)
      };
      if (input.draftId && !input.draftId.startsWith("draft_")) {
        await db.marketDraft.updateMany({
          where: { id: input.draftId },
          data: {
            shaped: jsonInput(draftWithDuplicateCheck),
            routeDecision: jsonInput(input.decision),
            riskStatus: input.draft.riskStatus,
            ...qualificationFieldsForDraft(draftWithDuplicateCheck)
          }
        });
      }

      const candidates = [...input.decision.polymarketCandidates, ...input.decision.nativeCandidates];
      for (const candidate of candidates) {
        await db.marketRouteMatch.create({
          data: {
            draftId: input.draftId?.startsWith("draft_") ? undefined : input.draftId,
            origin: candidate.origin,
            matchType: candidate.matchType,
            candidateId: candidate.id,
            candidateTitle: candidate.title,
            confidence: candidate.confidence,
            reason: candidate.reason,
            raw: jsonInput(routeRaw(candidate))
          }
        });
      }

      const exact = input.decision.polymarketCandidates.find((candidate) => candidate.matchType === "exact");
      const exactNative = input.decision.nativeCandidates.find((candidate) => candidate.matchType === "exact");
      if (exactNative) {
        const existingNative = await db.market.findUnique({ where: { id: exactNative.id } });
        if (existingNative) return serializeMarket(existingNative);
      }

      if (exact) {
        const existing = await db.market.findFirst({
          where: { origin: "polymarket", polymarketMarketId: exact.id }
        });
        if (existing) return serializeMarket(existing);

        const row = await db.market.create({
          data: {
            origin: "polymarket",
            status: "trading_live",
            title: exact.title,
            question: exact.question ?? exact.title,
            arena: input.draft.arena,
            template: input.draft.template,
            sourceUrl: input.draft.resolution.sourceUrl ?? null,
            polymarketMarketId: exact.id,
            polymarketClobTokenIds: exact.raw?.clobTokenIds ? jsonInput(exact.raw.clobTokenIds) : undefined,
            routeDecision: jsonInput(input.decision),
            ...qualificationFieldsForDraft(input.draft)
          }
        });
        return serializeMarket(row);
      }

      return null;
    },
    async () => null
  );
}

export async function createNativeMarketRecord(input: {
  draft: ShapedMarketDraft;
  user: AuthUser;
  chainId: number;
  rulesHash?: string;
  metadataHash?: string;
  closeTime?: Date;
  resolutionManagerAddress?: string | null;
  createdByType?: string;
  creatorAgentId?: string | null;
  creatorAgentProfileId?: string | null;
  creatorAgentPublicId?: string | null;
}) {
  if (process.env.NATIVE_MARKETS_ENABLED !== "true") {
    throw new Error("Native markets are not enabled yet. Save this thesis as a draft.");
  }

  assertSourceQualifiedForLaunch(input.draft);
  const sourceUrl = exactSourceUrlForDraft(input.draft);
  const computedRulesHash = rulesHashForDraft(input.draft);
  const computedMetadataHash = metadataHashForDraft(input.draft);
  if (input.rulesHash && input.rulesHash.toLowerCase() !== computedRulesHash.toLowerCase()) {
    throw new Error("Market rules changed. Shape the market again before launching.");
  }
  if (input.metadataHash && input.metadataHash.toLowerCase() !== computedMetadataHash.toLowerCase()) {
    throw new Error("Market metadata changed. Shape the market again before launching.");
  }
  const rulesHash = computedRulesHash;
  const metadataHash = computedMetadataHash;
  const resolutionManagerAddress = configuredAddress(input.resolutionManagerAddress ?? nexMarketsContracts(input.chainId)?.resolutionManager);
  const draftCloseTime = input.draft.timeframe?.closeAt ? new Date(input.draft.timeframe.closeAt) : null;
  const closeTime = input.closeTime ?? (draftCloseTime && draftCloseTime.getTime() > Date.now()
    ? draftCloseTime
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const creatorIdentity = resolveIdentityLabel(input.user);
  const resolutionCard = resolutionCardForDraft({ draft: input.draft, closeTime });
  const settlementMode = typeof resolutionCard.settlementMode === "string" ? resolutionCard.settlementMode : "evidence_based";

  return withDatabase(
    async (db) => {
      const existing = await db.market.findFirst({
        where: {
          origin: "native",
          chainId: input.chainId,
          rulesHash
        },
        orderBy: { updatedAt: "desc" }
      });
      if (existing) {
        if (resolutionManagerAddress && existing.resolutionManagerAddress !== resolutionManagerAddress) {
          const updated = await db.market.update({
            where: { id: existing.id },
            data: { resolutionManagerAddress }
          });
          await db.nativeMarketRules.updateMany({
            where: { marketId: existing.id },
            data: { resolutionManagerAddress }
          });
          return serializeMarket(updated);
        }
        return serializeMarket(existing);
      }

      const row = await db.market.create({
        data: {
          origin: "native",
          status: "ready_to_launch",
          title: input.draft.title,
          question: input.draft.question,
          arena: input.draft.arena,
          template: input.draft.template,
          sourceUrl,
          closeTime,
          creatorUserId: input.user.id,
          creatorWallet: input.user.walletAddress,
          creatorIdentity,
          createdByType: input.createdByType ?? "user",
          creatorAgentId: input.creatorAgentId ?? null,
          creatorAgentProfileId: input.creatorAgentProfileId ?? null,
          creatorAgentPublicId: input.creatorAgentPublicId ?? null,
          chainId: input.chainId,
          resolutionManagerAddress,
          rulesHash,
          metadataHash,
          resolutionCard: jsonInput(resolutionCard),
          settlementMode,
          backupSourceUrl: typeof resolutionCard.backupSource === "string" ? resolutionCard.backupSource : null,
          yesRule: resolutionCard.yesRule,
          noRule: resolutionCard.noRule,
          invalidRule: resolutionCard.invalidRule,
          challengeWindowSeconds: resolutionCard.challengeWindowSeconds,
          settlementStatus: "draft",
          bondAmount: Number(process.env.PROOFFLOW_MIN_BOND_USDC ?? 5),
          proposerBondStatus: "not_posted",
          challengerBondStatus: "none",
          refundStatus: "not_required",
          launchStakeStatus: "pending",
          ...qualificationFieldsForDraft(input.draft)
        }
      });
      await db.nativeMarketRules.create({
        data: {
          marketId: row.id,
          rulesHash,
          metadataHash,
          resolutionManagerAddress,
          template: input.draft.template,
          settlementSource: input.draft.settlementSource ?? input.draft.resolution.sourceName,
          closeTime,
          rawRules: jsonInput(input.draft),
          riskStatus: input.draft.riskStatus
        }
      });
      await db.launchStake.create({
        data: {
          marketId: row.id,
          creatorWallet: input.user.walletAddress,
          status: "pending"
        }
      });
      await db.proofFlowAuditEvent.create({
        data: {
          marketId: row.id,
          action: "lock_resolution_card",
          fromStatus: "draft",
          toStatus: "draft",
          actorWallet: input.user.walletAddress,
          metadata: jsonInput({
            settlementMode,
            resolutionCard,
            sourceQualification: input.draft.sourceQualification ?? null,
            rulesHash,
            metadataHash
          })
        }
      });
      return serializeMarket(row);
    },
    async () => {
      throw new Error("Database is required to create native market records");
    }
  );
}
