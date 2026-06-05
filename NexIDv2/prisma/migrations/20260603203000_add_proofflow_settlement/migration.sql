CREATE TYPE "ProofFlowSettlementStatus" AS ENUM (
  'draft',
  'live',
  'closed',
  'provisional',
  'challenge_open',
  'evidence_review',
  'finalized_yes',
  'finalized_no',
  'finalized_invalid',
  'refunded'
);

ALTER TABLE "Market" ADD COLUMN "resolutionCard" JSONB;
ALTER TABLE "Market" ADD COLUMN "settlementMode" TEXT;
ALTER TABLE "Market" ADD COLUMN "backupSourceUrl" TEXT;
ALTER TABLE "Market" ADD COLUMN "yesRule" TEXT;
ALTER TABLE "Market" ADD COLUMN "noRule" TEXT;
ALTER TABLE "Market" ADD COLUMN "invalidRule" TEXT;
ALTER TABLE "Market" ADD COLUMN "challengeWindowSeconds" INTEGER NOT NULL DEFAULT 86400;
ALTER TABLE "Market" ADD COLUMN "challengeWindowEndsAt" TIMESTAMP(3);
ALTER TABLE "Market" ADD COLUMN "settlementStatus" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "Market" ADD COLUMN "provisionalOutcome" "NativeOutcomeSide";
ALTER TABLE "Market" ADD COLUMN "finalOutcome" "NativeOutcomeSide";
ALTER TABLE "Market" ADD COLUMN "auditSummary" TEXT;
ALTER TABLE "Market" ADD COLUMN "finalResolutionNote" JSONB;
ALTER TABLE "Market" ADD COLUMN "bondAmount" DOUBLE PRECISION;
ALTER TABLE "Market" ADD COLUMN "proposerBondStatus" TEXT;
ALTER TABLE "Market" ADD COLUMN "challengerBondStatus" TEXT;
ALTER TABLE "Market" ADD COLUMN "refundStatus" TEXT;

ALTER TABLE "MarketResolution" ADD COLUMN "settlementMode" TEXT;
ALTER TABLE "MarketResolution" ADD COLUMN "challengeWindowEndsAt" TIMESTAMP(3);
ALTER TABLE "MarketResolution" ADD COLUMN "bondAmount" DOUBLE PRECISION;
ALTER TABLE "MarketResolution" ADD COLUMN "proposerBondStatus" TEXT;
ALTER TABLE "MarketResolution" ADD COLUMN "challengerBondStatus" TEXT;
ALTER TABLE "MarketResolution" ADD COLUMN "refundStatus" TEXT;
ALTER TABLE "MarketResolution" ADD COLUMN "auditSummary" TEXT;
ALTER TABLE "MarketResolution" ADD COLUMN "finalResolutionNote" JSONB;

CREATE TABLE "ProofFlowEvidenceSubmission" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "resolutionId" TEXT,
  "kind" TEXT NOT NULL,
  "outcome" "NativeOutcomeSide",
  "walletAddress" TEXT,
  "evidenceUrl" TEXT,
  "evidenceText" TEXT,
  "sourceUrl" TEXT,
  "bondAmount" DOUBLE PRECISION,
  "bondStatus" TEXT NOT NULL DEFAULT 'not_required',
  "auditSummary" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProofFlowEvidenceSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProofFlowReviewerNote" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "resolutionId" TEXT,
  "reviewerWallet" TEXT,
  "recommendedOutcome" "NativeOutcomeSide",
  "note" TEXT NOT NULL,
  "reputationDelta" INTEGER NOT NULL DEFAULT 0,
  "rewardUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProofFlowReviewerNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProofFlowSettlementReceipt" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "resolutionId" TEXT,
  "finalOutcome" "NativeOutcomeSide",
  "settlementStatus" TEXT NOT NULL,
  "sourceUsed" TEXT,
  "bondMovement" JSONB,
  "refundStatus" TEXT NOT NULL DEFAULT 'not_required',
  "finalizedAt" TIMESTAMP(3),
  "note" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProofFlowSettlementReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProofFlowAuditEvent" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "resolutionId" TEXT,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "actorWallet" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProofFlowAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Market_settlementStatus_challengeWindowEndsAt_idx" ON "Market"("settlementStatus", "challengeWindowEndsAt");
