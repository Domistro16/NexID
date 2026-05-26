import { z } from "zod";

export const sideSchema = z.enum(["ride", "fade"]);
export const orderTypeSchema = z.enum(["market", "limit"]);

export const orderPreviewSchema = z.object({
  narrativeId: z.string().min(1),
  side: sideSchema.default("fade"),
  orderType: orderTypeSchema.default("market"),
  amount: z.coerce.number().positive(),
  limitPrice: z.coerce.number().min(0.01).max(0.99).optional()
});

export const orderPlaceSchema = orderPreviewSchema.extend({
  entryPrice: z.coerce.number().min(0.01).max(0.99).optional(),
  walletAddress: z.string().optional()
});

export const userSignedOrderRecordSchema = orderPlaceSchema.extend({
  marketId: z.string().max(160).nullable().optional(),
  outcomeToken: z.string().min(1).max(160),
  executionId: z.string().min(1).max(180),
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
  entryPrice: z.coerce.number().min(0.01).max(0.99).optional()
});

export const idNameSchema = z.object({
  name: z.string().min(1).max(24).regex(/^[a-zA-Z0-9-]+$/),
  payMethod: z.string().optional(),
  txHash: z.string().optional(),
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
  status: z.enum(["pending", "review", "approved", "paid", "blocked"]),
  txHash: z.string().max(180).optional(),
  note: z.string().max(240).optional()
});

export const internalPositionSettleSchema = z.object({
  settlementPrice: z.coerce.number().min(0).max(1),
  source: z.string().max(120).optional()
});

export function cleanIdName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
}

export function jsonError(error: unknown) {
  if (error instanceof z.ZodError) {
    return { error: "Invalid request", issues: error.issues };
  }
  return { error: error instanceof Error ? error.message : "Unexpected error" };
}
