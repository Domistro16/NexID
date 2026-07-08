import { createHash } from "crypto";
import { createPublicClient, createWalletClient, http, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { requireDatabase, withDatabase } from "@/lib/server/db";
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  erc20Abi,
  nativeMarketAddresses
} from "@/lib/contracts/nexmarkets";
import { callBankrJson, bankrAiReady } from "@/lib/services/bankr/bankrAiService";
import {
  hashSettlementReceiptPayload,
  isMaterialEvidenceChange,
  validateEvidenceTimestamp,
  validateReviewerNoteReveal,
  validProofFlowHash,
  type MaterialEvidenceLevel
} from "@/lib/services/proofFlowPolicy";
import {
  applyFinalProverSlashing,
  defaultProofFlowProverPoolId,
  proofFlowActiveProverRoleTypes,
  proofFlowProverConsensusCount,
  proofFlowProverPanelSize,
  proversPoolFundingSources,
  proversPoolBaseSettlementRewardUsdc,
  recordProverPoolLedger,
  reputationWeightsForAssignments,
  selectProverPanelFromPool,
  syncProverStatsForMarket
} from "@/lib/services/proofFlowProverService";
import type { ShapedMarketDraft } from "@/lib/types/nexmarkets";

type ProofFlowOutcome = "ride" | "fade" | "invalid";
type ProofFlowStatus =
  | "draft"
  | "live"
  | "closed"
  | "challenge_open"
  | "evidence_review"
  | "additional_review"
  | "finalized_yes"
  | "finalized_no"
  | "finalized_invalid"
  | "refunded";

type ProofFlowInput = {
  marketId: string;
  walletAddress?: string | null;
  outcome?: ProofFlowOutcome | null;
  evidenceText?: string | null;
  evidenceUrl?: string | null;
  sourceUrl?: string | null;
  bondTxHash?: string | null;
  reason?: string | null;
  reviewPanelId?: string | null;
  evidenceTimestamp?: string | null;
};

type ProofFlowAuditFlags = {
  wrongSourceUsage: boolean;
  timestampMismatch: boolean;
  contradictionsDetected: boolean;
  coordinatedNotes: boolean;
  evidenceSufficient: boolean;
  seriousConcern: boolean;
  clean: boolean;
  summary: string;
  recommendedOutcome: ProofFlowOutcome | null;
  caveats: string[];
};