CREATE INDEX "MarketResolution_settlementMode_status_idx" ON "MarketResolution"("settlementMode", "status");
CREATE INDEX "ProofFlowEvidenceSubmission_marketId_kind_createdAt_idx" ON "ProofFlowEvidenceSubmission"("marketId", "kind", "createdAt");
CREATE INDEX "ProofFlowEvidenceSubmission_resolutionId_idx" ON "ProofFlowEvidenceSubmission"("resolutionId");
CREATE INDEX "ProofFlowEvidenceSubmission_walletAddress_createdAt_idx" ON "ProofFlowEvidenceSubmission"("walletAddress", "createdAt");
CREATE INDEX "ProofFlowReviewerNote_marketId_createdAt_idx" ON "ProofFlowReviewerNote"("marketId", "createdAt");
CREATE INDEX "ProofFlowReviewerNote_resolutionId_idx" ON "ProofFlowReviewerNote"("resolutionId");
CREATE INDEX "ProofFlowReviewerNote_reviewerWallet_createdAt_idx" ON "ProofFlowReviewerNote"("reviewerWallet", "createdAt");
CREATE INDEX "ProofFlowSettlementReceipt_marketId_createdAt_idx" ON "ProofFlowSettlementReceipt"("marketId", "createdAt");
CREATE INDEX "ProofFlowSettlementReceipt_resolutionId_idx" ON "ProofFlowSettlementReceipt"("resolutionId");
CREATE INDEX "ProofFlowAuditEvent_marketId_createdAt_idx" ON "ProofFlowAuditEvent"("marketId", "createdAt");
CREATE INDEX "ProofFlowAuditEvent_action_createdAt_idx" ON "ProofFlowAuditEvent"("action", "createdAt");

UPDATE "Market"
SET "settlementStatus" = CASE
  WHEN "status" IN ('live_pending_open', 'trading_live') THEN 'live'
  WHEN "status" = 'closed' THEN 'closed'
  WHEN "status" = 'result_proposed' THEN 'challenge_open'
  WHEN "status" = 'disputed' THEN 'evidence_review'
  WHEN "status" = 'settled' AND "resolutionState" = 'invalid_refund' THEN 'finalized_invalid'
  WHEN "status" = 'settled' THEN 'finalized_yes'
  WHEN "status" = 'invalid_refund' THEN 'refunded'
  ELSE 'draft'
END
WHERE "origin" = 'native';

UPDATE "MarketResolution"
SET "settlementMode" = CASE
  WHEN "resolutionMode" = 'uma_oov3' THEN 'legacy_uma_readonly'
  ELSE "resolutionMode"
END
WHERE "settlementMode" IS NULL;

WITH latest_resolution AS (
  SELECT DISTINCT ON ("marketId")
    "marketId",
    "proposedOutcome",
    "finalOutcome",
    "status",
    "challengeWindowEndsAt",
    "bondAmount",
    "proposerBondStatus",
    "challengerBondStatus",
    "refundStatus",
    "auditSummary",
    "finalResolutionNote"
  FROM "MarketResolution"
  ORDER BY "marketId", "updatedAt" DESC
)
UPDATE "Market" market
SET
  "provisionalOutcome" = COALESCE(latest_resolution."proposedOutcome", market."provisionalOutcome"),
  "finalOutcome" = COALESCE(latest_resolution."finalOutcome", market."finalOutcome"),
  "challengeWindowEndsAt" = COALESCE(latest_resolution."challengeWindowEndsAt", market."challengeWindowEndsAt"),
  "bondAmount" = COALESCE(latest_resolution."bondAmount", market."bondAmount"),
  "proposerBondStatus" = COALESCE(latest_resolution."proposerBondStatus", market."proposerBondStatus"),
  "challengerBondStatus" = COALESCE(latest_resolution."challengerBondStatus", market."challengerBondStatus"),
  "refundStatus" = COALESCE(latest_resolution."refundStatus", market."refundStatus"),
  "auditSummary" = COALESCE(latest_resolution."auditSummary", market."auditSummary"),
  "finalResolutionNote" = COALESCE(latest_resolution."finalResolutionNote", market."finalResolutionNote"),
  "settlementStatus" = CASE
    WHEN latest_resolution."finalOutcome" = 'ride' THEN 'finalized_yes'
    WHEN latest_resolution."finalOutcome" = 'fade' THEN 'finalized_no'
    WHEN latest_resolution."finalOutcome" = 'invalid' THEN 'finalized_invalid'
    WHEN latest_resolution."status" = 'challenge_open' THEN 'challenge_open'
    WHEN latest_resolution."status" = 'evidence_review' THEN 'evidence_review'
    ELSE market."settlementStatus"
  END
FROM latest_resolution
WHERE market."id" = latest_resolution."marketId"
  AND market."origin" = 'native';
