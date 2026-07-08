ALTER TABLE "ProofFlowProver" ADD COLUMN "agentProfileId" TEXT;
ALTER TABLE "ProofFlowProver" ADD COLUMN "roleType" TEXT NOT NULL DEFAULT 'HUMAN';
ALTER TABLE "ProofFlowProver" ADD COLUMN "poolId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "ProofFlowProver" ADD COLUMN "stakeAmountUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ProofFlowProver" ADD COLUMN "stakeStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "ProofFlowProver" ADD COLUMN "stakeTxHash" TEXT;
ALTER TABLE "ProofFlowProver" ADD COLUMN "stakedAt" TIMESTAMP(3);
ALTER TABLE "ProofFlowProver" ADD COLUMN "stakeSlashedUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ProofFlowProver" ADD COLUMN "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProofFlowProver" ADD COLUMN "registrationWeekStart" TIMESTAMP(3);

UPDATE "ProofFlowProver"
SET "roleType" = CASE
  WHEN "onboardingType" ILIKE '%AGENT%' THEN 'AGENT'
  ELSE 'HUMAN'
END,
"poolId" = 'default',
"stakeStatus" = CASE
  WHEN "onboardingType" ILIKE '%AGENT%' THEN 'STAKED'
  ELSE 'NOT_REQUIRED'
END,
"registeredAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
"registrationWeekStart" = date_trunc('week', COALESCE("createdAt", CURRENT_TIMESTAMP));

CREATE TABLE "ProofFlowProverRegistrationPolicy" (
  "id" TEXT NOT NULL,
  "policyKey" TEXT NOT NULL,
  "agentRegistrationsPaused" BOOLEAN NOT NULL DEFAULT false,
  "weeklyAgentRegistrationCap" INTEGER NOT NULL DEFAULT 20,
  "agentStakeUsdc" DOUBLE PRECISION NOT NULL DEFAULT 125,
  "agentSlashBps" INTEGER NOT NULL DEFAULT 1000,
  "poolId" TEXT NOT NULL DEFAULT 'default',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "updatedByWallet" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProofFlowProverRegistrationPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProofFlowProverRegistrationPolicy_policyKey_key" ON "ProofFlowProverRegistrationPolicy"("policyKey");
CREATE INDEX "ProofFlowProverRegistrationPolicy_policyKey_status_idx" ON "ProofFlowProverRegistrationPolicy"("policyKey", "status");
CREATE INDEX "ProofFlowProver_agentProfileId_idx" ON "ProofFlowProver"("agentProfileId");
CREATE INDEX "ProofFlowProver_roleType_status_idx" ON "ProofFlowProver"("roleType", "status");
CREATE INDEX "ProofFlowProver_poolId_status_idx" ON "ProofFlowProver"("poolId", "status");
CREATE INDEX "ProofFlowProver_registrationWeekStart_roleType_idx" ON "ProofFlowProver"("registrationWeekStart", "roleType");
CREATE INDEX "ProofFlowProver_stakeStatus_idx" ON "ProofFlowProver"("stakeStatus");
