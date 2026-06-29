CREATE TABLE IF NOT EXISTS "ProofFlowProver" (
  "id" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "userId" TEXT,
  "idName" TEXT,
  "displayName" TEXT,
  "publicProfileSlug" TEXT,
  "publicBio" TEXT,
  "avatarUrl" TEXT,
  "genesisStatus" TEXT NOT NULL DEFAULT 'GENESIS',
  "onboardingType" TEXT NOT NULL DEFAULT 'GENESIS_MANUAL',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "genesisBadge" BOOLEAN NOT NULL DEFAULT true,
  "reputation" INTEGER NOT NULL DEFAULT 0,
  "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "completedSettlements" INTEGER NOT NULL DEFAULT 0,
  "totalAssignments" INTEGER NOT NULL DEFAULT 0,
  "successfulSettlements" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProofFlowProver_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProversPoolLedger" (
  "id" TEXT NOT NULL,
  "marketId" TEXT,
  "resolutionId" TEXT,
  "panelId" TEXT,
  "assignmentId" TEXT,
  "proverWallet" TEXT,
  "sourceType" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "amountUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'RECORDED',
  "txHash" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProversPoolLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProofFlowProver_walletAddress_key" ON "ProofFlowProver"("walletAddress");
CREATE UNIQUE INDEX IF NOT EXISTS "ProofFlowProver_userId_key" ON "ProofFlowProver"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProofFlowProver_publicProfileSlug_key" ON "ProofFlowProver"("publicProfileSlug");
CREATE INDEX IF NOT EXISTS "ProofFlowProver_status_genesisStatus_idx" ON "ProofFlowProver"("status", "genesisStatus");
CREATE INDEX IF NOT EXISTS "ProofFlowProver_walletAddress_idx" ON "ProofFlowProver"("walletAddress");
CREATE INDEX IF NOT EXISTS "ProofFlowProver_onboardingType_idx" ON "ProofFlowProver"("onboardingType");

CREATE INDEX IF NOT EXISTS "ProversPoolLedger_marketId_entryType_idx" ON "ProversPoolLedger"("marketId", "entryType");
CREATE INDEX IF NOT EXISTS "ProversPoolLedger_panelId_entryType_idx" ON "ProversPoolLedger"("panelId", "entryType");
CREATE INDEX IF NOT EXISTS "ProversPoolLedger_proverWallet_createdAt_idx" ON "ProversPoolLedger"("proverWallet", "createdAt");
CREATE INDEX IF NOT EXISTS "ProversPoolLedger_sourceType_status_idx" ON "ProversPoolLedger"("sourceType", "status");

ALTER TABLE "ProofFlowProver"
  ADD CONSTRAINT "ProofFlowProver_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
