import { z } from "zod";

export const sideSchema = z.enum(["ride", "fade"]);
export const orderTypeSchema = z.enum(["market", "limit"]);
const polymarketPriceSchema = z.coerce.number().min(0.001).max(0.999);

export const orderPreviewSchema = z.object({
  narrativeId: z.string().min(1),
  side: sideSchema.default("fade"),
  orderType: orderTypeSchema.default("market"),
  amount: z.coerce.number().positive(),
  limitPrice: polymarketPriceSchema.optional()
});

export const orderPlaceSchema = orderPreviewSchema.extend({
  entryPrice: polymarketPriceSchema.optional(),
  walletAddress: z.string().optional()
});

export const userSignedOrderRecordSchema = orderPlaceSchema.extend({
  marketId: z.string().max(160).nullable().optional(),
  outcomeToken: z.string().min(1).max(180),
  executionId: z.string().min(1).max(180),
  builderCode: z.string().min(1).max(180),
  polymarketFunderAddress: z.string().min(1).max(80),
  polymarketSignatureType: z.coerce.number().int().min(0).max(3),
  fillStatus: z.string().max(120).optional(),
  executionStatus: z.enum(["pending", "live", "partial_fill", "filled", "failed"]).default("pending"),
  raw: z.record(z.string(), z.unknown()).optional()
});

export const userSignedPositionSyncSchema = z.object({
  executionId: z.string().min(1).max(180),
  walletAddress: z.string().min(1).max(80).optional(),
  outcomeToken: z.string().min(1).max(180).nullable().optional(),
  status: z.enum(["pending", "live", "partial_fill", "filled", "closed", "resolved", "failed"]),
  fillStatus: z.string().max(120).optional(),
  exitPrice: z.number().min(0).max(1).nullable().optional(),
  settlementPrice: z.number().min(0).max(1).nullable().optional(),
  averagePrice: z.number().min(0).max(1).nullable().optional(),
  filledSize: z.number().nonnegative().nullable().optional(),
  originalSize: z.number().nonnegative().nullable().optional(),
  settledAt: z.string().datetime().nullable().optional(),
  raw: z.record(z.string(), z.unknown()).optional()
});

export const receiptCreateSchema = z.object({
  narrativeId: z.string().optional(),
  narrativeName: z.string().optional(),
  side: sideSchema.default("fade"),
  identity: z.string().default("wallet"),
  amount: z.coerce.number().positive().default(25),
  entryPrice: polymarketPriceSchema.optional()
});

export const receiptPostSchema = z.object({
  positionId: z.string().min(1),
  identity: z.string().max(120).optional()
});

export const idNameSchema = z.object({
  name: z.string().min(1).max(24).regex(/^[a-zA-Z0-9-]+$/),
  payMethod: z.string().optional(),
  txHash: z.string().optional(),
  checkoutReferenceId: z.string().max(180).optional(),
  referralCode: z.string().max(32).optional()
});

export const walletAuthSchema = z.object({
  walletAddress: z.string().min(1),
  displayName: z.string().max(120).optional(),
  primaryDomainName: z.string().max(120).optional()
});

export const walletNonceSchema = z.object({
  walletAddress: z.string().min(1)
});

export const walletVerifySchema = z.object({
  walletAddress: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().min(1),
  displayName: z.string().max(120).optional(),
  primaryDomainName: z.string().max(120).optional()
});