type SecondPanelTrigger = {
  triggerType: string;
  detail: string;
  metadata?: Record<string, unknown>;
};

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function proofFlowChallengeWindowSeconds() {
  const configured = Number(process.env.PROOFFLOW_CHALLENGE_WINDOW_SECONDS ?? process.env.NATIVE_PROOFFLOW_CHALLENGE_WINDOW_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 24 * 60 * 60;
}

function proofFlowNeedsEvidenceWindowSeconds() {
  const configured = Number(process.env.PROOFFLOW_NEEDS_EVIDENCE_WINDOW_SECONDS ?? process.env.PROOFFLOW_CHALLENGE_WINDOW_SECONDS ?? process.env.NATIVE_PROOFFLOW_CHALLENGE_WINDOW_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 24 * 60 * 60;
}

function challengeWindowEnd() {
  return new Date(Date.now() + proofFlowChallengeWindowSeconds() * 1000);
}

function needsEvidenceWindowEnd(from = new Date()) {
  return new Date(from.getTime() + proofFlowNeedsEvidenceWindowSeconds() * 1000);
}

function reviewWindowSeconds() {
  const configured = Number(process.env.PROOFFLOW_REVIEW_WINDOW_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 12 * 60 * 60;
}

function revealWindowSeconds() {
  const configured = Number(process.env.PROOFFLOW_REVEAL_WINDOW_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 6 * 60 * 60;
}

function proverPoolSettlementRewardUsdc() {
  return proversPoolBaseSettlementRewardUsdc();
}

function escalationExposureThresholdUsdc() {
  const configured = Number(process.env.PROOFFLOW_ESCALATION_EXPOSURE_USDC);
  return Number.isFinite(configured) && configured > 0 ? configured : 5000;
}

function proofFlowRefundChainId() {
  const configured = Number(process.env.PROOFFLOW_REFUND_CHAIN_ID ?? process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID);
  return configured === BASE_MAINNET_CHAIN_ID ? BASE_MAINNET_CHAIN_ID : BASE_SEPOLIA_CHAIN_ID;
}

function proofFlowRefundRpcUrl(chainId: number) {
  return process.env.PROOFFLOW_REFUND_RPC_URL
    || (chainId === BASE_MAINNET_CHAIN_ID ? process.env.BASE_RPC_URL : process.env.BASE_SEPOLIA_RPC_URL)
    || (chainId === BASE_MAINNET_CHAIN_ID ? "https://mainnet.base.org" : "https://sepolia.base.org");
}

function proofFlowRefundPrivateKey() {
  const value = process.env.PROOFFLOW_REFUND_PRIVATE_KEY;
  return value && /^0x[a-fA-F0-9]{64}$/.test(value) ? value as Hex : null;
}

function proofFlowRefundTokenAddress(chainId: number) {
  const configured = process.env.PROOFFLOW_REFUND_USDC_ADDRESS;
  if (configured && /^0x[a-fA-F0-9]{40}$/.test(configured)) return configured as Address;
  return nativeMarketAddresses(chainId).collateral ?? null;
}

function proofFlowChain(chainId: number) {
  return chainId === BASE_MAINNET_CHAIN_ID ? base : baseSepolia;
}

function validWalletAddress(value?: string | null): value is Address {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

function reviewDeadline() {
  return new Date(Date.now() + reviewWindowSeconds() * 1000);
}

function revealDeadline() {
  return new Date(Date.now() + (reviewWindowSeconds() + revealWindowSeconds()) * 1000);
}

function normalizeWallet(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function outcomeLabel(outcome?: string | null) {
  if (outcome === "ride") return "YES";
  if (outcome === "fade") return "NO";
  if (outcome === "invalid") return "INVALID / REFUND";
  return "Unresolved";
}

function finalStatusFor(outcome: ProofFlowOutcome): ProofFlowStatus {
  if (outcome === "ride") return "finalized_yes";
  if (outcome === "fade") return "finalized_no";
  return "finalized_invalid";
}

function finalMarketStatus(outcome: ProofFlowOutcome) {
  return outcome === "invalid" ? "invalid_refund" : "settled";
}

function marketIsFinal(input: { status: string; settlementStatus: string }) {
  return input.status === "settled"
    || input.status === "invalid_refund"
    || ["finalized_yes", "finalized_no", "finalized_invalid", "refunded"].includes(input.settlementStatus);
}

function settlementModeForDraft(draft: ShapedMarketDraft) {
  const sourceType = draft.resolution.sourceType;
  if (sourceType === "api" || sourceType === "oracle" || sourceType === "official_score" || sourceType === "official_chart") {
    return "auto_verifiable";
  }
  return "evidence_based";
}

function normalizeSourceUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function bondAmount(input?: { exposureUsdc?: number | null }) {
  const minimum = Number(process.env.PROOFFLOW_MIN_BOND_USDC ?? 5);
  const maximum = Number(process.env.PROOFFLOW_MAX_BOND_USDC ?? 250);
  const exposure = Number(input?.exposureUsdc ?? 0);
  const scaled = Math.max(minimum, exposure * 0.01);
  return Math.min(Number.isFinite(maximum) && maximum > 0 ? maximum : 250, Number.isFinite(scaled) ? scaled : minimum);
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashReviewNote(input: { note: string; outcome: ProofFlowOutcome; sourceUrl?: string | null }) {
  return createHash("sha256")
    .update(JSON.stringify({
      note: input.note.trim(),
      outcome: input.outcome,
      sourceUrl: input.sourceUrl?.trim() ?? null
    }))
    .digest("hex");
}

function normalizedNote(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 .:/-]/g, "").trim();
}

function noteScore(note: string) {
  const words = note.trim().split(/\s+/).filter(Boolean).length;
  const hasUrl = /https?:\/\//i.test(note) ? 1 : 0;
  const hasDate = /\b\d{4}-\d{2}-\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(note) ? 1 : 0;
  return Math.min(100, Math.max(1, words * 1.5 + hasUrl * 12 + hasDate * 8));
}

function sameHost(left?: string | null, right?: string | null) {
  const l = normalizeSourceUrl(left);
  const r = normalizeSourceUrl(right);
  if (!l || !r) return true;
  try {
    return new URL(l).hostname.replace(/^www\./, "") === new URL(r).hostname.replace(/^www\./, "");
  } catch {
    return true;
  }
}

function draftCloseAt(draft: ShapedMarketDraft, fallback?: Date | null) {
  const closeAt = draft.timeframe?.closeAt ? new Date(draft.timeframe.closeAt) : fallback ?? null;
  return closeAt && !Number.isNaN(closeAt.getTime()) ? closeAt : null;
}

export function resolutionCardForDraft(input: { draft: ShapedMarketDraft; closeTime?: Date | null }) {
  const closeAt = draftCloseAt(input.draft, input.closeTime);
  const settlementTime = closeAt ? new Date(closeAt.getTime() + proofFlowChallengeWindowSeconds() * 1000) : null;
  const primarySource = normalizeSourceUrl(input.draft.resolution.sourceUrl);
  return {
    version: "proofflow_v1",
    marketTitle: input.draft.title,
    closeTime: closeAt?.toISOString() ?? null,
    settlementTime: settlementTime?.toISOString() ?? null,
    primarySource,
    backupSource: null,
    yesRule: input.draft.sides.ride,
    noRule: input.draft.sides.fade,
    invalidRule: input.draft.resolution.fallback || "If locked rules and evidence cannot prove YES or NO, resolve INVALID / REFUND.",
    challengeWindowSeconds: proofFlowChallengeWindowSeconds(),
    challengeWindowLabel: `${Math.round(proofFlowChallengeWindowSeconds() / 3600)}h`,
    settlementMode: settlementModeForDraft(input.draft),
    sourceName: input.draft.resolution.sourceName,
    method: input.draft.resolution.method,
    lockedAt: new Date().toISOString()
  };
}

function finalNote(input: {
  market: { id: string; title: string; sourceUrl: string | null };
  outcome: ProofFlowOutcome;
  sourceUsed?: string | null;
  auditSummary?: string | null;
  reason?: string | null;
}) {
  return {
    marketId: input.market.id,
    marketTitle: input.market.title,
    outcome: input.outcome,
    outcomeLabel: outcomeLabel(input.outcome),
    sourceUsed: input.sourceUsed ?? input.market.sourceUrl,
    timestamp: new Date().toISOString(),
    auditSummary: input.auditSummary ?? "ProofFlow finalized from public evidence and the locked Resolution Card.",
    reason: input.reason ?? "Final outcome followed the locked ProofFlow rules.",
    aiIsFinalAuthority: false
  };
}

async function latestResolution(db: ReturnType<typeof requireDatabase>, marketId: string) {
  return db.marketResolution.findFirst({ where: { marketId }, orderBy: { updatedAt: "desc" } });
}

async function marketExposureUsdc(db: ReturnType<typeof requireDatabase>, marketId: string) {
  const [trades, positions] = await Promise.all([
    db.nativeTrade.aggregate({ where: { marketId }, _sum: { notionalUsdc: true } }),
    db.nativePosition.aggregate({ where: { marketId }, _sum: { notionalUsdc: true } })
  ]);
  return Math.max(Number(trades._sum.notionalUsdc ?? 0), Number(positions._sum.notionalUsdc ?? 0));
}

async function activeReviewPanel(db: ReturnType<typeof requireDatabase>, marketId: string) {
  return db.proofFlowReviewPanel.findFirst({
    where: { marketId, status: { in: ["open", "review_ready", "additional_review_open"] } },
    orderBy: [{ round: "desc" }, { createdAt: "desc" }],
    include: { assignments: true, triggers: true, rewards: true }
  });
}

async function createProofFlowReviewPanel(
  db: ReturnType<typeof requireDatabase>,
  input: {
    marketId: string;
    resolutionId?: string | null;
    round: number;
    trigger?: string | null;
    reason?: string | null;
    excludedWallets?: Array<string | null | undefined>;
    secondPanelForId?: string | null;
  }
) {
  const existingRound = await db.proofFlowReviewPanel.findUnique({
    where: { marketId_round: { marketId: input.marketId, round: input.round } },
    include: { assignments: true, triggers: true, rewards: true }
  });
  if (existingRound) return existingRound;

  const panelSize = proofFlowProverPanelSize();
  const consensusNeeded = proofFlowProverConsensusCount();
  const poolId = defaultProofFlowProverPoolId();
  const roleTypes = proofFlowActiveProverRoleTypes();
  const { candidates, selected, seed } = await selectProverPanelFromPool(db, {
    marketId: input.marketId,
    resolutionId: input.resolutionId,
    round: input.round,
    excludedWallets: input.excludedWallets,
    poolId,
    roleTypes
  });
  const exposureUsdc = await marketExposureUsdc(db, input.marketId);
  const status = input.round > 1 ? "additional_review_open" : "open";
  const panel = await db.proofFlowReviewPanel.create({
    data: {
      marketId: input.marketId,
      resolutionId: input.resolutionId ?? undefined,
      round: input.round,
      status,
      trigger: input.trigger ?? undefined,
      reason: input.reason ?? undefined,
      reviewDeadline: reviewDeadline(),
      revealDeadline: revealDeadline(),
      exposureUsdc,
      rewardPoolUsdc: proverPoolSettlementRewardUsdc(),
      secondPanelForId: input.secondPanelForId ?? undefined,
      metadata: jsonInput({
        architecture: "proof_flow_pool_agnostic",
        panelSize,
        consensusNeeded,
        selectionSeed: seed,
        poolId,
        roleTypes: roleTypes ?? "all",
        candidateCount: candidates.length,
        selectionMode: "deterministic_algorithmic_prover_pool"
      }),
      assignments: {
        create: selected.map((prover) => ({
          marketId: input.marketId,
          resolutionId: input.resolutionId ?? undefined,
          reviewerUserId: prover.id ?? undefined,
          reviewerWallet: prover.walletAddress,
          status: "assigned",
          metadata: jsonInput({
            privateDuringReview: true,
            role: "prover",
            poolId: prover.poolId ?? poolId,
            roleType: prover.roleType ?? null,
            stakeAmountUsdc: prover.stakeAmountUsdc ?? null
          })
        }))
      }
    },
    include: { assignments: true, triggers: true, rewards: true }
  });
  await db.proofFlowAuditEvent.create({
    data: {
      marketId: input.marketId,
      resolutionId: input.resolutionId ?? undefined,
      action: input.round > 1 ? "proof_flow_second_prover_panel_selected" : "proof_flow_prover_pool_panel_selected",
      fromStatus: input.round > 1 ? "evidence_review" : "challenge_open",
      toStatus: input.round > 1 ? "additional_review" : "evidence_review",
      metadata: jsonInput({
        panelId: panel.id,
        round: panel.round,
        proverCount: panel.assignments.length,
        panelSize,
        consensusNeeded,
        selectionSeed: seed,
        poolId,
        roleTypes: roleTypes ?? "all",
        reusedPreviousPanel: false,
        trigger: input.trigger ?? null,
        reason: input.reason ?? null
      })
    }
  });
  return panel;
}

async function ensureProofFlowReviewPanel(db: ReturnType<typeof requireDatabase>, marketId: string) {
  const resolution = await latestResolution(db, marketId);
  if (!resolution) throw new Error("No ProofFlow resolution exists.");
  const existing = await activeReviewPanel(db, marketId);
  if (existing) return existing;
  return createProofFlowReviewPanel(db, {
    marketId,
    resolutionId: resolution.id,
    round: 1
  });
}

async function markEvidenceChangedForOpenPanels(db: ReturnType<typeof requireDatabase>, marketId: string) {
  await db.proofFlowReviewPanel.updateMany({
    where: { marketId, status: { in: ["open", "review_ready", "additional_review_open"] } },
    data: { evidenceChangedAt: new Date() }
  });
}

async function markMaterialEvidenceChangedForOpenPanels(
  db: ReturnType<typeof requireDatabase>,
  input: {
    marketId: string;
    materiality: MaterialEvidenceLevel;
    reasons: string[];
  }
) {
  if (input.materiality !== "HIGH") return;
  await db.proofFlowReviewPanel.updateMany({
    where: { marketId: input.marketId, status: { in: ["open", "review_ready", "additional_review_open"] } },
    data: {
      evidenceChangedAt: new Date(),
      metadata: jsonInput({ materialEvidenceChange: input.materiality, materialEvidenceReasons: input.reasons })
    }
  });
}

function outcomeCounts(assignments: Array<{ status: string; recommendedOutcome: ProofFlowOutcome | null }>) {
  const counts: Record<ProofFlowOutcome, number> = { ride: 0, fade: 0, invalid: 0 };
  for (const assignment of assignments) {
    if (assignment.status !== "revealed") continue;
    if (assignment.recommendedOutcome === "ride" || assignment.recommendedOutcome === "fade" || assignment.recommendedOutcome === "invalid") {
      counts[assignment.recommendedOutcome] += 1;
    }
  }
  const entries = Object.entries(counts) as Array<[ProofFlowOutcome, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return { counts, topOutcome: entries[0][0], agreementCount: entries[0][1] };
}

function dateFromUnknown(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolutionDeadlineFor(market: { closeTime: Date | null; challengeWindowEndsAt?: Date | null; challengeWindowSeconds?: number | null; resolutionCard?: unknown }) {
  const card = asRecord(market.resolutionCard);
  const cardSettlement = dateFromUnknown(card.settlementTime);
  if (cardSettlement) return cardSettlement;
  if (market.challengeWindowEndsAt) return market.challengeWindowEndsAt;
  if (!market.closeTime) return null;
  const seconds = typeof card.challengeWindowSeconds === "number"
    ? card.challengeWindowSeconds
    : typeof market.challengeWindowSeconds === "number"
      ? market.challengeWindowSeconds
      : proofFlowChallengeWindowSeconds();
  return new Date(market.closeTime.getTime() + seconds * 1000);
}

function sourceWindowFor(resolutionCard: unknown) {
  const card = asRecord(resolutionCard);
  return {
    sourceWindowStart: dateFromUnknown(card.sourceWindowStart ?? card.validFrom ?? card.closeTime),
    sourceWindowEnd: dateFromUnknown(card.sourceWindowEnd ?? card.validUntil ?? card.settlementTime)
  };
}

function evidenceTimestampFromMetadata(input: { createdAt?: Date | null; metadata?: unknown; evidenceText?: string | null }) {
  const metadata = asRecord(input.metadata);
  const direct = metadata.evidenceTimestamp ?? metadata.publishedAt ?? metadata.timestamp ?? metadata.observedAt;
  const parsedDirect = dateFromUnknown(direct);
  if (parsedDirect) return parsedDirect;
  if (typeof direct === "string" && direct.trim()) return direct;
  const text = input.evidenceText ?? "";
  const iso = text.match(/\b20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?)?\b/);
  if (iso) {
    const normalized = iso[0].includes("T") ? iso[0] : `${iso[0]}T00:00:00.000Z`;
    const parsed = dateFromUnknown(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
    if (parsed) return parsed;
    return normalized;
  }
  return input.createdAt ?? null;
}

async function runStructuredPanelAudit(
  db: ReturnType<typeof requireDatabase>,
  input: {
    panelId: string;
    marketId: string;
  }
): Promise<ProofFlowAuditFlags> {
  const [market, panel, evidence, conflictReports] = await Promise.all([
    db.market.findUnique({ where: { id: input.marketId } }),
    db.proofFlowReviewPanel.findUnique({ where: { id: input.panelId }, include: { assignments: true } }),
    db.proofFlowEvidenceSubmission.findMany({ where: { marketId: input.marketId }, orderBy: { createdAt: "asc" } }),
    db.proofFlowReviewerConflictReport.findMany({ where: { marketId: input.marketId, status: { in: ["PENDING", "CONFIRMED"] } }, orderBy: { createdAt: "asc" } })
  ]);
  if (!market || !panel) throw new Error("ProofFlow panel not found.");
  const revealed = panel.assignments.filter((assignment) => assignment.status === "revealed");
  const notes = revealed.map((assignment) => assignment.noteText ?? "").filter(Boolean);
  const duplicateGroups = new Map<string, number>();
  for (const note of notes) {
    const normalized = normalizedNote(note);
    if (!normalized) continue;
    duplicateGroups.set(normalized, (duplicateGroups.get(normalized) ?? 0) + 1);
  }
  const coordinated = [...duplicateGroups.values()].some((count) => count >= 2);
  const wrongSource = revealed.some((assignment) => assignment.sourceUrl && !sameHost(assignment.sourceUrl, market.sourceUrl));
  const resolutionDeadline = resolutionDeadlineFor(market);
  const sourceWindow = sourceWindowFor(market.resolutionCard);
  const timestampChecks = evidence.map((item) => ({
    evidenceId: item.id,
    kind: item.kind,
    ...validateEvidenceTimestamp({
      evidenceTimestamp: evidenceTimestampFromMetadata(item),
      marketOpenTime: market.createdAt,
      marketCloseTime: market.closeTime,
      resolutionDeadline,
      sourceWindowStart: sourceWindow.sourceWindowStart,
      sourceWindowEnd: sourceWindow.sourceWindowEnd
    })
  }));
  const timestampMismatch = timestampChecks.some((check) => !check.valid);
  const { agreementCount } = outcomeCounts(revealed as Array<{ status: string; recommendedOutcome: ProofFlowOutcome | null }>);
  const fallback: ProofFlowAuditFlags = {
    wrongSourceUsage: wrongSource,
    timestampMismatch,
    contradictionsDetected: agreementCount < proofFlowProverConsensusCount(),
    coordinatedNotes: coordinated,
    evidenceSufficient: notes.length >= Math.max(1, proofFlowProverConsensusCount() - 1) && !wrongSource && !timestampMismatch,
    seriousConcern: wrongSource || timestampMismatch || coordinated || conflictReports.some((report) => report.status === "CONFIRMED"),
    clean: !wrongSource && !timestampMismatch && !coordinated && !conflictReports.some((report) => report.status === "CONFIRMED"),
    summary: "NexMind Audit checked the locked source, timestamps, Prover notes and evidence consistency. It is decision support only; the Prover panel determines settlement confidence.",
    recommendedOutcome: null,
    caveats: timestampChecks.flatMap((check) => check.failures.map((failure) => `${check.kind}: ${failure.message}`))
  };

  if (!bankrAiReady()) return fallback;
  try {
    const response = await callBankrJson({
      feature: "proofflow_audit",
      metadata: { marketId: input.marketId, panelId: input.panelId },
      messages: [
        {
          role: "system",
          content: "You are NexMind Audit for ProofFlow. Return strict JSON flags only. You are not the final settlement authority."
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction: "Audit evidence validity, timestamp alignment, source match, contradictions and coordination risk. Do not decide the market alone.",
            resolutionCard: market.resolutionCard,
            sourceUrl: market.sourceUrl,
            closeTime: market.closeTime?.toISOString() ?? null,
            timestampValidation: timestampChecks,
            conflictReports: conflictReports.map((report) => ({ status: report.status, reason: report.reason, details: report.details, reviewerWallet: report.reviewerWallet })),
            evidence: evidence.map((item) => ({ kind: item.kind, outcome: item.outcome, sourceUrl: item.sourceUrl, evidenceText: item.evidenceText, evidenceUrl: item.evidenceUrl })),
            proverNotes: revealed.map((item) => ({ outcome: item.recommendedOutcome, sourceUrl: item.sourceUrl, note: item.noteText })),
            output: {
              wrongSourceUsage: "boolean",
              timestampMismatch: "boolean",
              contradictionsDetected: "boolean",
              coordinatedNotes: "boolean",
              evidenceSufficient: "boolean",
              seriousConcern: "boolean",
              clean: "boolean",
              recommendedOutcome: "ride | fade | invalid | null",
              summary: "short human readable audit summary",
              caveats: ["short caveats"]
            }
          })
        }
      ]
    });
    const json = asRecord(response.json);
    const recommendedOutcome = json.recommendedOutcome === "ride" || json.recommendedOutcome === "fade" || json.recommendedOutcome === "invalid"
      ? json.recommendedOutcome
      : null;
    return {
      wrongSourceUsage: Boolean(json.wrongSourceUsage) || fallback.wrongSourceUsage,
      timestampMismatch: Boolean(json.timestampMismatch) || fallback.timestampMismatch,
      contradictionsDetected: Boolean(json.contradictionsDetected) || fallback.contradictionsDetected,
      coordinatedNotes: Boolean(json.coordinatedNotes) || fallback.coordinatedNotes,
      evidenceSufficient: typeof json.evidenceSufficient === "boolean" ? json.evidenceSufficient : fallback.evidenceSufficient,
      seriousConcern: Boolean(json.seriousConcern) || fallback.seriousConcern,
      clean: typeof json.clean === "boolean" ? Boolean(json.clean) && !fallback.seriousConcern : fallback.clean,
      summary: typeof json.summary === "string" ? json.summary.slice(0, 1200) : fallback.summary,
      recommendedOutcome,
      caveats: Array.isArray(json.caveats) ? json.caveats.filter((item) => typeof item === "string").slice(0, 8) : fallback.caveats
    };
  } catch {
    return fallback;
  }
}

function handleNoFourOfFiveAgreement(input: { agreementCount: number }): SecondPanelTrigger | null {
  return input.agreementCount < proofFlowProverConsensusCount()
    ? { triggerType: "no_4_of_5_agreement", detail: "Fewer than the configured Prover consensus threshold agreed on the same outcome." }
    : null;
}

function handleWrongSourceUsage(audit: ProofFlowAuditFlags): SecondPanelTrigger | null {
  return audit.wrongSourceUsage
    ? { triggerType: "wrong_source_usage", detail: "NexMind Audit flagged evidence or notes using a source outside the locked Resolution Card." }
    : null;
}

function handleTimestampMismatch(audit: ProofFlowAuditFlags): SecondPanelTrigger | null {
  return audit.timestampMismatch
    ? { triggerType: "timestamp_mismatch", detail: "NexMind Audit flagged evidence outside the market resolution window." }
    : null;
}

function handleConflictOfInterest(assignments: Array<{ conflictDetectedAt: Date | null; conflictReason: string | null }>): SecondPanelTrigger | null {
  const conflict = assignments.find((assignment) => assignment.conflictDetectedAt);
  return conflict
    ? { triggerType: "conflict_of_interest", detail: conflict.conflictReason ?? "A Prover conflict of interest was discovered after selection." }
    : null;
}

function handleMissedReveals(input: { missedRevealCount: number }): SecondPanelTrigger | null {
  return input.missedRevealCount >= 2
    ? { triggerType: "missed_reveals", detail: "Two or more Provers failed to reveal before the deadline." }
    : null;
}

function handleCoordinatedNotes(input: { coordinatedCount: number; audit: ProofFlowAuditFlags }): SecondPanelTrigger | null {
  return input.coordinatedCount >= 2 || input.audit.coordinatedNotes
    ? { triggerType: "coordinated_notes", detail: "Two or more Prover notes appeared coordinated or copy-pasted." }
    : null;
}

function handleEvidenceChanged(input: { evidenceChangedAt: Date | null }): SecondPanelTrigger | null {
  return input.evidenceChangedAt
    ? { triggerType: "evidence_changed", detail: "Evidence was updated or replaced after review began and before finalization." }
    : null;
}

function handleHighValueSplit(input: { exposureUsdc: number; agreementCount: number }): SecondPanelTrigger | null {
  return input.exposureUsdc >= escalationExposureThresholdUsdc() && input.agreementCount < proofFlowProverPanelSize()
    ? { triggerType: "high_value_split", detail: "Market exposure exceeded the escalation threshold and the panel was split." }
    : null;
}

function evaluateSecondPanelNeed(input: {
  panel: {
    missedRevealCount: number;
    coordinatedCount: number;
    evidenceChangedAt: Date | null;
    exposureUsdc: number;
  };
  assignments: Array<{ conflictDetectedAt: Date | null; conflictReason: string | null }>;
  audit: ProofFlowAuditFlags;
  agreementCount: number;
}) {
  return [
    handleNoFourOfFiveAgreement({ agreementCount: input.agreementCount }),
    handleWrongSourceUsage(input.audit),
    handleTimestampMismatch(input.audit),
    handleConflictOfInterest(input.assignments),
    handleMissedReveals({ missedRevealCount: input.panel.missedRevealCount }),
    handleCoordinatedNotes({ coordinatedCount: input.panel.coordinatedCount, audit: input.audit }),
    handleEvidenceChanged({ evidenceChangedAt: input.panel.evidenceChangedAt }),
    handleHighValueSplit({ exposureUsdc: input.panel.exposureUsdc, agreementCount: input.agreementCount })
  ].filter(Boolean) as SecondPanelTrigger[];
}

function reviewerErrorTrigger(triggerType: string) {
  return ["wrong_source_usage", "conflict_of_interest", "missed_reveals", "coordinated_notes"].includes(triggerType);
}

async function recordPanelTriggers(
  db: ReturnType<typeof requireDatabase>,
  input: {
    panelId: string;
    marketId: string;
    resolutionId?: string | null;
    triggers: SecondPanelTrigger[];
  }
) {
  for (const trigger of input.triggers) {
    await db.proofFlowSecondPanelTrigger.create({
      data: {
        marketId: input.marketId,
        resolutionId: input.resolutionId ?? undefined,
        panelId: input.panelId,
        triggerType: trigger.triggerType,
        detail: trigger.detail,
        metadata: jsonInput(trigger.metadata ?? null)
      }
    });
  }
}

async function queuePendingReviewerReputation(
  db: ReturnType<typeof requireDatabase>,
  input: {
    assignment: {
      id: string;
      marketId: string;
      resolutionId: string | null;
      panelId: string;
      reviewerWallet: string;
    };
    delta: number;
    reason: string;
    metadata?: Record<string, unknown>;
  }
) {
  await db.proofFlowReviewerReputationLedger.deleteMany({
    where: { assignmentId: input.assignment.id, status: "PENDING" }
  });
  return db.proofFlowReviewerReputationLedger.create({
    data: {
      marketId: input.assignment.marketId,
      resolutionId: input.assignment.resolutionId ?? undefined,
      panelId: input.assignment.panelId,
      assignmentId: input.assignment.id,
      reviewerWallet: input.assignment.reviewerWallet,
      delta: input.delta,
      reason: input.reason,
      status: "PENDING",
      metadata: jsonInput(input.metadata ?? null)
    }
  });
}

async function confirmPendingProverReputation(db: ReturnType<typeof requireDatabase>, marketId: string) {
  const pending = await db.proofFlowReviewerReputationLedger.findMany({
    where: { marketId, status: "PENDING" },
    orderBy: { createdAt: "asc" }
  });
  const now = new Date();
  for (const entry of pending) {
    await db.proofFlowReviewerReputationLedger.update({
      where: { id: entry.id },
      data: { status: "CONFIRMED", confirmedAt: now }
    });
    const confirmedForAssignment = await db.proofFlowReviewerReputationLedger.findMany({
      where: { assignmentId: entry.assignmentId, status: "CONFIRMED" }
    });
    const totalDelta = confirmedForAssignment.reduce((sum, item) => sum + item.delta, 0);
    await db.proofFlowReviewAssignment.updateMany({
      where: { id: entry.assignmentId },
      data: { reputationDelta: totalDelta }
    });
  }
  if (pending.length) {
    await db.proofFlowAuditEvent.create({
      data: {
        marketId,
        action: "prover_reputation_confirmed",
        metadata: jsonInput({ entries: pending.length })
      }
    });
  }
  await syncProverStatsForMarket(db, marketId);
  return pending.length;
}

async function confirmPendingProverRewards(
  db: ReturnType<typeof requireDatabase>,
  input: { marketId: string; reviewPanelId?: string | null }
) {
  const market = await db.market.findUnique({
    where: { id: input.marketId },
    select: { status: true, settlementStatus: true, finalOutcome: true }
  });
  const finalized = Boolean(market && (
    market.status === "settled" ||
    market.status === "invalid_refund" ||
    ["finalized_yes", "finalized_no", "finalized_invalid", "refunded"].includes(market.settlementStatus)
  ));
  if (!finalized) {
    throw new Error("Prover rewards cannot be confirmed before market finalization.");
  }
  const rewards = await db.proofFlowReviewerReward.findMany({
    where: {
      marketId: input.marketId,
      ...(input.reviewPanelId ? { panelId: input.reviewPanelId } : {}),
      status: "PENDING_FINALIZATION"
    }
  });
  const result = await db.proofFlowReviewerReward.updateMany({
    where: {
      marketId: input.marketId,
      ...(input.reviewPanelId ? { panelId: input.reviewPanelId } : {}),
      status: "PENDING_FINALIZATION"
    },
    data: { status: "CONFIRMED" }
  });
  for (const reward of rewards) {
    await recordProverPoolLedger(db, {
      marketId: reward.marketId,
      resolutionId: reward.resolutionId,
      panelId: reward.panelId,
      assignmentId: reward.assignmentId,
      proverWallet: reward.reviewerWallet,
      sourceType: "PROVERS_POOL",
      entryType: "PAYOUT_CONFIRMED",
      amountUsdc: reward.amountUsdc,
      status: "CONFIRMED",
      metadata: {
        rewardId: reward.id,
        rewardType: reward.rewardType,
        finalizationRequired: true
      }
    });
  }
  let slashedUsdc = 0;
  if (market?.finalOutcome) {
    slashedUsdc = await applyFinalProverSlashing(db, {
      marketId: input.marketId,
      panelId: input.reviewPanelId,
      finalOutcome: market.finalOutcome
    });
  }
  if (result.count) {
    await db.proofFlowAuditEvent.create({
      data: {
        marketId: input.marketId,
        action: "prover_rewards_confirmed",
        metadata: jsonInput({ reviewPanelId: input.reviewPanelId ?? null, rewards: result.count, pool: "PROVERS_POOL", slashedUsdc })
      }
    });
  }
  await syncProverStatsForMarket(db, input.marketId);
  return result.count;
}

async function markProverRewardFinalizationFailure(
  db: ReturnType<typeof requireDatabase>,
  input: { marketId: string; reviewPanelId?: string | null; detail: string }
) {
  await db.proofFlowReviewerReward.updateMany({
    where: {
      marketId: input.marketId,
      ...(input.reviewPanelId ? { panelId: input.reviewPanelId } : {}),
      status: "PENDING_FINALIZATION"
    },
    data: { reason: `Pending finalization retry required: ${input.detail}`.slice(0, 600) }
  });
}

async function applyInconclusivePanelReputation(
  db: ReturnType<typeof requireDatabase>,
  input: {
    panelId: string;
    punitive: boolean;
    reason: string;
  }
) {
  const assignments = await db.proofFlowReviewAssignment.findMany({ where: { panelId: input.panelId } });
  for (const assignment of assignments) {
    const reviewerFault = input.punitive && (
      assignment.status === "missed_reveal" ||
      assignment.conflictDetectedAt ||
      assignment.coordinatedFlag ||
      assignment.wrongSourceFlag ||
      assignment.spamFlag ||
      assignment.badFaithFlag
    );
    await db.proofFlowReviewAssignment.update({
      where: { id: assignment.id },
      data: {
        rewardUsdc: 0,
        reputationDelta: 0,
        penaltyReason: reviewerFault ? input.reason : undefined
      }
    });
    await queuePendingReviewerReputation(db, {
      assignment,
      delta: reviewerFault ? -2 : 1,
      reason: reviewerFault ? input.reason : "Prover panel was reasonable but settlement confidence was not reached.",
      metadata: { punitive: input.punitive, finalizationRequired: true }
    });
    await db.proofFlowReviewerReward.create({
      data: {
        marketId: assignment.marketId,
        resolutionId: assignment.resolutionId ?? undefined,
        panelId: assignment.panelId,
        assignmentId: assignment.id,
        reviewerWallet: assignment.reviewerWallet,
        amountUsdc: 0,
        rewardType: reviewerFault ? "penalty_no_reward" : "reputation_only",
        status: "PENDING_FINALIZATION",
        reputationDelta: 0,
        reason: reviewerFault ? input.reason : "Prover panel was reasonable but settlement confidence was not reached."
      }
    });
    await recordProverPoolLedger(db, {
      marketId: assignment.marketId,
      resolutionId: assignment.resolutionId,
      panelId: assignment.panelId,
      assignmentId: assignment.id,
      proverWallet: assignment.reviewerWallet,
      sourceType: "PROVERS_POOL",
      entryType: "SETTLEMENT_ALLOCATION",
      amountUsdc: 0,
      status: "PENDING_FINALIZATION",
      metadata: { punitive: input.punitive, reason: input.reason }
    });
  }
}

async function openSecondPanelFromTriggers(
  db: ReturnType<typeof requireDatabase>,
  input: {
    panelId: string;
    marketId: string;
    resolutionId?: string | null;
    triggers: SecondPanelTrigger[];
  }
) {
  const existingSecond = await db.proofFlowReviewPanel.findFirst({
    where: { marketId: input.marketId, round: 2 },
    include: { assignments: true, triggers: true, rewards: true }
  });
  if (existingSecond) return existingSecond;
  await recordPanelTriggers(db, input);
  const punitive = input.triggers.some((trigger) => reviewerErrorTrigger(trigger.triggerType));
  await applyInconclusivePanelReputation(db, {
    panelId: input.panelId,
    punitive,
    reason: input.triggers.map((trigger) => trigger.triggerType).join(", ")
  });
  await db.proofFlowReviewPanel.update({
    where: { id: input.panelId },
    data: {
      status: punitive ? "invalidated_reviewer_error" : "reasonable_inconclusive",
      monetaryEligible: false,
      closedAt: new Date()
    }
  });
  const previousAssignments = await db.proofFlowReviewAssignment.findMany({
    where: { marketId: input.marketId },
    select: { reviewerWallet: true }
  });
  const firstTrigger = input.triggers[0];
  const second = await createProofFlowReviewPanel(db, {
    marketId: input.marketId,
    resolutionId: input.resolutionId,
    round: 2,
    trigger: firstTrigger?.triggerType ?? "additional_review",
    reason: "A fresh Prover panel is checking the evidence before final settlement.",
    excludedWallets: previousAssignments.map((item) => item.reviewerWallet),
    secondPanelForId: input.panelId
  });
  await db.marketResolution.updateMany({
    where: { marketId: input.marketId },
    data: { status: "additional_review", verificationStatus: "additional_review" }
  });
  await db.market.update({
    where: { id: input.marketId },
    data: { status: "disputed", settlementStatus: "additional_review", resolutionState: "additional_review" }
  });
  return second;
}

function reviewerPenaltyReason(assignment: {
  status: string;
  conflictDetectedAt: Date | null;
  coordinatedFlag: boolean;
  wrongSourceFlag: boolean;
  spamFlag: boolean;
  badFaithFlag: boolean;
}) {
  if (assignment.badFaithFlag) return "bad_faith";
  if (assignment.wrongSourceFlag) return "wrong_source_review";
  if (assignment.status === "missed_reveal") return "missed_reveal";
  if (assignment.conflictDetectedAt) return "conflict_violation";
  if (assignment.spamFlag) return "spam";
  if (assignment.coordinatedFlag) return "coordinated_note";
  return null;
}

async function distributeProverRewards(
  db: ReturnType<typeof requireDatabase>,
  input: {
    panelId: string;
    finalOutcome: ProofFlowOutcome;
    noConfidenceInvalid?: boolean;
  }
) {
  const panel = await db.proofFlowReviewPanel.findUnique({
    where: { id: input.panelId },
    include: { assignments: true }
  });
  if (!panel) return [];
  await db.proofFlowReviewerReward.deleteMany({
    where: {
      panelId: panel.id,
      status: { not: "CONFIRMED" },
      rewardType: { in: ["aligned_share", "aligned_share_and_top_note_bonus", "top_note_bonus", "minority_reputation", "reputation_only_final_invalid"] }
    }
  });
  if (input.noConfidenceInvalid) {
    const rows = [];
    for (const assignment of panel.assignments) {
      const penalty = reviewerPenaltyReason(assignment);
      const reputationDelta = penalty ? -2 : 1;
      await db.proofFlowReviewAssignment.update({
        where: { id: assignment.id },
        data: { rewardUsdc: 0, reputationDelta: 0, penaltyReason: penalty ?? undefined }
      });
      await queuePendingReviewerReputation(db, {
        assignment,
        delta: reputationDelta,
        reason: penalty ?? "No panel reached settlement confidence; reputation only.",
        metadata: { noConfidenceInvalid: true, finalizationRequired: true }
      });
      rows.push(await db.proofFlowReviewerReward.create({
        data: {
          marketId: assignment.marketId,
          resolutionId: assignment.resolutionId ?? undefined,
          panelId: panel.id,
          assignmentId: assignment.id,
          reviewerWallet: assignment.reviewerWallet,
          amountUsdc: 0,
          rewardType: "reputation_only_final_invalid",
          status: "PENDING_FINALIZATION",
          reputationDelta: 0,
          reason: penalty ?? "No Prover panel reached settlement confidence; reputation only."
        }
      }));
      await recordProverPoolLedger(db, {
        marketId: assignment.marketId,
        resolutionId: assignment.resolutionId,
        panelId: panel.id,
        assignmentId: assignment.id,
        proverWallet: assignment.reviewerWallet,
        sourceType: "PROVERS_POOL",
        entryType: "SETTLEMENT_ALLOCATION",
        amountUsdc: 0,
        status: "PENDING_FINALIZATION",
        metadata: { noConfidenceInvalid: true }
      });
    }
    return rows;
  }

  const aligned = panel.assignments.filter((assignment) => assignment.status === "revealed" && assignment.recommendedOutcome === input.finalOutcome);
  const pool = Number(panel.rewardPoolUsdc || proverPoolSettlementRewardUsdc());
  const fundingSources = proversPoolFundingSources();
  const reputationWeights = await reputationWeightsForAssignments(db, aligned);
  const totalWeight = reputationWeights.reduce((sum, weight) => sum + weight, 0);
  const topWeight = Math.max(...reputationWeights, 0);
  const bestAssignments = aligned.filter((assignment, index) => reputationWeights[index] === topWeight);
  const rows = [];
  for (const assignment of panel.assignments) {
    const alignedIndex = aligned.findIndex((item) => item.id === assignment.id);
    const isAligned = alignedIndex >= 0;
    const penalty = reviewerPenaltyReason(assignment);
    const amountUsdc = isAligned
      ? totalWeight > 0
        ? pool * (reputationWeights[alignedIndex] / totalWeight)
        : pool / Math.max(1, aligned.length)
      : 0;
    const reputationDelta = penalty ? -2 : isAligned ? 2 : -2;
    await db.proofFlowReviewAssignment.update({
      where: { id: assignment.id },
      data: {
        rewardUsdc: amountUsdc,
        reputationDelta: 0,
        penaltyReason: penalty ?? undefined
      }
    });
    await queuePendingReviewerReputation(db, {
      assignment,
      delta: reputationDelta,
      reason: isAligned
        ? "Aligned Prover reward share weighted by reputation."
        : penalty ?? "Prover verdict did not match the final resolved outcome.",
      metadata: { finalOutcome: input.finalOutcome, aligned: isAligned, reputationWeighted: true, finalizationRequired: true }
    });
    rows.push(await db.proofFlowReviewerReward.create({
      data: {
        marketId: assignment.marketId,
        resolutionId: assignment.resolutionId ?? undefined,
        panelId: panel.id,
        assignmentId: assignment.id,
        reviewerWallet: assignment.reviewerWallet,
        amountUsdc,
        rewardType: isAligned ? "reputation_weighted_share" : "wrong_verdict_slash_pending",
        status: "PENDING_FINALIZATION",
        reputationDelta: 0,
        reason: isAligned
          ? "Aligned Prover reward share weighted by reputation."
          : penalty ?? "Prover verdict did not match the final resolved outcome."
      }
    }));
    await recordProverPoolLedger(db, {
      marketId: assignment.marketId,
      resolutionId: assignment.resolutionId,
      panelId: panel.id,
      assignmentId: assignment.id,
      proverWallet: assignment.reviewerWallet,
      sourceType: "PROVERS_POOL",
      entryType: "SETTLEMENT_ALLOCATION",
      amountUsdc,
      status: "PENDING_FINALIZATION",
      metadata: {
        finalOutcome: input.finalOutcome,
        aligned: isAligned,
        reputationWeighted: true,
        reputationWeight: isAligned ? reputationWeights[alignedIndex] : 0,
        configuredFundingSources: fundingSources
      }
    });
  }
  await db.proofFlowReviewPanel.update({
    where: { id: panel.id },
    data: { monetaryEligible: true, bestAssignmentId: bestAssignments[0]?.id ?? undefined }
  });
  return rows;
}

function voteBreakdown(assignments: Array<{ status: string; recommendedOutcome: ProofFlowOutcome | null }>) {
  const { counts, topOutcome, agreementCount } = outcomeCounts(assignments);
  return {
    yes: counts.ride,
    no: counts.fade,
    invalid: counts.invalid,
    topOutcome,
    agreementCount,
    summary: `${agreementCount} of ${proofFlowProverPanelSize()} supported ${outcomeLabel(topOutcome)}`
  };
}

async function updateCoordinatedFlags(db: ReturnType<typeof requireDatabase>, panelId: string) {
  const assignments = await db.proofFlowReviewAssignment.findMany({ where: { panelId } });
  const groups = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    if (!assignment.noteText) continue;
    const normalized = normalizedNote(assignment.noteText);
    if (!normalized) continue;
    groups.set(normalized, [...(groups.get(normalized) ?? []), assignment]);
  }
  let coordinatedCount = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    coordinatedCount += group.length;
    for (const assignment of group) {
      await db.proofFlowReviewAssignment.update({ where: { id: assignment.id }, data: { coordinatedFlag: true } });
    }
  }
  await db.proofFlowReviewPanel.update({ where: { id: panelId }, data: { coordinatedCount } });
  return coordinatedCount;
}

async function evaluateProofFlowReviewPanel(db: ReturnType<typeof requireDatabase>, panelId: string) {
  const panel = await db.proofFlowReviewPanel.findUnique({
    where: { id: panelId },
    include: { assignments: true, triggers: true }
  });
  if (!panel || !["open", "review_ready", "additional_review_open"].includes(panel.status)) return null;
  const now = new Date();
  if (now < panel.reviewDeadline) return null;
  if (now < panel.revealDeadline) return null;

  const missed = panel.assignments.filter((assignment) => assignment.status !== "revealed");
  for (const assignment of missed) {
    await db.proofFlowReviewAssignment.update({
      where: { id: assignment.id },
      data: { status: "missed_reveal", missedAt: now, reputationDelta: 0, penaltyReason: "missed_reveal" }
    });
  }
  const coordinatedCount = await updateCoordinatedFlags(db, panel.id);
  const freshPanel = await db.proofFlowReviewPanel.findUnique({
    where: { id: panel.id },
    include: { assignments: true }
  });
  if (!freshPanel) return null;
  const revealed = freshPanel.assignments.filter((assignment) => assignment.status === "revealed");
  const { topOutcome, agreementCount } = outcomeCounts(revealed as Array<{ status: string; recommendedOutcome: ProofFlowOutcome | null }>);
  const audit = await runStructuredPanelAudit(db, { panelId: freshPanel.id, marketId: freshPanel.marketId });
  const triggers = evaluateSecondPanelNeed({
    panel: {
      missedRevealCount: missed.length,
      coordinatedCount,
      evidenceChangedAt: freshPanel.evidenceChangedAt,
      exposureUsdc: freshPanel.exposureUsdc
    },
    assignments: freshPanel.assignments,
    audit,
    agreementCount
  });

  await db.proofFlowReviewPanel.update({
    where: { id: freshPanel.id },
    data: {
      auditSummary: audit.summary,
      auditFlags: jsonInput(audit),
      auditClean: audit.clean,
      consensusOutcome: agreementCount >= proofFlowProverConsensusCount() ? topOutcome : undefined,
      agreementCount,
      notesSubmitted: freshPanel.assignments.filter((assignment) => assignment.submittedAt).length,
      revealsCompleted: revealed.length,
      missedRevealCount: missed.length,
      coordinatedCount
    }
  });
  await db.market.update({ where: { id: freshPanel.marketId }, data: { auditSummary: audit.summary } });
  if (freshPanel.resolutionId) {
    await db.marketResolution.update({ where: { id: freshPanel.resolutionId }, data: { auditSummary: audit.summary, confidence: agreementCount / proofFlowProverPanelSize() } });
  }

  if (triggers.length > 0) {
    if (freshPanel.round >= 2) {
      await recordPanelTriggers(db, {
        panelId: freshPanel.id,
        marketId: freshPanel.marketId,
        resolutionId: freshPanel.resolutionId,
        triggers
      });
      await db.proofFlowReviewPanel.update({
        where: { id: freshPanel.id },
        data: { status: "no_confidence_invalid", monetaryEligible: false, closedAt: now }
      });
      await distributeProverRewards(db, { panelId: freshPanel.id, finalOutcome: "invalid", noConfidenceInvalid: true });
      await finalizeProofFlowMarket({
        marketId: freshPanel.marketId,
        outcome: "invalid",
        reason: "A second independent Prover panel could not reach settlement confidence. Truth could not be proven from the locked rules.",
        evidenceText: "Truth could not be proven from the locked rules, so YES and NO shares redeem equally.",
        force: true,
        reviewPanelId: freshPanel.id
      });
      return { status: "invalid", triggers };
    }
    await openSecondPanelFromTriggers(db, {
      panelId: freshPanel.id,
      marketId: freshPanel.marketId,
      resolutionId: freshPanel.resolutionId,
      triggers
    });
    return { status: "additional_review", triggers };
  }

  if (!audit.clean || agreementCount < proofFlowProverConsensusCount()) return null;
  await db.proofFlowReviewPanel.update({
    where: { id: freshPanel.id },
    data: { status: "final_confidence_reached", monetaryEligible: true, closedAt: now }
  });
  await distributeProverRewards(db, { panelId: freshPanel.id, finalOutcome: topOutcome });
  await finalizeProofFlowMarket({
    marketId: freshPanel.marketId,
    outcome: topOutcome,
    reason: audit.summary,
    evidenceText: `ProofFlow finalized after ${agreementCount} of ${proofFlowProverPanelSize()} Provers supported ${outcomeLabel(topOutcome)} and NexMind Audit found no serious settlement issue.`,
    force: true,
    reviewPanelId: freshPanel.id
  });
  return { status: "finalized", outcome: topOutcome };
}

export async function getProofFlowSettlement(marketId: string, viewerWallet?: string | null) {
  return withDatabase(
    async (db) => {
      const [market, resolution, evidence, reviewerNotes, receipts, auditTrail, reviewPanels, refundQueue, conflictReports] = await Promise.all([
        db.market.findUnique({ where: { id: marketId } }),
        db.marketResolution.findFirst({ where: { marketId }, orderBy: { updatedAt: "desc" } }),
        db.proofFlowEvidenceSubmission.findMany({ where: { marketId }, orderBy: { createdAt: "asc" } }),
        db.proofFlowReviewerNote.findMany({ where: { marketId }, orderBy: { createdAt: "asc" } }),
        db.proofFlowSettlementReceipt.findMany({ where: { marketId }, orderBy: { createdAt: "desc" }, take: 1 }),
        db.proofFlowAuditEvent.findMany({ where: { marketId }, orderBy: { createdAt: "asc" } }),
        db.proofFlowReviewPanel.findMany({
          where: { marketId },
          orderBy: [{ round: "asc" }, { createdAt: "asc" }],
          include: {
            assignments: true,
            triggers: true,
            rewards: true
          }
        }),
        db.proofFlowRefundQueue.findMany({ where: { marketId }, orderBy: { createdAt: "asc" } }),
        db.proofFlowReviewerConflictReport.findMany({ where: { marketId }, orderBy: { createdAt: "asc" } })
      ]);
      if (!market) return null;
      const isFinal = ["finalized_yes", "finalized_no", "finalized_invalid", "refunded"].includes(market.settlementStatus)
        || market.status === "settled"
        || market.status === "invalid_refund";
      const viewer = normalizeWallet(viewerWallet);
      const currentPanel = [...reviewPanels].reverse().find((panel) => ["open", "review_ready", "additional_review_open"].includes(panel.status)) ?? reviewPanels[reviewPanels.length - 1] ?? null;
      const secondPanelProverIsolation = Boolean(!isFinal
        && viewer
        && currentPanel
        && currentPanel.round > 1
        && currentPanel.assignments.some((assignment) => normalizeWallet(assignment.reviewerWallet) === viewer));
      const secondPanelReviewerIsolation = secondPanelProverIsolation;
      const visibleReviewPanels = secondPanelProverIsolation && currentPanel
        ? reviewPanels.filter((panel) => panel.id === currentPanel.id)
        : reviewPanels;
      return {
        resolutionCard: market.resolutionCard,
        settlementMode: market.settlementMode,
        settlementStatus: market.settlementStatus,
        challengeWindowEndsAt: market.challengeWindowEndsAt?.toISOString() ?? null,
        provisionalOutcome: market.provisionalOutcome,
        finalOutcome: market.finalOutcome,
        auditSummary: secondPanelReviewerIsolation ? null : market.auditSummary,
        finalResolutionNote: secondPanelReviewerIsolation ? null : market.finalResolutionNote,
        bondAmount: market.bondAmount,
        proposerBondStatus: market.proposerBondStatus,
        challengerBondStatus: market.challengerBondStatus,
        refundStatus: market.refundStatus,
        onchainSettlementTxHash: resolution?.settlementTxHash ?? resolution?.txHash ?? null,
        onchainSettlementReady: Boolean(resolution?.settlementTxHash ?? resolution?.txHash),
        resolution: resolution ? {
          id: resolution.id,
          status: resolution.status,
          proposedOutcome: resolution.proposedOutcome,
          finalOutcome: resolution.finalOutcome,
          auditSummary: secondPanelReviewerIsolation ? null : resolution.auditSummary,
          challengeWindowEndsAt: resolution.challengeWindowEndsAt?.toISOString() ?? null,
          confidence: secondPanelReviewerIsolation ? null : resolution.confidence,
          verificationStatus: resolution.verificationStatus,
          settlementTxHash: resolution.settlementTxHash,
          txHash: resolution.txHash
        } : null,
        evidenceBoard: evidence.map((item) => ({
          id: item.id,
          kind: item.kind,
          outcome: item.outcome,
          walletAddress: item.walletAddress,
          evidenceUrl: item.evidenceUrl,
          evidenceText: item.evidenceText,
          sourceUrl: item.sourceUrl,
          bondAmount: item.bondAmount,
          bondStatus: item.bondStatus,
          auditSummary: item.auditSummary,
          metadata: item.metadata,
          createdAt: item.createdAt.toISOString()
        })),
        reviewPanels: visibleReviewPanels.map((panel) => {
          const isolatedPanelView = Boolean(secondPanelReviewerIsolation && !isFinal);
          const panelAssignments = isolatedPanelView
            ? panel.assignments.filter((assignment) => viewer && normalizeWallet(assignment.reviewerWallet) === viewer)
            : panel.assignments;
          const publicAssignments = panelAssignments.map((assignment) => {
            const ownAssignment = viewer && normalizeWallet(assignment.reviewerWallet) === viewer;
            return {
              id: assignment.id,
              reviewerWallet: isFinal ? assignment.reviewerWallet : ownAssignment ? assignment.reviewerWallet : null,
              proverWallet: isFinal ? assignment.reviewerWallet : ownAssignment ? assignment.reviewerWallet : null,
              status: assignment.status,
              recommendedOutcome: isolatedPanelView ? null : isFinal || ownAssignment ? assignment.recommendedOutcome : null,
              note: isFinal ? assignment.noteText : null,
              noteHash: assignment.noteHash,
              confidence: isolatedPanelView ? null : isFinal || ownAssignment ? assignment.confidence : null,
              evidenceUrl: isFinal ? assignment.evidenceUrl : null,
              sourceUrl: isFinal ? assignment.sourceUrl : null,
              commitTimestamp: assignment.commitTimestamp?.toISOString() ?? null,
              revealTimestamp: assignment.revealTimestamp?.toISOString() ?? null,
              submittedAt: assignment.submittedAt?.toISOString() ?? null,
              revealedAt: assignment.revealedAt?.toISOString() ?? null,
              missedAt: assignment.missedAt?.toISOString() ?? null,
              conflictDetected: Boolean(assignment.conflictDetectedAt),
              coordinatedFlag: isFinal ? assignment.coordinatedFlag : false,
              wrongSourceFlag: isFinal ? assignment.wrongSourceFlag : false,
              rewardUsdc: isFinal ? assignment.rewardUsdc : 0,
              reputationDelta: isFinal ? assignment.reputationDelta : 0,
              penaltyReason: isFinal ? assignment.penaltyReason : null
            };
          });
          return {
            id: panel.id,
            round: panel.round,
            status: panel.status,
            reason: isolatedPanelView ? null : panel.reason,
            trigger: isolatedPanelView ? null : panel.trigger,
            reviewDeadline: panel.reviewDeadline.toISOString(),
            revealDeadline: panel.revealDeadline.toISOString(),
            selectedAt: panel.selectedAt.toISOString(),
            closedAt: isolatedPanelView ? null : panel.closedAt?.toISOString() ?? null,
            auditSummary: isolatedPanelView ? null : isFinal || panel.status !== "open" ? panel.auditSummary : null,
            auditFlags: isolatedPanelView ? null : isFinal ? panel.auditFlags : null,
            auditClean: isolatedPanelView ? null : panel.auditClean,
            consensusOutcome: isolatedPanelView ? null : panel.consensusOutcome,
            agreementCount: isolatedPanelView ? null : panel.agreementCount,
            notesSubmitted: isolatedPanelView ? null : panel.notesSubmitted,
            revealsCompleted: isolatedPanelView ? null : panel.revealsCompleted,
            missedRevealCount: isolatedPanelView ? null : panel.missedRevealCount,
            coordinatedCount: isolatedPanelView ? null : isFinal ? panel.coordinatedCount : 0,
            exposureUsdc: isolatedPanelView ? null : panel.exposureUsdc,
            rewardPoolUsdc: isolatedPanelView ? null : isFinal ? panel.rewardPoolUsdc : 0,
            monetaryEligible: isolatedPanelView ? null : isFinal ? panel.monetaryEligible : false,
            secondPanelForId: isolatedPanelView ? null : panel.secondPanelForId,
            bestAssignmentId: isFinal ? panel.bestAssignmentId : null,
            triggers: isolatedPanelView ? [] : panel.triggers.map((trigger) => ({
              id: trigger.id,
              triggerType: trigger.triggerType,
              detail: trigger.detail,
              createdAt: trigger.createdAt.toISOString()
            })),
            assignments: publicAssignments,
            rewards: isFinal ? panel.rewards.map((reward) => ({
              id: reward.id,
              reviewerWallet: reward.reviewerWallet,
              proverWallet: reward.reviewerWallet,
              amountUsdc: reward.amountUsdc,
              rewardType: reward.rewardType,
              status: reward.status,
              reputationDelta: reward.reputationDelta,
              reason: reward.reason
            })) : []
          };
        }),
        currentReviewPanel: currentPanel ? {
          id: currentPanel.id,
          round: currentPanel.round,
          status: currentPanel.status,
          reviewDeadline: currentPanel.reviewDeadline.toISOString(),
          revealDeadline: currentPanel.revealDeadline.toISOString(),
          notesSubmitted: secondPanelReviewerIsolation ? null : currentPanel.notesSubmitted,
          revealsCompleted: secondPanelReviewerIsolation ? null : currentPanel.revealsCompleted,
          agreementCount: secondPanelReviewerIsolation ? null : isFinal ? currentPanel.agreementCount : 0,
          reviewerCount: secondPanelReviewerIsolation ? null : currentPanel.assignments.length,
          proverCount: secondPanelReviewerIsolation ? null : currentPanel.assignments.length,
          publicMessage: currentPanel.round > 1
            ? "A fresh Prover panel is checking the evidence before final settlement."
            : "Evidence Review is open with a private independent Prover panel."
        } : null,
        proverNotes: isFinal ? reviewerNotes.map((item) => ({
          id: item.id,
          proverWallet: item.reviewerWallet,
          recommendedOutcome: item.recommendedOutcome,
          note: item.note,
          reputationDelta: item.reputationDelta,
          rewardUsdc: item.rewardUsdc,
          metadata: item.metadata,
          createdAt: item.createdAt.toISOString()
        })) : [],
        reviewerNotes: isFinal ? reviewerNotes.map((item) => ({
          id: item.id,
          reviewerWallet: item.reviewerWallet,
          recommendedOutcome: item.recommendedOutcome,
          note: item.note,
          reputationDelta: item.reputationDelta,
          rewardUsdc: item.rewardUsdc,
          metadata: item.metadata,
          createdAt: item.createdAt.toISOString()
        })) : [],
        settlementReceipt: receipts[0] ? {
          id: receipts[0].id,
          finalOutcome: receipts[0].finalOutcome,
          settlementStatus: receipts[0].settlementStatus,
          sourceUsed: receipts[0].sourceUsed,
          bondMovement: receipts[0].bondMovement,
          refundStatus: receipts[0].refundStatus,
          receiptHash: receipts[0].receiptHash,
          hashStatus: receipts[0].hashStatus,
          finalizedAt: receipts[0].finalizedAt?.toISOString() ?? null,
          onchainSettlementTxHash: resolution?.settlementTxHash ?? resolution?.txHash ?? null,
          note: receipts[0].note,
          createdAt: receipts[0].createdAt.toISOString()
        } : null,
        refundQueue: isFinal ? refundQueue.map((item) => ({
          id: item.id,
          recipientWallet: item.recipientWallet,
          amountUsdc: item.amountUsdc,
          refundType: item.refundType,
          status: item.status,
          txHash: item.txHash,
          failureReason: item.failureReason,
          attempts: item.attempts,
          completedAt: item.completedAt?.toISOString() ?? null,
          failedAt: item.failedAt?.toISOString() ?? null
        })) : [],
        conflictReports: secondPanelReviewerIsolation ? [] : conflictReports.map((item) => ({
          id: item.id,
          panelId: item.panelId,
          reviewerWallet: isFinal ? item.reviewerWallet : null,
          proverWallet: isFinal ? item.reviewerWallet : null,
          reason: item.reason,
          status: item.status,
          reviewedAt: item.reviewedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString()
        })),
        auditTrail: secondPanelReviewerIsolation ? [] : auditTrail.map((item) => ({
          id: item.id,
          action: item.action,
          fromStatus: item.fromStatus,
          toStatus: item.toStatus,
          actorWallet: item.actorWallet,
          metadata: item.metadata,
          createdAt: item.createdAt.toISOString()
        }))
      };
    },
    async () => null
  );
}

export async function submitProofFlowProvisional(input: ProofFlowInput & { force?: boolean }) {
  if (!input.outcome) throw new Error("ProofFlow provisional settlement requires an outcome.");
  const db = requireDatabase();
  const market = await db.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error("Market not found.");
  if (market.origin !== "native") throw new Error("ProofFlow only settles native markets.");
  if (!input.force && market.status !== "closed" && market.settlementStatus !== "closed" && market.settlementStatus !== "evidence_review") {
    throw new Error("Market must be closed before provisional settlement.");
  }
  const previousStatus = market.settlementStatus;
  const challengeWindowEndsAt = challengeWindowEnd();
  const amount = market.bondAmount ?? bondAmount();
  const note = [
    input.evidenceText?.trim(),
    input.sourceUrl ? `Source: ${input.sourceUrl}` : null
  ].filter(Boolean).join(" ") || "Provisional ProofFlow outcome submitted with public evidence.";
  const current = await latestResolution(db, market.id);
  const data = {
    proposedOutcome: input.outcome,
    status: "challenge_open",
    resolutionMode: "proofflow",
    settlementMode: market.settlementMode ?? "evidence_based",
    proposerWallet: input.walletAddress ?? current?.proposerWallet,
    assertionClaim: note,
    evidence: jsonInput({ evidenceText: input.evidenceText ?? null, evidenceUrl: input.evidenceUrl ?? null, sourceUrl: input.sourceUrl ?? market.sourceUrl, evidenceTimestamp: input.evidenceTimestamp ?? null }),
    evidenceHash: hashJson({ note, evidenceUrl: input.evidenceUrl ?? null, sourceUrl: input.sourceUrl ?? market.sourceUrl, evidenceTimestamp: input.evidenceTimestamp ?? null }),
    verificationStatus: "provisional",
    challengeWindowEndsAt,
    bondAmount: amount,
    proposerBondStatus: input.bondTxHash ? "posted" : "recorded",
    challengerBondStatus: "none",
    refundStatus: input.outcome === "invalid" ? "pending" : "not_required",
    auditSummary: "A provisional ProofFlow outcome was submitted. It can be challenged with counter-evidence during the public window.",
    proposedAt: new Date(),
    lastError: null
  };
  const resolution = current
    ? await db.marketResolution.update({ where: { id: current.id }, data })
    : await db.marketResolution.create({ data: { marketId: market.id, ...data } });
  await db.proofFlowEvidenceSubmission.create({
    data: {
      marketId: market.id,
      resolutionId: resolution.id,
      kind: "proposer_evidence",
      outcome: input.outcome,
      walletAddress: input.walletAddress ?? undefined,
      evidenceUrl: input.evidenceUrl ?? undefined,
      evidenceText: note,
      sourceUrl: input.sourceUrl ?? market.sourceUrl ?? undefined,
      bondAmount: amount,
      bondStatus: input.bondTxHash ? "posted" : "recorded",
      metadata: jsonInput({ bondTxHash: input.bondTxHash ?? null, evidenceTimestamp: input.evidenceTimestamp ?? null })
    }
  });
  await db.market.update({
    where: { id: market.id },
    data: {
      status: "result_proposed",
      settlementStatus: "challenge_open",
      resolutionState: "challenge_open",
      provisionalOutcome: input.outcome,
      challengeWindowEndsAt,
      bondAmount: amount,
      proposerBondStatus: input.bondTxHash ? "posted" : "recorded",
      challengerBondStatus: "none",
      refundStatus: input.outcome === "invalid" ? "pending" : "not_required"
    }
  });
  await db.proofFlowAuditEvent.create({
    data: {
      marketId: market.id,
      resolutionId: resolution.id,
      action: "submit_provisional",
      fromStatus: previousStatus,
      toStatus: "challenge_open",
      actorWallet: input.walletAddress ?? undefined,
      metadata: jsonInput({ outcome: input.outcome, platformBondCut: 0 })
    }
  });
  return getProofFlowSettlement(market.id);
}

export async function challengeProofFlow(input: ProofFlowInput) {
  if (!input.outcome) throw new Error("ProofFlow challenge requires the challenger outcome.");
  const db = requireDatabase();
  const market = await db.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error("Market not found.");
  if (market.settlementStatus !== "challenge_open") throw new Error("ProofFlow challenge window is not open.");
  if (market.challengeWindowEndsAt && market.challengeWindowEndsAt < new Date()) throw new Error("ProofFlow challenge window has closed.");
  const resolution = await latestResolution(db, market.id);
  if (!resolution) throw new Error("No provisional ProofFlow outcome exists.");
  const amount = market.bondAmount ?? resolution.bondAmount ?? bondAmount();
  await db.proofFlowEvidenceSubmission.create({
    data: {
      marketId: market.id,
      resolutionId: resolution.id,
      kind: "challenge_evidence",
      outcome: input.outcome,
      walletAddress: input.walletAddress ?? undefined,
      evidenceUrl: input.evidenceUrl ?? undefined,
      evidenceText: input.evidenceText ?? "Challenge submitted with counter-evidence.",
      sourceUrl: input.sourceUrl ?? undefined,
      bondAmount: amount,
      bondStatus: input.bondTxHash ? "posted" : "recorded",
      metadata: jsonInput({ bondTxHash: input.bondTxHash ?? null, evidenceTimestamp: input.evidenceTimestamp ?? null })
    }
  });
  await db.marketResolution.update({
    where: { id: resolution.id },
    data: {
      status: "evidence_review",
      verificationStatus: "challenged",
      challengerBondStatus: input.bondTxHash ? "posted" : "recorded",
      lastError: null
    }
  });
  await db.market.update({
    where: { id: market.id },
    data: {
      status: "disputed",
      settlementStatus: "evidence_review",
      resolutionState: "evidence_review",
      challengerBondStatus: input.bondTxHash ? "posted" : "recorded"
    }
  });
  await db.proofFlowAuditEvent.create({
    data: {
      marketId: market.id,
      resolutionId: resolution.id,
      action: "challenge",
      fromStatus: "challenge_open",
      toStatus: "evidence_review",
      actorWallet: input.walletAddress ?? undefined,
      metadata: jsonInput({ challengerOutcome: input.outcome, platformBondCut: 0 })
    }
  });
  await ensureProofFlowReviewPanel(db, market.id);
  return getProofFlowSettlement(market.id);
}

export async function submitProofFlowEvidence(input: ProofFlowInput & { kind?: string }) {
  const db = requireDatabase();
  const market = await db.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error("Market not found.");
  const resolution = await latestResolution(db, market.id);
  const previousEvidence = await db.proofFlowEvidenceSubmission.findFirst({
    where: { marketId: market.id, kind: input.kind ?? "evidence" },
    orderBy: { createdAt: "desc" }
  });
  const resolutionDeadline = resolutionDeadlineFor(market);
  const materiality = isMaterialEvidenceChange({
    previousEvidence: previousEvidence ? {
      outcome: previousEvidence.outcome as ProofFlowOutcome | null,
      sourceUrl: previousEvidence.sourceUrl,
      evidenceText: previousEvidence.evidenceText,
      evidenceTimestamp: evidenceTimestampFromMetadata(previousEvidence)
    } : null,
    newEvidence: {
      outcome: input.outcome ?? null,
      sourceUrl: input.sourceUrl,
      evidenceText: input.evidenceText,
      evidenceTimestamp: input.evidenceTimestamp ?? new Date()
    },
    marketCloseTime: market.closeTime,
    resolutionDeadline
  });
  await db.proofFlowEvidenceSubmission.create({
    data: {
      marketId: market.id,
      resolutionId: resolution?.id,
      kind: input.kind ?? "evidence",
      outcome: input.outcome ?? undefined,
      walletAddress: input.walletAddress ?? undefined,
      evidenceUrl: input.evidenceUrl ?? undefined,
      evidenceText: input.evidenceText ?? undefined,
      sourceUrl: input.sourceUrl ?? undefined,
      bondStatus: "not_required",
      metadata: jsonInput({
        evidenceTimestamp: input.evidenceTimestamp ?? null,
        materiality
      })
    }
  });
  await db.proofFlowAuditEvent.create({
    data: {
      marketId: market.id,
      resolutionId: resolution?.id,
      action: "submit_evidence",
      actorWallet: input.walletAddress ?? undefined,
      metadata: jsonInput({ kind: input.kind ?? "evidence", outcome: input.outcome ?? null, materiality })
    }
  });
  await markMaterialEvidenceChangedForOpenPanels(db, {
    marketId: market.id,
    materiality: materiality.level,
    reasons: materiality.reasons
  });
  return getProofFlowSettlement(market.id);
}

export async function submitProofFlowReviewerNote(input: ProofFlowInput & { noteHash: string; confidence?: number | null }) {
  if (!input.outcome) throw new Error("Prover note requires a recommended outcome.");
  if (!validProofFlowHash(input.noteHash)) throw new Error("Prover note commit requires a 32-byte noteHash.");
  const db = requireDatabase();
  const market = await db.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error("Market not found.");
  const resolution = await latestResolution(db, market.id);
  const reviewer = normalizeWallet(input.walletAddress);
  if (!reviewer) throw new Error("Prover wallet is required.");
  const panel = await activeReviewPanel(db, market.id);
  if (!panel) throw new Error("No active ProofFlow Prover panel is open.");
  const assignment = panel.assignments.find((item) => normalizeWallet(item.reviewerWallet) === reviewer);
  if (!assignment) throw new Error("This wallet is not assigned to the active ProofFlow Prover panel.");
  if (assignment.status === "revealed") throw new Error("This Prover note has already been revealed.");
  if (panel.reviewDeadline < new Date()) throw new Error("The private review submission deadline has passed.");
  await db.proofFlowReviewAssignment.update({
    where: { id: assignment.id },
    data: {
      status: "submitted",
      recommendedOutcome: input.outcome,
      noteText: null,
      noteNonce: null,
      noteHash: input.noteHash.replace(/^0x/, "").toLowerCase(),
      confidence: input.confidence ?? undefined,
      evidenceUrl: input.evidenceUrl ?? undefined,
      sourceUrl: input.sourceUrl ?? market.sourceUrl ?? undefined,
      submittedAt: new Date(),
      commitTimestamp: new Date(),
      wrongSourceFlag: Boolean(input.sourceUrl && !sameHost(input.sourceUrl, market.sourceUrl)),
      noteScore: null,
      metadata: jsonInput({ privateDuringReview: true, commitReveal: true, aiIsFinalAuthority: false })
    }
  });
  const notesSubmitted = await db.proofFlowReviewAssignment.count({
    where: { panelId: panel.id, submittedAt: { not: null } }
  });
  await db.proofFlowReviewPanel.update({
    where: { id: panel.id },
    data: {
      notesSubmitted,
      status: notesSubmitted >= proofFlowProverPanelSize() ? "review_ready" : panel.status
    }
  });
  await db.proofFlowAuditEvent.create({
    data: {
      marketId: market.id,
      resolutionId: resolution?.id,
      action: "prover_private_note_submitted",
      actorWallet: input.walletAddress ?? undefined,
      metadata: jsonInput({ panelId: panel.id, round: panel.round, noteHash: input.noteHash.replace(/^0x/, "").toLowerCase(), commitReveal: true, commitTimestamp: new Date().toISOString() })
    }
  });
  return getProofFlowSettlement(market.id, input.walletAddress);
}

export async function revealProofFlowReviewerNote(input: ProofFlowInput & { note: string; nonce: string }) {
  if (!input.outcome) throw new Error("Prover reveal requires the recommended outcome.");
  if (!input.nonce?.trim()) throw new Error("Prover reveal requires the commit nonce.");
  const db = requireDatabase();
  const market = await db.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error("Market not found.");
  const resolution = await latestResolution(db, market.id);
  const reviewer = normalizeWallet(input.walletAddress);
  if (!reviewer) throw new Error("Prover wallet is required.");
  const panel = await activeReviewPanel(db, market.id);
  if (!panel) throw new Error("No active ProofFlow Prover panel is open.");
  const assignment = panel.assignments.find((item) => normalizeWallet(item.reviewerWallet) === reviewer);
  if (!assignment) throw new Error("This wallet is not assigned to the active ProofFlow Prover panel.");
  if (assignment.status !== "submitted" && assignment.status !== "revealed") throw new Error("Submit a private Prover note before revealing it.");
  if (panel.revealDeadline < new Date()) throw new Error("The Prover reveal deadline has passed.");
  if (panel.status === "open" && panel.reviewDeadline > new Date()) {
    throw new Error("Reveal phase opens after all Prover commits are submitted or the review deadline passes.");
  }
  if (!assignment.noteHash || !validateReviewerNoteReveal({ noteText: input.note, nonce: input.nonce, noteHash: assignment.noteHash })) {
    throw new Error("Prover reveal does not match the submitted private note hash.");
  }
  const sourceUrl = input.sourceUrl ?? assignment.sourceUrl ?? market.sourceUrl;
  const wrongSourceFlag = Boolean(sourceUrl && !sameHost(sourceUrl, market.sourceUrl));
  await db.proofFlowReviewAssignment.update({
    where: { id: assignment.id },
    data: {
      status: "revealed",
      recommendedOutcome: input.outcome,
      noteText: input.note,
      noteNonce: input.nonce,
      sourceUrl: sourceUrl ?? undefined,
      evidenceUrl: input.evidenceUrl ?? assignment.evidenceUrl ?? undefined,
      wrongSourceFlag: assignment.wrongSourceFlag || wrongSourceFlag,
      revealedAt: new Date(),
      revealTimestamp: new Date(),
      noteScore: noteScore(input.note)
    }
  });
  const revealsCompleted = await db.proofFlowReviewAssignment.count({
    where: { panelId: panel.id, status: "revealed" }
  });
  await db.proofFlowReviewPanel.update({
    where: { id: panel.id },
    data: { revealsCompleted }
  });
  await db.proofFlowAuditEvent.create({
    data: {
      marketId: market.id,
      resolutionId: resolution?.id,
      action: "prover_note_revealed",
      actorWallet: input.walletAddress ?? undefined,
      metadata: jsonInput({ panelId: panel.id, round: panel.round, recommendedOutcome: input.outcome, revealTimestamp: new Date().toISOString(), commitReveal: true })
    }
  });
  if (revealsCompleted >= proofFlowProverPanelSize()) {
    await evaluateProofFlowReviewPanel(db, panel.id);
  }
  return getProofFlowSettlement(market.id, input.walletAddress);
}

export async function flagProofFlowReviewerConflict(input: { marketId: string; reviewerWallet: string; reason: string }) {
  const db = requireDatabase();
  const market = await db.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error("Market not found.");
  const panel = await activeReviewPanel(db, input.marketId);
  if (!panel) throw new Error("No active ProofFlow Prover panel is open.");
  const reviewer = normalizeWallet(input.reviewerWallet);
  const assignment = panel.assignments.find((item) => normalizeWallet(item.reviewerWallet) === reviewer);
  if (!assignment) throw new Error("Prover is not assigned to the active panel.");
  await db.proofFlowReviewAssignment.update({
    where: { id: assignment.id },
    data: { conflictDetectedAt: new Date(), conflictReason: input.reason }
  });
  await db.proofFlowAuditEvent.create({
    data: {
      marketId: market.id,
      resolutionId: assignment.resolutionId ?? undefined,
      action: "prover_conflict_flagged",
      actorWallet: input.reviewerWallet,
      metadata: jsonInput({ panelId: panel.id, reason: input.reason })
    }
  });
  await evaluateProofFlowReviewPanel(db, panel.id);
  return getProofFlowSettlement(market.id);
}

export async function reportProofFlowReviewerConflict(input: {
  marketId: string;
  reviewerWallet?: string | null;
  panelId?: string | null;
  assignmentId?: string | null;
  reporterUserId?: string | null;
  reporterWallet?: string | null;
  reason: string;
  details?: string | null;
}) {
  const db = requireDatabase();
  const market = await db.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error("Market not found.");
  const activePanel = input.panelId
    ? await db.proofFlowReviewPanel.findUnique({ where: { id: input.panelId }, include: { assignments: true } })
    : await activeReviewPanel(db, input.marketId);
  const reviewer = normalizeWallet(input.reviewerWallet);
  const assignment = input.assignmentId
    ? await db.proofFlowReviewAssignment.findUnique({ where: { id: input.assignmentId } })
    : activePanel?.assignments.find((item) => reviewer && normalizeWallet(item.reviewerWallet) === reviewer) ?? null;
  const resolution = await latestResolution(db, market.id);
  const report = await db.proofFlowReviewerConflictReport.create({
    data: {
      marketId: market.id,
      resolutionId: resolution?.id ?? undefined,
      panelId: activePanel?.id ?? assignment?.panelId ?? undefined,
      assignmentId: assignment?.id ?? undefined,
      reviewerWallet: assignment?.reviewerWallet ?? input.reviewerWallet ?? undefined,
      reporterUserId: input.reporterUserId ?? undefined,
      reporterWallet: input.reporterWallet ?? undefined,
      reason: input.reason,
      details: input.details ?? undefined,
      status: "PENDING",
      metadata: jsonInput({ moderationRequired: true })
    }
  });
  await db.proofFlowAuditEvent.create({
    data: {
      marketId: market.id,
      resolutionId: resolution?.id ?? undefined,
      action: "prover_conflict_reported",
      actorWallet: input.reporterWallet ?? undefined,
      metadata: jsonInput({
        reportId: report.id,
        panelId: report.panelId,
        assignmentId: report.assignmentId,
        reason: report.reason
      })
    }
  });
  return { ok: true, reportId: report.id, proofFlow: await getProofFlowSettlement(market.id, input.reporterWallet) };
}

export async function listProofFlowReviewerConflictReports(input: { status?: string; limit?: number } = {}) {
  const db = requireDatabase();
  return db.proofFlowReviewerConflictReport.findMany({
    where: input.status ? { status: input.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 50
  });
}

export async function reviewProofFlowReviewerConflict(input: {
  reportId: string;
  action: "confirm" | "dismiss";
  moderatorWallet?: string | null;
  moderationNote?: string | null;
}) {
  const db = requireDatabase();
  const report = await db.proofFlowReviewerConflictReport.findUnique({ where: { id: input.reportId } });
  if (!report) throw new Error("Conflict report not found.");
  const now = new Date();
  if (input.action === "dismiss") {
    const updated = await db.proofFlowReviewerConflictReport.update({
      where: { id: report.id },
      data: {
        status: "DISMISSED",
        moderatorWallet: input.moderatorWallet ?? undefined,
        moderationNote: input.moderationNote ?? undefined,
        reviewedAt: now,
        dismissedAt: now
      }
    });
    await db.proofFlowAuditEvent.create({
      data: {
        marketId: report.marketId,
        resolutionId: report.resolutionId ?? undefined,
        action: "prover_conflict_dismissed",
        actorWallet: input.moderatorWallet ?? undefined,
        metadata: jsonInput({ reportId: report.id, moderationNote: input.moderationNote ?? null })
      }
    });
    return { ok: true, report: updated, proofFlow: await getProofFlowSettlement(report.marketId, input.moderatorWallet) };
  }

  const activePanel = report.panelId
    ? await db.proofFlowReviewPanel.findUnique({ where: { id: report.panelId }, include: { assignments: true } })
    : await activeReviewPanel(db, report.marketId);
  const reviewer = normalizeWallet(report.reviewerWallet);
  const assignment = report.assignmentId
    ? await db.proofFlowReviewAssignment.findUnique({ where: { id: report.assignmentId } })
    : activePanel?.assignments.find((item) => reviewer && normalizeWallet(item.reviewerWallet) === reviewer) ?? null;
  const updated = await db.proofFlowReviewerConflictReport.update({
    where: { id: report.id },
    data: {
      status: "CONFIRMED",
      moderatorWallet: input.moderatorWallet ?? undefined,
      moderationNote: input.moderationNote ?? undefined,
      reviewedAt: now,
      confirmedAt: now,
      panelId: activePanel?.id ?? assignment?.panelId ?? report.panelId ?? undefined,
      assignmentId: assignment?.id ?? report.assignmentId ?? undefined,
      reviewerWallet: assignment?.reviewerWallet ?? report.reviewerWallet ?? undefined
    }
  });
  if (assignment) {
    await db.proofFlowReviewAssignment.update({
      where: { id: assignment.id },
      data: { conflictDetectedAt: now, conflictReason: report.reason }
    });
  }
  await db.proofFlowAuditEvent.create({
    data: {
      marketId: report.marketId,
      resolutionId: report.resolutionId ?? undefined,
      action: "prover_conflict_confirmed",
      actorWallet: input.moderatorWallet ?? undefined,
      metadata: jsonInput({
        reportId: report.id,
        panelId: updated.panelId,
        assignmentId: updated.assignmentId,
        reason: report.reason,
        requestAdditionalReview: Boolean(activePanel)
      })
    }
  });
  if (activePanel && ["open", "review_ready", "additional_review_open"].includes(activePanel.status)) {
    if (activePanel.round < 2) {
      await openSecondPanelFromTriggers(db, {
        panelId: activePanel.id,
        marketId: report.marketId,
        resolutionId: report.resolutionId,
        triggers: [{
          triggerType: "conflict_of_interest",
          detail: "A Prover conflict of interest was confirmed after selection.",
          metadata: { reportId: report.id, assignmentId: assignment?.id ?? null }
        }]
      });
      await db.proofFlowAuditEvent.create({
        data: {
          marketId: report.marketId,
          resolutionId: report.resolutionId ?? undefined,
          action: "request_additional_review",
          actorWallet: input.moderatorWallet ?? undefined,
          metadata: jsonInput({ reportId: report.id, reason: "confirmed_prover_conflict" })
        }
      });
    } else {
      await evaluateProofFlowReviewPanel(db, activePanel.id);
    }
  }
  return { ok: true, report: updated, proofFlow: await getProofFlowSettlement(report.marketId, input.moderatorWallet) };
}

export const submitProofFlowProverNote = submitProofFlowReviewerNote;
export const revealProofFlowProverNote = revealProofFlowReviewerNote;
export const flagProofFlowProverConflict = flagProofFlowReviewerConflict;
export const reportProofFlowProverConflict = reportProofFlowReviewerConflict;
export const listProofFlowProverConflictReports = listProofFlowReviewerConflictReports;
export const reviewProofFlowProverConflict = reviewProofFlowReviewerConflict;

export async function runProofFlowAudit(input: { marketId: string }) {
  const db = requireDatabase();
  const panel = await activeReviewPanel(db, input.marketId);
  if (panel) {
    const audit = await runStructuredPanelAudit(db, { marketId: input.marketId, panelId: panel.id });
    await db.proofFlowReviewPanel.update({
      where: { id: panel.id },
      data: { auditSummary: audit.summary, auditFlags: jsonInput(audit), auditClean: audit.clean }
    });
    const resolution = await latestResolution(db, input.marketId);
    await db.market.update({ where: { id: input.marketId }, data: { auditSummary: audit.summary } });
    if (resolution) {
      await db.marketResolution.update({ where: { id: resolution.id }, data: { auditSummary: audit.summary } });
    }
    await db.proofFlowAuditEvent.create({
      data: {
        marketId: input.marketId,
        resolutionId: resolution?.id,
        action: "nexmind_panel_audit",
        metadata: jsonInput({ panelId: panel.id, audit, aiIsFinalAuthority: false })
      }
    });
    return { ok: true, auditSummary: audit.summary, audit };
  }
  const snapshot = await getProofFlowSettlement(input.marketId);
  if (!snapshot) throw new Error("Market not found.");
  const fallbackSummary = "NexMind Audit reviewed the locked Resolution Card, timestamps and submitted evidence. This summary is decision support only; final settlement follows ProofFlow rules and public challenge/review state.";
  let auditSummary = fallbackSummary;
  if (bankrAiReady()) {
    try {
      const response = await callBankrJson({
        feature: "proofflow_audit",
        metadata: { marketId: input.marketId },
        messages: [
          {
            role: "system",
            content: "You are NexMind Audit. Summarize whether evidence supports YES, NO, or INVALID. You are not the final authority. Return JSON only."
          },
          {
            role: "user",
            content: JSON.stringify({
              instruction: "Check locked rules, timestamps, source validity and evidence sufficiency. Return concise audit support.",
              snapshot,
              output: {
                recommendedOutcome: "ride | fade | invalid | null",
                summary: "human-readable explanation",
                evidenceSufficient: "boolean",
                caveats: ["short caveats"]
              }
            })
          }
        ]
      });
      const json = asRecord(response.json);
      auditSummary = typeof json.summary === "string" ? json.summary.slice(0, 1200) : fallbackSummary;
    } catch {
      auditSummary = fallbackSummary;
    }
  }
  const resolution = await latestResolution(db, input.marketId);
  await db.market.update({ where: { id: input.marketId }, data: { auditSummary } });
  if (resolution) {
    await db.marketResolution.update({ where: { id: resolution.id }, data: { auditSummary } });
  }
  await db.proofFlowAuditEvent.create({
    data: {
      marketId: input.marketId,
      resolutionId: resolution?.id,
      action: "nexmind_audit_summary",
      metadata: jsonInput({ auditSummary, aiIsFinalAuthority: false })
    }
  });
  return { ok: true, auditSummary };
}

async function enqueueProofFlowReceiptHashJob(
  db: ReturnType<typeof requireDatabase>,
  input: { marketId: string; receiptId: string }
) {
  await db.proofFlowReceiptHashJob.upsert({
    where: { receiptId: input.receiptId },
    update: { status: "PENDING_HASH", failureReason: null },
    create: {
      marketId: input.marketId,
      receiptId: input.receiptId,
      status: "PENDING_HASH"
    }
  });
}

async function enqueueProofFlowBondRefunds(
  db: ReturnType<typeof requireDatabase>,
  input: {
    marketId: string;
    resolutionId?: string | null;
    receiptId: string;
    amountUsdc: number;
  }
) {
  const [proposerEvidence, challengeEvidence] = await Promise.all([
    db.proofFlowEvidenceSubmission.findFirst({
      where: { marketId: input.marketId, kind: "proposer_evidence" },
      orderBy: { createdAt: "asc" }
    }),
    db.proofFlowEvidenceSubmission.findFirst({
      where: { marketId: input.marketId, kind: "challenge_evidence" },
      orderBy: { createdAt: "asc" }
    })
  ]);
  const resolution = await latestResolution(db, input.marketId);
  const refunds = [
    {
      recipientWallet: resolution?.proposerWallet ?? proposerEvidence?.walletAddress ?? "",
      amountUsdc: input.amountUsdc,
      refundType: "proposal_bond_refund"
    },
    ...(challengeEvidence ? [{
      recipientWallet: challengeEvidence.walletAddress ?? "",
      amountUsdc: input.amountUsdc,
      refundType: "challenge_bond_refund"
    }] : [])
  ].filter((row) => row.amountUsdc > 0 && validWalletAddress(row.recipientWallet));
  let queued = 0;

  for (const refund of refunds) {
    const existing = await db.proofFlowRefundQueue.findFirst({
      where: {
        receiptId: input.receiptId,
        refundType: refund.refundType,
        recipientWallet: refund.recipientWallet
      }
    });
    if (existing) continue;
    await db.proofFlowRefundQueue.create({
      data: {
        marketId: input.marketId,
        resolutionId: input.resolutionId ?? undefined,
        receiptId: input.receiptId,
        recipientWallet: refund.recipientWallet,
        amountUsdc: refund.amountUsdc,
        refundType: refund.refundType,
        status: "PENDING",
        metadata: jsonInput({ executable: true })
      }
    });
    queued += 1;
  }
  if (refunds.length) {
    await db.proofFlowSettlementReceipt.update({
      where: { id: input.receiptId },
      data: { refundStatus: "PENDING" }
    });
    await db.market.update({
      where: { id: input.marketId },
      data: { refundStatus: "PENDING" }
    });
  }
  return queued;
}

async function updateRefundReceiptStatus(db: ReturnType<typeof requireDatabase>, receiptId: string | null) {
  if (!receiptId) return;
  const rows = await db.proofFlowRefundQueue.findMany({ where: { receiptId } });
  if (!rows.length) return;
  const status = rows.every((row) => row.status === "COMPLETED")
    ? "COMPLETED"
    : rows.some((row) => row.status === "PROCESSING")
      ? "PROCESSING"
      : rows.some((row) => row.status === "FAILED")
        ? "FAILED"
        : "PENDING";
  const receipt = await db.proofFlowSettlementReceipt.update({
    where: { id: receiptId },
    data: { refundStatus: status }
  });
  await db.market.updateMany({
    where: { id: receipt.marketId },
    data: { refundStatus: status }
  });
}

async function transferProofFlowRefund(input: { recipientWallet: string; amountUsdc: number }) {
  if (!validWalletAddress(input.recipientWallet)) {
    throw new Error("Refund recipient is not a valid wallet address.");
  }
  const privateKey = proofFlowRefundPrivateKey();
  if (!privateKey) throw new Error("PROOFFLOW_REFUND_PRIVATE_KEY is not configured.");
  const chainId = proofFlowRefundChainId();
  const tokenAddress = proofFlowRefundTokenAddress(chainId);
  if (!tokenAddress) throw new Error("ProofFlow refund USDC token address is not configured.");
  const account = privateKeyToAccount(privateKey);
  const chain = proofFlowChain(chainId);
  const transport = http(proofFlowRefundRpcUrl(chainId));
  const walletClient = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });
  const amount = parseUnits(input.amountUsdc.toFixed(6), 6);
  const txHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "transfer",
    args: [input.recipientWallet, amount]
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function executeProofFlowRefundQueue(input: { limit?: number } = {}) {
  const db = requireDatabase();
  const rows = await db.proofFlowRefundQueue.findMany({
    where: { status: { in: ["PENDING", "FAILED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: input.limit ?? 10
  });
  const results = [];
  for (const row of rows) {
    const attempts = row.attempts + 1;
    await db.proofFlowRefundQueue.update({
      where: { id: row.id },
      data: { status: "PROCESSING", attempts, processedAt: new Date(), failureReason: null }
    });
    await updateRefundReceiptStatus(db, row.receiptId);
    try {
      const txHash = await transferProofFlowRefund({
        recipientWallet: row.recipientWallet,
        amountUsdc: row.amountUsdc
      });
      const completedAt = new Date();
      await db.proofFlowRefundQueue.update({
        where: { id: row.id },
        data: {
          status: "COMPLETED",
          txHash,
          completedAt,
          processedAt: completedAt,
          failureReason: null
        }
      });
      await db.proofFlowAuditEvent.create({
        data: {
          marketId: row.marketId,
          resolutionId: row.resolutionId ?? undefined,
          action: "bond_refund_completed",
          metadata: jsonInput({ refundQueueId: row.id, txHash, recipient: row.recipientWallet, amountUsdc: row.amountUsdc })
        }
      });
      await updateRefundReceiptStatus(db, row.receiptId);
      results.push({ action: "proof_flow_refund", marketId: row.marketId, ok: true, status: "COMPLETED", id: row.id, txHash });
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "Unknown ProofFlow refund execution failure.";
      await db.proofFlowRefundQueue.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          attempts,
          failedAt: new Date(),
          failureReason
        }
      });
      await db.proofFlowAuditEvent.create({
        data: {
          marketId: row.marketId,
          resolutionId: row.resolutionId ?? undefined,
          action: "bond_refund_failed",
          metadata: jsonInput({ refundQueueId: row.id, recipient: row.recipientWallet, amountUsdc: row.amountUsdc, failureReason, retryable: true })
        }
      });
      await updateRefundReceiptStatus(db, row.receiptId);
      results.push({ action: "proof_flow_refund", marketId: row.marketId, ok: false, status: "FAILED", id: row.id, detail: failureReason });
    }
  }
  return results;
}

export async function processProofFlowReceiptHashJobs(input: { limit?: number } = {}) {
  const db = requireDatabase();
  const jobs = await db.proofFlowReceiptHashJob.findMany({
    where: { status: { in: ["PENDING_HASH", "HASH_FAILED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: input.limit ?? 10
  });
  const results = [];
  for (const job of jobs) {
    const attempts = job.attempts + 1;
    await db.proofFlowReceiptHashJob.update({
      where: { id: job.id },
      data: { status: "HASHING", attempts, failureReason: null }
    });
    await db.proofFlowSettlementReceipt.updateMany({
      where: { id: job.receiptId },
      data: { hashStatus: "HASHING" }
    });
    try {
      const receipt = await db.proofFlowSettlementReceipt.findUnique({ where: { id: job.receiptId } });
      if (!receipt) throw new Error("Settlement receipt not found.");
      const receiptHash = hashSettlementReceiptPayload({
        id: receipt.id,
        marketId: receipt.marketId,
        resolutionId: receipt.resolutionId,
        finalOutcome: receipt.finalOutcome,
        settlementStatus: receipt.settlementStatus,
        sourceUsed: receipt.sourceUsed,
        bondMovement: receipt.bondMovement,
        note: receipt.note,
        finalizedAt: receipt.finalizedAt?.toISOString() ?? null
      });
      const confirmedAt = new Date();
      await db.proofFlowSettlementReceipt.update({
        where: { id: receipt.id },
        data: { receiptHash, hashStatus: "HASH_CONFIRMED" }
      });
      await db.proofFlowReceiptHashJob.update({
        where: { id: job.id },
        data: { status: "HASH_CONFIRMED", receiptHash, confirmedAt, failureReason: null }
      });
      await db.proofFlowAuditEvent.create({
        data: {
          marketId: receipt.marketId,
          resolutionId: receipt.resolutionId ?? undefined,
          action: "settlement_receipt_hash_confirmed",
          metadata: jsonInput({ receiptId: receipt.id, receiptHash })
        }
      });
      results.push({ action: "proof_flow_receipt_hash", marketId: receipt.marketId, ok: true, status: "HASH_CONFIRMED", receiptId: receipt.id, receiptHash });
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "Unknown receipt hash failure.";
      await db.proofFlowReceiptHashJob.update({
        where: { id: job.id },
        data: { status: "HASH_FAILED", failureReason }
      });
      await db.proofFlowSettlementReceipt.updateMany({
        where: { id: job.receiptId },
        data: { hashStatus: "HASH_FAILED" }
      });
      results.push({ action: "proof_flow_receipt_hash", marketId: job.marketId, ok: false, status: "HASH_FAILED", receiptId: job.receiptId, detail: failureReason });
    }
  }
  return results;
}

export async function finalizeProofFlowMarket(input: ProofFlowInput & { force?: boolean }) {
  const db = requireDatabase();
  const market = await db.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error("Market not found.");
  if (market.origin !== "native") throw new Error("ProofFlow only settles native markets.");
  if (marketIsFinal(market)) {
    await confirmPendingProverRewards(db, { marketId: market.id });
    await confirmPendingProverReputation(db, market.id);
    return getProofFlowSettlement(market.id);
  }
  const resolution = await latestResolution(db, market.id);
  if (!resolution) throw new Error("No ProofFlow resolution exists.");
  if (resolution.status === "challenge_open" && resolution.challengeWindowEndsAt && resolution.challengeWindowEndsAt > new Date() && !input.force) {
    throw new Error("Challenge window is still open.");
  }
  const challengeCount = await db.proofFlowEvidenceSubmission.count({
    where: { marketId: market.id, kind: "challenge_evidence" }
  });
  const outcome = input.outcome ?? resolution.proposedOutcome ?? "invalid";
  const reviewPanel = input.reviewPanelId
    ? await db.proofFlowReviewPanel.findUnique({
      where: { id: input.reviewPanelId },
      include: { assignments: true, rewards: true }
    })
    : null;
  if (challengeCount > 0 && !reviewPanel) {
    throw new Error("Challenged markets must finalize through a ProofFlow Prover panel.");
  }
  if (reviewPanel && reviewPanel.marketId !== market.id) {
    throw new Error("Review panel does not belong to this market.");
  }
  if (reviewPanel && outcome !== "invalid" && (reviewPanel.status !== "final_confidence_reached" || reviewPanel.consensusOutcome !== outcome || reviewPanel.agreementCount < proofFlowProverConsensusCount())) {
    throw new Error("ProofFlow finalization requires Prover consensus and a clean audit.");
  }
  if (reviewPanel && outcome === "invalid" && !["final_confidence_reached", "no_confidence_invalid"].includes(reviewPanel.status)) {
    throw new Error("Invalid settlement requires Prover consensus for INVALID or a no-confidence second panel.");
  }
  if (!input.force && (resolution.status === "evidence_review" || resolution.status === "additional_review")) {
    throw new Error("Evidence review finalization must run through the ProofFlow review path.");
  }
  if (!input.force && resolution.proposedOutcome && outcome !== resolution.proposedOutcome) {
    throw new Error("Public finalization cannot change the provisional ProofFlow outcome.");
  }
  const reviewerVotes = reviewPanel ? voteBreakdown(reviewPanel.assignments as Array<{ status: string; recommendedOutcome: ProofFlowOutcome | null }>) : null;
  const challengeEvidence = await db.proofFlowEvidenceSubmission.findFirst({
    where: { marketId: market.id, kind: "challenge_evidence" },
    orderBy: { createdAt: "asc" }
  });
  const challengerWallet = challengeEvidence?.walletAddress ?? null;
  const alignedAssignments = reviewPanel
    ? reviewPanel.assignments.filter((assignment) => assignment.status === "revealed" && assignment.recommendedOutcome === outcome)
    : [];
  const topScore = Math.max(...alignedAssignments.map((assignment) => Number(assignment.noteScore ?? 0)), 0);
  const topEvidenceNotes = reviewPanel
    ? alignedAssignments
      .filter((assignment) => Number(assignment.noteScore ?? 0) === topScore && assignment.noteText)
      .map((assignment) => ({
        reviewerWallet: assignment.reviewerWallet,
        outcome: assignment.recommendedOutcome,
        note: assignment.noteText,
        score: assignment.noteScore
      }))
    : [];
  const status = finalStatusFor(outcome);
  const note = finalNote({
    market,
    outcome,
    sourceUsed: input.sourceUrl ?? market.sourceUrl,
    auditSummary: input.reason ?? resolution.auditSummary,
    reason: input.evidenceText ?? resolution.assertionClaim ?? (outcome === "invalid" ? "Evidence was insufficient to prove YES or NO." : undefined)
  });
  const proposerWins = challengeCount === 0 || outcome === resolution.proposedOutcome;
  const amount = Number(market.bondAmount ?? resolution.bondAmount ?? bondAmount());
  const bondMovement = {
    platformCut: 0,
    nexMarketsPlatform: { amountUsdc: 0, status: "no_dispute_bond_cut" },
    proposalBond: {
      amountUsdc: amount,
      status: outcome === "invalid" ? "refunded" : proposerWins ? "returned_plus_half_challenge_bond" : "half_awarded_to_challenger"
    },
    challengeBond: {
      amountUsdc: challengeCount === 0 ? 0 : amount,
      status: challengeCount === 0 ? "none" : outcome === "invalid" ? "refunded" : proposerWins ? "half_awarded_to_proposer" : "returned_plus_half_proposal_bond"
    },
    distribution: [
      {
        recipient: resolution.proposerWallet ?? "proposer",
        role: "proposer",
        amountUsdc: challengeCount === 0 || outcome === "invalid" ? amount : proposerWins ? amount + amount / 2 : amount / 2
      },
      ...(challengeCount > 0 ? [{
        recipient: challengerWallet ?? "challenger",
        role: "challenger",
        amountUsdc: outcome === "invalid" ? amount : proposerWins ? amount / 2 : amount + amount / 2
      }] : []),
      {
        recipient: "NexMarkets",
        role: "platform",
        amountUsdc: 0
      },
      ...((reviewPanel?.rewards ?? []).map((reward) => ({
        recipient: reward.reviewerWallet,
        role: "prover",
        amountUsdc: reward.amountUsdc,
        rewardType: reward.rewardType
      })))
    ]
  };
  const receiptNote = {
    ...note,
    reviewerVoteBreakdown: reviewerVotes,
    topEvidenceNote: topEvidenceNotes.length === 1 ? topEvidenceNotes[0] : topEvidenceNotes,
    auditSummary: note.auditSummary,
    onchainReceiptHash: input.bondTxHash ?? resolution.settlementTxHash ?? resolution.txHash ?? null,
    bondDistribution: bondMovement.distribution,
    nexMarketsBondCutUsdc: 0
  };
  const updated = await db.marketResolution.update({
    where: { id: resolution.id },
    data: {
      status,
      finalOutcome: outcome,
      verificationStatus: "finalized",
      finalResolutionNote: jsonInput(receiptNote),
      refundStatus: outcome === "invalid" ? "PENDING" : "not_required",
      proposerBondStatus: bondMovement.proposalBond.status,
      challengerBondStatus: bondMovement.challengeBond.status,
      finalizedAt: new Date(),
      lastError: null
    }
  });
  await db.market.update({
    where: { id: market.id },
    data: {
      status: finalMarketStatus(outcome),
      settlementStatus: status,
      resolutionState: status,
      finalOutcome: outcome,
      finalResolutionNote: jsonInput(receiptNote),
      auditSummary: receiptNote.auditSummary,
      proposerBondStatus: bondMovement.proposalBond.status,
      challengerBondStatus: bondMovement.challengeBond.status,
      refundStatus: outcome === "invalid" ? "PENDING" : "not_required"
    }
  });
  const receipt = await db.proofFlowSettlementReceipt.create({
    data: {
      marketId: market.id,
      resolutionId: updated.id,
      finalOutcome: outcome,
      settlementStatus: status,
      sourceUsed: note.sourceUsed ?? undefined,
      bondMovement: jsonInput(bondMovement),
      refundStatus: outcome === "invalid" ? "PENDING" : "not_required",
      hashStatus: "PENDING_HASH",
      finalizedAt: new Date(),
      note: jsonInput(receiptNote)
    }
  });
  await enqueueProofFlowReceiptHashJob(db, { marketId: market.id, receiptId: receipt.id });
  if (outcome === "invalid") {
    const queuedRefunds = await enqueueProofFlowBondRefunds(db, {
      marketId: market.id,
      resolutionId: updated.id,
      receiptId: receipt.id,
      amountUsdc: amount
    });
    if (queuedRefunds === 0) {
      await db.marketResolution.update({ where: { id: updated.id }, data: { refundStatus: "not_required" } });
      await db.proofFlowSettlementReceipt.update({ where: { id: receipt.id }, data: { refundStatus: "not_required" } });
      await db.market.update({ where: { id: market.id }, data: { refundStatus: "not_required" } });
    }
  }
  try {
    await confirmPendingProverRewards(db, { marketId: market.id });
    await confirmPendingProverReputation(db, market.id);
  } catch (error) {
    await markProverRewardFinalizationFailure(db, {
      marketId: market.id,
      detail: error instanceof Error ? error.message : "Unknown reward finalization failure."
    });
    throw error;
  }
  await db.proofFlowAuditEvent.create({
    data: {
      marketId: market.id,
      resolutionId: updated.id,
      action: "finalize",
      fromStatus: resolution.status,
      toStatus: status,
      actorWallet: input.walletAddress ?? undefined,
      metadata: jsonInput({ outcome, bondMovement, reviewPanelId: reviewPanel?.id ?? null, aiIsFinalAuthority: false })
    }
  });
  return getProofFlowSettlement(market.id);
}

export async function refundProofFlowMarket(input: ProofFlowInput & { force?: boolean }) {
  return finalizeProofFlowMarket({
    ...input,
    outcome: "invalid",
    reason: input.reason ?? "Truth could not be proven from locked rules and public evidence, so ProofFlow resolved INVALID / REFUND.",
    force: input.force ?? true
  });
}

export async function finalizeExpiredProofFlowMarkets(input: { limit?: number } = {}) {
  const db = requireDatabase();
  const resolutions = await db.marketResolution.findMany({
    where: {
      status: "challenge_open",
      challengeWindowEndsAt: { lte: new Date() },
      proposedOutcome: { not: null }
    },
    orderBy: { challengeWindowEndsAt: "asc" },
    take: input.limit ?? 10
  });
  const results = [];
  for (const resolution of resolutions) {
    const challengeCount = await db.proofFlowEvidenceSubmission.count({
      where: { marketId: resolution.marketId, kind: "challenge_evidence" }
    });
    if (challengeCount > 0) {
      await db.marketResolution.update({ where: { id: resolution.id }, data: { status: "evidence_review", verificationStatus: "challenged" } });
      await db.market.update({ where: { id: resolution.marketId }, data: { status: "disputed", settlementStatus: "evidence_review", resolutionState: "evidence_review" } });
      await ensureProofFlowReviewPanel(db, resolution.marketId);
      results.push({ action: "proof_flow_finalize", marketId: resolution.marketId, ok: true, status: "evidence_review" });
      continue;
    }
    const settled = await finalizeProofFlowMarket({
      marketId: resolution.marketId,
      outcome: resolution.proposedOutcome as ProofFlowOutcome,
      reason: "No valid challenge was submitted before the ProofFlow challenge window closed.",
      force: true
    });
    results.push({ action: "proof_flow_finalize", marketId: resolution.marketId, ok: true, status: settled?.settlementStatus ?? "finalized" });
  }
  return results;
}

function needsEvidenceDeadlineFor(input: { challengeWindowEndsAt?: Date | null; verifiedAt?: Date | null; updatedAt: Date; createdAt: Date }) {
  if (input.challengeWindowEndsAt) return input.challengeWindowEndsAt;
  return needsEvidenceWindowEnd(input.verifiedAt ?? input.updatedAt ?? input.createdAt);
}

function isExternalEvidenceSubmission(input: { kind: string; outcome?: string | null; evidenceText?: string | null; evidenceUrl?: string | null; sourceUrl?: string | null }) {
  if (input.kind === "audit_review_request" || input.kind === "system_proposal") return false;
  return Boolean(input.outcome || input.evidenceText?.trim() || input.evidenceUrl?.trim() || input.sourceUrl?.trim());
}

export async function processNeedsEvidenceProofFlowMarkets(input: { limit?: number } = {}) {
  const db = requireDatabase();
  const resolutions = await db.marketResolution.findMany({
    where: {
      status: "evidence_review",
      verificationStatus: "needs_evidence",
      proposedOutcome: null,
      finalOutcome: null
    },
    orderBy: [{ challengeWindowEndsAt: "asc" }, { updatedAt: "asc" }],
    take: input.limit ?? 10
  });
  const results = [];
  for (const resolution of resolutions) {
    try {
      const deadline = needsEvidenceDeadlineFor(resolution);
      if (!resolution.challengeWindowEndsAt) {
        await db.marketResolution.update({ where: { id: resolution.id }, data: { challengeWindowEndsAt: deadline } });
        await db.market.updateMany({ where: { id: resolution.marketId }, data: { challengeWindowEndsAt: deadline } });
      }
      const existingPanel = await activeReviewPanel(db, resolution.marketId);
      if (existingPanel) {
        results.push({ action: "proof_flow_needs_evidence", marketId: resolution.marketId, ok: true, status: "review_panel_already_open", panelId: existingPanel.id });
        continue;
      }
      const submissions = await db.proofFlowEvidenceSubmission.findMany({
        where: { marketId: resolution.marketId },
        orderBy: { createdAt: "asc" }
      });
      const externalEvidence = submissions.filter(isExternalEvidenceSubmission);
      if (externalEvidence.length > 0) {
        const panel = await ensureProofFlowReviewPanel(db, resolution.marketId);
        await db.marketResolution.update({
          where: { id: resolution.id },
          data: {
            verificationStatus: "review_open",
            challengeWindowEndsAt: deadline,
            lastError: null
          }
        });
        await db.market.update({
          where: { id: resolution.marketId },
          data: {
            status: "disputed",
            settlementStatus: "evidence_review",
            resolutionState: "evidence_review",
            challengeWindowEndsAt: deadline
          }
        });
        await db.proofFlowAuditEvent.create({
          data: {
            marketId: resolution.marketId,
            resolutionId: resolution.id,
            action: "needs_evidence_review_panel_opened",
            fromStatus: "evidence_review",
            toStatus: "evidence_review",
            metadata: jsonInput({ panelId: panel.id, evidenceCount: externalEvidence.length, evidenceDeadline: deadline.toISOString() })
          }
        });
        results.push({ action: "proof_flow_needs_evidence", marketId: resolution.marketId, ok: true, status: "review_panel_opened", panelId: panel.id });
        continue;
      }
      if (deadline <= new Date()) {
        await finalizeProofFlowMarket({
          marketId: resolution.marketId,
          outcome: "invalid",
          reason: "No reliable evidence was submitted before the evidence deadline. ProofFlow could not verify the locked source or backup source.",
          evidenceText: "Truth could not be proven from the locked source, backup source, or public evidence. The market resolves INVALID / REFUND.",
          force: true
        });
        results.push({ action: "proof_flow_needs_evidence", marketId: resolution.marketId, ok: true, status: "finalized_invalid_no_evidence" });
        continue;
      }
      results.push({ action: "proof_flow_needs_evidence", marketId: resolution.marketId, ok: true, status: "waiting_for_evidence", evidenceDeadline: deadline.toISOString() });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown needs-evidence ProofFlow error.";
      await db.proofFlowAuditEvent.create({
        data: {
          marketId: resolution.marketId,
          resolutionId: resolution.id,
          action: "needs_evidence_processing_error",
          metadata: jsonInput({ detail })
        }
      });
      results.push({ action: "proof_flow_needs_evidence", marketId: resolution.marketId, ok: false, status: "error", detail });
    }
  }
  return results;
}

export async function processOpenProofFlowReviews(input: { limit?: number } = {}) {
  const db = requireDatabase();
  const panels = await db.proofFlowReviewPanel.findMany({
    where: {
      status: { in: ["open", "review_ready", "additional_review_open"] },
      OR: [
        { reviewDeadline: { lte: new Date() } },
        { revealDeadline: { lte: new Date() } }
      ]
    },
    orderBy: [{ round: "asc" }, { revealDeadline: "asc" }],
    take: input.limit ?? 10
  });
  const results = [];
  for (const panel of panels) {
    try {
      const result = await evaluateProofFlowReviewPanel(db, panel.id);
      results.push({
        action: "proof_flow_review",
        marketId: panel.marketId,
        ok: true,
        status: result?.status ?? "waiting",
        panelId: panel.id,
        round: panel.round
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown ProofFlow review error.";
      await db.proofFlowAuditEvent.create({
        data: {
          marketId: panel.marketId,
          resolutionId: panel.resolutionId ?? undefined,
          action: "proof_flow_review_error",
          metadata: jsonInput({ panelId: panel.id, detail })
        }
      });
      results.push({
        action: "proof_flow_review",
        marketId: panel.marketId,
        ok: false,
        status: "error",
        panelId: panel.id,
        round: panel.round,
        detail
      });
    }
  }
  return results;
}

export async function closeExpiredProofFlowMarkets(input: { limit?: number } = {}) {
  const db = requireDatabase();
  const markets = await db.market.findMany({
    where: {
      origin: "native",
      closeTime: { lte: new Date() },
      status: { in: ["trading_live", "live_pending_open"] }
    },
    orderBy: { closeTime: "asc" },
    take: input.limit ?? 10
  });
  const results = [];
  for (const market of markets) {
    const toStatus = market.status === "live_pending_open" ? "draft" : "closed";
    await db.market.update({
      where: { id: market.id },
      data: {
        status: market.status === "live_pending_open" ? "cancelled_before_trading" : "closed",
        settlementStatus: toStatus,
        resolutionState: toStatus
      }
    });
    await db.proofFlowAuditEvent.create({
      data: {
        marketId: market.id,
        action: "close_market",
        fromStatus: market.settlementStatus,
        toStatus,
        metadata: jsonInput({ closeTime: market.closeTime?.toISOString() ?? null })
      }
    });
    results.push({ action: "close_market", marketId: market.id, ok: true, status: toStatus });
  }
  return results;
}
