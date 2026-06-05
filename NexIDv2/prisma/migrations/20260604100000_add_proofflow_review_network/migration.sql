ALTER TYPE "ProofFlowSettlementStatus" ADD VALUE IF NOT EXISTS 'additional_review';

CREATE TABLE "ProofFlowReviewPanel" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "resolutionId" TEXT,
  "round" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "reason" TEXT,
  "trigger" TEXT,
  "reviewDeadline" TIMESTAMP(3) NOT NULL,
  "revealDeadline" TIMESTAMP(3) NOT NULL,
  "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "auditSummary" TEXT,
  "auditFlags" JSONB,
  "auditClean" BOOLEAN,
  "consensusOutcome" "NativeOutcomeSide",
  "agreementCount" INTEGER NOT NULL DEFAULT 0,
  "notesSubmitted" INTEGER NOT NULL DEFAULT 0,
  "revealsCompleted" INTEGER NOT NULL DEFAULT 0,
  "missedRevealCount" INTEGER NOT NULL DEFAULT 0,
  "coordinatedCount" INTEGER NOT NULL DEFAULT 0,
  "evidenceChangedAt" TIMESTAMP(3),
  "exposureUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rewardPoolUsdc" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "monetaryEligible" BOOLEAN NOT NULL DEFAULT false,
  "secondPanelForId" TEXT,
  "bestAssignmentId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProofFlowReviewPanel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProofFlowReviewAssignment" (
  "id" TEXT NOT NULL,
  "panelId" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "resolutionId" TEXT,
  "reviewerUserId" TEXT,
  "reviewerWallet" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'assigned',
  "recommendedOutcome" "NativeOutcomeSide",
  "noteHash" TEXT,
  "noteText" TEXT,
  "evidenceUrl" TEXT,
  "sourceUrl" TEXT,
  "submittedAt" TIMESTAMP(3),
  "revealedAt" TIMESTAMP(3),
  "missedAt" TIMESTAMP(3),
  "conflictDetectedAt" TIMESTAMP(3),
  "conflictReason" TEXT,
  "coordinatedFlag" BOOLEAN NOT NULL DEFAULT false,
  "wrongSourceFlag" BOOLEAN NOT NULL DEFAULT false,
  "spamFlag" BOOLEAN NOT NULL DEFAULT false,
  "badFaithFlag" BOOLEAN NOT NULL DEFAULT false,
  "noteScore" DOUBLE PRECISION,
  "rewardUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reputationDelta" INTEGER NOT NULL DEFAULT 0,
  "penaltyReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProofFlowReviewAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProofFlowSecondPanelTrigger" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "resolutionId" TEXT,
  "panelId" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "detail" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProofFlowSecondPanelTrigger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProofFlowReviewerReward" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "resolutionId" TEXT,
  "panelId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "reviewerWallet" TEXT NOT NULL,
  "amountUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rewardType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'recorded',
  "reputationDelta" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProofFlowReviewerReward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProofFlowReviewPanel_marketId_round_key" ON "ProofFlowReviewPanel"("marketId", "round");
CREATE INDEX "ProofFlowReviewPanel_marketId_status_idx" ON "ProofFlowReviewPanel"("marketId", "status");
CREATE INDEX "ProofFlowReviewPanel_resolutionId_idx" ON "ProofFlowReviewPanel"("resolutionId");
CREATE INDEX "ProofFlowReviewPanel_status_reviewDeadline_idx" ON "ProofFlowReviewPanel"("status", "reviewDeadline");

CREATE UNIQUE INDEX "ProofFlowReviewAssignment_panelId_reviewerWallet_key" ON "ProofFlowReviewAssignment"("panelId", "reviewerWallet");
CREATE INDEX "ProofFlowReviewAssignment_marketId_reviewerWallet_idx" ON "ProofFlowReviewAssignment"("marketId", "reviewerWallet");
CREATE INDEX "ProofFlowReviewAssignment_panelId_status_idx" ON "ProofFlowReviewAssignment"("panelId", "status");
CREATE INDEX "ProofFlowReviewAssignment_reviewerUserId_createdAt_idx" ON "ProofFlowReviewAssignment"("reviewerUserId", "createdAt");

CREATE INDEX "ProofFlowSecondPanelTrigger_marketId_triggerType_idx" ON "ProofFlowSecondPanelTrigger"("marketId", "triggerType");
CREATE INDEX "ProofFlowSecondPanelTrigger_panelId_idx" ON "ProofFlowSecondPanelTrigger"("panelId");

CREATE INDEX "ProofFlowReviewerReward_marketId_createdAt_idx" ON "ProofFlowReviewerReward"("marketId", "createdAt");
CREATE INDEX "ProofFlowReviewerReward_reviewerWallet_createdAt_idx" ON "ProofFlowReviewerReward"("reviewerWallet", "createdAt");
CREATE INDEX "ProofFlowReviewerReward_panelId_idx" ON "ProofFlowReviewerReward"("panelId");

ALTER TABLE "ProofFlowReviewPanel" ADD CONSTRAINT "ProofFlowReviewPanel_resolutionId_fkey"
  FOREIGN KEY ("resolutionId") REFERENCES "MarketResolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProofFlowReviewAssignment" ADD CONSTRAINT "ProofFlowReviewAssignment_panelId_fkey"
  FOREIGN KEY ("panelId") REFERENCES "ProofFlowReviewPanel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProofFlowReviewAssignment" ADD CONSTRAINT "ProofFlowReviewAssignment_reviewerUserId_fkey"
  FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProofFlowSecondPanelTrigger" ADD CONSTRAINT "ProofFlowSecondPanelTrigger_panelId_fkey"
  FOREIGN KEY ("panelId") REFERENCES "ProofFlowReviewPanel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProofFlowReviewerReward" ADD CONSTRAINT "ProofFlowReviewerReward_panelId_fkey"
  FOREIGN KEY ("panelId") REFERENCES "ProofFlowReviewPanel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProofFlowReviewerReward" ADD CONSTRAINT "ProofFlowReviewerReward_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ProofFlowReviewAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