export const analyticsEventSchema = z.object({
  name: z.string().min(1).max(96),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const cardRenderSchema = z.object({
  type: z.enum(["position", "receipt", "settled", "board", "passport", "points"]).default("receipt"),
  title: z.string().max(120).optional(),
  payload: z.record(z.string(), z.unknown()).optional()
});

export const marketArenaSchema = z.enum(["crypto", "football", "culture"]);
export const marketTemplateSchema = z.enum([
  "token_price_threshold",
  "token_basket_race",
  "official_announcement",
  "sports_result",
  "sports_transfer",
  "chart_rank",
  "award_outcome",
  "public_release",
  "custom_objective"
]);

export const shapeMarketSchema = z.object({
  rawThesis: z.string().min(4).max(280),
  arenaHint: marketArenaSchema.optional(),
  locale: z.string().max(12).optional(),
  walletAddress: z.string().max(80).optional()
});

export const shapedMarketDraftSchema = z.object({
  rawThesis: z.string().min(4).max(280),
  title: z.string().min(4).max(80),
  question: z.string().min(4).max(220),
  arena: marketArenaSchema,
  template: marketTemplateSchema,
  entities: z.array(z.string().min(1).max(80)).default([]),
  timeframe: z.union([
    z.object({
      startAt: z.string().datetime(),
      closeAt: z.string().datetime(),
      timezone: z.string().min(1).max(80),
      label: z.string().min(1).max(120)
    }),
    z.string().max(120).transform((label) => ({
      startAt: new Date().toISOString(),
      closeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      timezone: "UTC",
      label
    }))
  ]).nullable().default(null),
  settlementSource: z.string().max(220).nullable().default(null),
  resolution: z.object({
    sourceType: z.enum(["oracle", "api", "official_announcement", "official_score", "official_chart", "manual_optimistic"]),
    sourceName: z.string().min(1).max(160),
    sourceUrl: z.string().max(500).nullable(),
    method: z.string().min(8).max(600),
    fallback: z.string().min(8).max(400)
  }),
  sides: z.object({
    ride: z.string().min(3).max(220),
    fade: z.string().min(3).max(220)
  }),
  launch: z.object({
    stakeUsdc: z.literal(20),
    nonRefundableFeeUsdc: z.literal(10),
    refundableQualityBondUsdc: z.literal(10)
  }),
  risk: z.object({
    status: z.enum(["allowed", "ambiguous_refine", "blocked"]),
    reasons: z.array(z.string().min(1).max(220)).default([]),
    requiredUserEdits: z.array(z.string().min(1).max(80)).default([])
  }),
  riskStatus: z.enum(["allowed", "ambiguous_refine", "blocked"]),
  missingFields: z.array(z.string().min(1).max(80)).default([]),
  blockedReason: z.string().max(220).nullable().default(null),
  duplicateCheck: z.object({
    status: z.enum(["pending", "no_match", "exact_polymarket", "exact_native", "related_polymarket", "related_native"]),
    matches: z.array(z.object({
      source: z.enum(["polymarket", "nex_native"]),
      id: z.string().min(1).max(180),
      title: z.string().min(1).max(220),
      similarity: z.number().min(0).max(1),
      action: z.enum(["trade_existing", "join_existing", "launch_variant", "block_duplicate"])
    })).default([])
  }).optional()
});

export const routeCheckSchema = z.object({
  draftId: z.string().optional(),
  draft: shapedMarketDraftSchema
});

export const nexmindTrendingRunSchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
  force: z.coerce.boolean().default(false)
});

export const nexmindSourceHealthRunSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  force: z.coerce.boolean().default(false)
});

export const nexmindNotificationRunSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  force: z.coerce.boolean().default(false)
});

export const nexmindSourceCheckSchema = z.object({
  marketId: z.string().max(120).optional(),
  title: z.string().min(1).max(220).default("External source check"),
  sourceUrl: z.string().url(),
  fallbackSourceUrl: z.string().url().nullable().optional()
});

export const agentMarketDraftSchema = z.object({
  rawThesis: z.string().min(4).max(280),
  arenaHint: marketArenaSchema.optional()
});

export const agentMarketRouteSchema = z.object({
  draft: shapedMarketDraftSchema
});

export const agentMarketCreateSchema = z.object({
  draft: shapedMarketDraftSchema,
  chainId: z.coerce.number().int().optional(),
  forceCreate: z.coerce.boolean().default(false)
});

export const internalAgentApiKeyCreateSchema = z.object({
  name: z.string().min(2).max(120),
  walletAddress: z.string().max(80).optional(),
  identity: z.string().max(120).optional(),
  userId: z.string().max(120).optional(),
  scopes: z.array(z.string().min(1).max(40)).default(["draft", "route"]),
  monthlyLimitUsd: z.coerce.number().positive().optional()
});

export const notificationPreferenceSchema = z.object({
  walletAddress: z.string().max(80).optional(),
  email: z.string().email().optional(),
  telegramHandle: z.string().min(2).max(80).regex(/^@?[a-zA-Z0-9_]{2,80}$/).optional(),
  telegramChatId: z.string().max(80).optional(),
  channels: z.array(z.enum(["dashboard", "telegram", "email"])).default(["dashboard", "telegram"])
});

