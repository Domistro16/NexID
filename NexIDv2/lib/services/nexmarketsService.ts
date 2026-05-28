import { createHash } from "crypto";
import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";
import type { AuthUser } from "@/lib/types/nexid";
import type { NexMarket, RouteCandidate, RouteDecision, ShapedMarketDraft } from "@/lib/types/nexmarkets";

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
  chainId: number | null;
  contractAddress: string | null;
  rulesHash: string | null;
  metadataHash: string | null;
  launchStakeStatus: string | null;
  resolutionState: string | null;
  routeDecision: unknown;
  createdAt: Date;
  updatedAt: Date;
}): NexMarket {
  return {
    id: row.id,
    origin: row.origin as NexMarket["origin"],
    status: row.status as NexMarket["status"],
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
    chainId: row.chainId,
    contractAddress: row.contractAddress,
    rulesHash: row.rulesHash,
    metadataHash: row.metadataHash,
    launchStakeStatus: row.launchStakeStatus,
    resolutionState: row.resolutionState,
    routeDecision: row.routeDecision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
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
  return `0x${createHash("sha256").update(JSON.stringify({
    question: draft.question,
    arena: draft.arena,
    template: draft.template,
    timeframe: draft.timeframe,
    settlementSource: draft.settlementSource
  })).digest("hex")}`;
}

export function metadataHashForDraft(draft: ShapedMarketDraft) {
  return `0x${createHash("sha256").update(JSON.stringify(draft)).digest("hex")}`;
}

export async function listNexMarkets() {
  return withDatabase(
    async (db) => {
      const rows = await db.market.findMany({
        orderBy: [{ updatedAt: "desc" }],
        take: 50
      });
      return rows.map(serializeMarket);
    },
    async () => []
  );
}

export async function getNexMarket(id: string) {
  return withDatabase(
    async (db) => {
      const row = await db.market.findUnique({ where: { id } });
      return row ? serializeMarket(row) : null;
    },
    async () => null
  );
}

export async function saveMarketDraft(draft: ShapedMarketDraft, user?: AuthUser | null) {
  return withDatabase(
    async (db) => {
      const row = await db.marketDraft.create({
        data: {
          userId: user?.id,
          walletAddress: user?.walletAddress,
          rawThesis: draft.rawThesis,
          shaped: jsonInput(draft),
          riskStatus: draft.riskStatus
        }
      });
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
          data: { shaped: jsonInput(draftWithDuplicateCheck), routeDecision: jsonInput(input.decision), riskStatus: input.draft.riskStatus }
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
            sourceUrl: input.draft.resolution.sourceUrl ?? input.draft.settlementSource,
            polymarketMarketId: exact.id,
            polymarketClobTokenIds: exact.raw?.clobTokenIds ? jsonInput(exact.raw.clobTokenIds) : undefined,
            routeDecision: jsonInput(input.decision)
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
}) {
  if (process.env.NATIVE_MARKETS_ENABLED !== "true") {
    throw new Error("Native markets are not enabled yet. Save this thesis as a draft.");
  }
  if (process.env.NATIVE_MARKETS_TESTNET_ONLY === "true" && input.chainId === 8453) {
    throw new Error("Native markets are testnet-only in the current configuration.");
  }

  const rulesHash = input.rulesHash ?? rulesHashForDraft(input.draft);
  const metadataHash = input.metadataHash ?? metadataHashForDraft(input.draft);
  const draftCloseTime = input.draft.timeframe?.closeAt ? new Date(input.draft.timeframe.closeAt) : null;
  const closeTime = input.closeTime ?? (draftCloseTime && draftCloseTime.getTime() > Date.now()
    ? draftCloseTime
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const creatorIdentity = resolveIdentityLabel(input.user);

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
      if (existing) return serializeMarket(existing);

      const row = await db.market.create({
        data: {
          origin: "native",
          status: "ready_to_launch",
          title: input.draft.title,
          question: input.draft.question,
          arena: input.draft.arena,
          template: input.draft.template,
          sourceUrl: input.draft.resolution.sourceUrl ?? input.draft.settlementSource,
          closeTime,
          creatorUserId: input.user.id,
          creatorWallet: input.user.walletAddress,
          creatorIdentity,
          chainId: input.chainId,
          rulesHash,
          metadataHash,
          launchStakeStatus: "pending"
        }
      });
      await db.nativeMarketRules.create({
        data: {
          marketId: row.id,
          rulesHash,
          metadataHash,
          template: input.draft.template,
          settlementSource: input.draft.settlementSource ?? "Specified official public source",
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
      return serializeMarket(row);
    },
    async () => {
      throw new Error("Database is required to create native market records");
    }
  );
}
