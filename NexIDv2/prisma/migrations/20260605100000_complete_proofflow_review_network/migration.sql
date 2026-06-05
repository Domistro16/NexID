ALTER TABLE "ProofFlowReviewAssignment"
  ADD COLUMN IF NOT EXISTS "noteNonce" TEXT,
  ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "commitTimestamp" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revealTimestamp" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ProofFlowReviewAssignment_panelId_commitTimestamp_idx"
  ON "ProofFlowReviewAssignment"("panelId", "commitTimestamp");

ALTER TABLE "ProofFlowSettlementReceipt"
  ADD COLUMN IF NOT EXISTS "receiptHash" TEXT,
  ADD COLUMN IF NOT EXISTS "hashStatus" TEXT NOT NULL DEFAULT 'PENDING_HASH';

CREATE TABLE IF NOT EXISTS "ProofFlowReviewerConflictReport" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "resolutionId" TEXT,
  "panelId" TEXT,
  "assignmentId" TEXT,
  "reviewerWallet" TEXT,
  "reporterUserId" TEXT,
  "reporterWallet" TEXT,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "moderatorWallet" TEXT,
  "moderationNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProofFlowReviewerConflictReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProofFlowReviewerConflictReport_marketId_status_idx"
  ON "ProofFlowReviewerConflictReport"("marketId", "status");
CREATE INDEX IF NOT EXISTS "ProofFlowReviewerConflictReport_panelId_status_idx"
  ON "ProofFlowReviewerConflictReport"("panelId", "status");
CREATE INDEX IF NOT EXISTS "ProofFlowReviewerConflictReport_reviewerWallet_status_idx"
  ON "ProofFlowReviewerConflictReport"("reviewerWallet", "status");
CREATE INDEX IF NOT EXISTS "ProofFlowReviewerConflictReport_createdAt_idx"
  ON "ProofFlowReviewerConflictReport"("createdAt");

CREATE TABLE IF NOT EXISTS "ProofFlowRefundQueue" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "resolutionId" TEXT,
  "receiptId" TEXT,
  "recipientWallet" TEXT NOT NULL,
  "amountUsdc" DOUBLE PRECISION NOT NULL,
  "refundType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "txHash" TEXT,
  "failureReason" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "processedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProofFlowRefundQueue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProofFlowRefundQueue_marketId_status_idx"
  ON "ProofFlowRefundQueue"("marketId", "status");
CREATE INDEX IF NOT EXISTS "ProofFlowRefundQueue_recipientWallet_status_idx"
  ON "ProofFlowRefundQueue"("recipientWallet", "status");
CREATE INDEX IF NOT EXISTS "ProofFlowRefundQueue_status_createdAt_idx"
  ON "ProofFlowRefundQueue"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "ProofFlowReviewerReputationLedger" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "resolutionId" TEXT,
  "panelId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "reviewerWallet" TEXT NOT NULL,
  "delta" INTEGER NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "confirmedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProofFlowReviewerReputationLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProofFlowReviewerReputationLedger_marketId_status_idx"
  ON "ProofFlowReviewerReputationLedger"("marketId", "status");
CREATE INDEX IF NOT EXISTS "ProofFlowReviewerReputationLedger_panelId_status_idx"
  ON "ProofFlowReviewerReputationLedger"("panelId", "status");
CREATE INDEX IF NOT EXISTS "ProofFlowReviewerReputationLedger_reviewerWallet_status_idx"
  ON "ProofFlowReviewerReputationLedger"("reviewerWallet", "status");

CREATE TABLE IF NOT EXISTS "ProofFlowReceiptHashJob" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_HASH',
  "receiptHash" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "failureReason" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProofFlowReceiptHashJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProofFlowReceiptHashJob_receiptId_key"
  ON "ProofFlowReceiptHashJob"("receiptId");
CREATE INDEX IF NOT EXISTS "ProofFlowReceiptHashJob_marketId_status_idx"
  ON "ProofFlowReceiptHashJob"("marketId", "status");
CREATE INDEX IF NOT EXISTS "ProofFlowReceiptHashJob_status_createdAt_idx"
  ON "ProofFlowReceiptHashJob"("status", "createdAt");