export const nativeMarketCreateSchema = z.object({
  draftId: z.string().min(1),
  walletAddress: z.string().min(1).max(80),
  chainId: z.coerce.number().int(),
  rulesHash: z.string().min(1).max(120).optional(),
  metadataHash: z.string().min(1).max(120).optional(),
  template: marketTemplateSchema.optional(),
  closeTime: z.coerce.number().int().optional()
});

export const nativeMarketTradeSchema = z.object({
  side: z.enum(["ride", "fade"]),
  amount: z.coerce.number().positive(),
  slippageBps: z.coerce.number().int().min(0).max(5000).default(300),
  walletAddress: z.string().min(1).max(80),
  chainId: z.coerce.number().int(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional()
});

export const polymarketRouteOrderRecordSchema = z.object({
  side: z.enum(["ride", "fade"]),
  orderType: orderTypeSchema.default("market"),
  amount: z.coerce.number().positive(),
  entryPrice: polymarketPriceSchema,
  walletAddress: z.string().min(1).max(80),
  outcomeToken: z.string().min(1).max(180),
  executionId: z.string().min(1).max(180),
  builderCode: z.string().min(1).max(180),
  polymarketFunderAddress: z.string().min(1).max(80),
  polymarketSignatureType: z.coerce.number().int().min(0).max(3),
  fillStatus: z.string().max(120).optional(),
  executionStatus: z.enum(["pending", "live", "partial_fill", "filled", "failed"]).default("pending"),
  raw: z.record(z.string(), z.unknown()).optional()
});

export const telegramAlertConnectSchema = z.object({
  telegramHandle: z.string().min(2).max(80).regex(/^@?[a-zA-Z0-9_]{2,80}$/).optional(),
  walletAddress: z.string().max(80).optional()
});

export const internalNarrativeUpdateSchema = z.object({
  quality: z.enum(["Strong", "Hot", "Clean", "Mixed"]).optional(),
  tradable: z.boolean().optional(),
  fallbackReason: z.string().max(160).nullable().optional(),
  bestMarketId: z.string().max(120).nullable().optional()
});

const csvList = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}, z.array(z.string()).default([]));

const chartList = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item));
}, z.array(z.number()).min(2).default([35, 40, 45, 50, 55, 60]));

export const internalNarrativeCreateSchema = z.object({
  id: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(120),
  tag: z.string().min(2).max(80),
  summary: z.string().min(8).max(240),
  heat: z.coerce.number().int().min(0).max(100),
  move7d: z.coerce.number().int().min(-100).max(100),
  quality: z.enum(["Strong", "Hot", "Clean", "Mixed"]).default("Strong"),
  liquidity: z.coerce.number().nonnegative(),
  spread: z.coerce.number().nonnegative(),
  volume: z.coerce.number().nonnegative(),
  riders: z.coerce.number().int().nonnegative().default(0),
  faders: z.coerce.number().int().nonnegative().default(0),
  expiry: z.string().min(1).max(40),
  top: z.string().min(1).max(32).default("+0%"),
  ridePrice: z.coerce.number().min(0.01).max(0.99),
  fadePrice: z.coerce.number().min(0.01).max(0.99),
  chart: chartList,
  comments: csvList,
  rules: csvList,
  tradable: z.coerce.boolean().default(true),
  fallbackReason: z.string().max(160).nullable().optional(),
  bestMarketId: z.string().max(120).nullable().optional()
});

export const internalReferralUpdateSchema = z.object({
  status: z.enum(["pending", "approved", "paid", "blocked"]).optional(),
  riskFlag: z.string().max(120).nullable().optional()
});

export const internalReceiptUpdateSchema = z.object({
  status: z.enum(["draft", "ready", "disputed", "archived"]).optional(),
  proofLevel: z.string().max(80).optional()
});

export const internalPointsAdjustSchema = z.object({
  userId: z.string().min(1),
  points: z.coerce.number().int(),
  reason: z.string().min(1).max(120)
});

export const internalRewardAllocationUpdateSchema = z.object({
  status: z.enum(["pending", "review", "approved", "locked_id_required", "paid", "blocked"]),
  txHash: z.string().max(180).optional(),
  note: z.string().max(240).optional()
});

export const claimablePayoutRequestSchema = z.object({
  amountUsd: z.coerce.number().positive().optional(),
  destination: z.string().max(80).optional(),
  referenceId: z.string().max(180).optional(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional()
});

export const internalClaimablePayoutUpdateSchema = z.object({
  status: z.enum(["paid", "released"]),
  txHash: z.string().max(180).optional()
});

export const internalPositionSettleSchema = z.object({
  settlementPrice: z.coerce.number().min(0).max(1),
  source: z.string().max(120).optional()
});

export const nativeResolutionQueueSchema = z.object({
  marketId: z.string().min(1),
  outcome: z.enum(["ride", "fade", "invalid"]),
  claim: z.string().min(32).max(2000),
  proposerWallet: z.string().max(80).optional()
});

export const proofFlowOutcomeSchema = z.enum(["ride", "fade", "invalid"]);

export const proofFlowEvidenceSchema = z.object({
  marketId: z.string().min(1).optional(),
  outcome: proofFlowOutcomeSchema.optional(),
  walletAddress: z.string().max(80).optional(),
  evidenceText: z.string().max(4000).optional(),
  evidenceUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  evidenceTimestamp: z.string().max(120).optional(),
  bondTxHash: z.string().max(180).optional(),
  reason: z.string().max(1200).optional(),
  kind: z.string().max(80).optional()
});

export const proofFlowProvisionalSchema = proofFlowEvidenceSchema.extend({
  outcome: proofFlowOutcomeSchema,
  force: z.coerce.boolean().default(false)
});

export const proofFlowChallengeSchema = proofFlowEvidenceSchema.extend({
  outcome: proofFlowOutcomeSchema
});

export const proofFlowReviewerNoteSchema = proofFlowEvidenceSchema.extend({
  noteHash: z.string().regex(/^(0x)?[a-fA-F0-9]{64}$/),
  outcome: proofFlowOutcomeSchema,
  confidence: z.coerce.number().min(0).max(1).optional()
});

export const proofFlowReviewerRevealSchema = proofFlowEvidenceSchema.extend({
  note: z.string().min(8).max(4000),
  nonce: z.string().min(8).max(256),
  outcome: proofFlowOutcomeSchema
});

export const proofFlowFinalizeSchema = proofFlowEvidenceSchema.extend({
  outcome: proofFlowOutcomeSchema.optional(),
  force: z.coerce.boolean().default(false)
});

export const nativeResolutionVerifySchema = z.object({
  marketId: z.string().min(1),
  autoQueue: z.coerce.boolean().default(false),
  force: z.coerce.boolean().default(false)
});

export const nativeResolutionApproveSchema = z.object({
  marketId: z.string().min(1),
  proposerWallet: z.string().max(80).optional(),
  outcome: proofFlowOutcomeSchema.optional(),
  evidenceText: z.string().max(4000).optional(),
  sourceUrl: z.string().url().optional()
});

export const nativeResolutionBotRunSchema = z.object({
  chainId: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  force: z.coerce.boolean().default(false),
  sync: z.coerce.boolean().default(false),
  strict: z.coerce.boolean().default(false)
});

export const proofFlowReviewRunSchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(10)
});

export const proofFlowConflictReasonSchema = z.enum([
  "reviewer_holds_position",
  "reviewer_related_to_proposer",
  "reviewer_related_to_challenger",
  "reviewer_related_to_creator",
  "undisclosed_relationship",
  "other"
]);

export const proofFlowConflictReportSchema = z.object({
  reviewerWallet: z.string().max(80).optional(),
  panelId: z.string().max(120).optional(),
  assignmentId: z.string().max(120).optional(),
  reason: proofFlowConflictReasonSchema,
  details: z.string().max(1200).optional()
});

export const proofFlowConflictReviewSchema = z.object({
  reportId: z.string().min(1),
  action: z.enum(["confirm", "dismiss"]),
  moderatorWallet: z.string().max(80).optional(),
  moderationNote: z.string().max(1200).optional()
});

export const proofFlowQueueRunSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

export function cleanIdName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
}

export function jsonError(error: unknown) {
  if (error instanceof z.ZodError) {
    return { error: "Invalid request", issues: error.issues };
  }
  if (error instanceof Error) {
    const data = (error as Error & { data?: unknown }).data;
    const detail = errorDetail(data);
    return {
      error: detail && !error.message.includes(detail) ? `${error.message}: ${detail}` : error.message,
      ...(detail ? { detail } : {})
    };
  }
  return { error: "Unexpected error" };
}

function errorDetail(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const value = record.error ?? record.errorMsg ?? record.message;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}
