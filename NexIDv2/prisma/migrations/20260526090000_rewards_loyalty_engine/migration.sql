ALTER TABLE "User"
  ADD COLUMN "rewardLevel" TEXT NOT NULL DEFAULT 'Scout',
  ADD COLUMN "rewardBadge" TEXT NOT NULL DEFAULT 'Signal Scout',
  ADD COLUMN "rewardScoreTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "rewardEarnedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "RewardSeason" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "tradingRevenueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "mintRevenueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rewardPoolUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tradingPoolRate" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
  "mintPoolRate" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  "levelWeights" JSONB NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardSeason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeeLedger" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "seasonCode" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceId" TEXT,
  "volumeUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "grossRevenueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "nexidFeeUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rewardContributionUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RewardAllocation" (
  "id" TEXT NOT NULL,
  "seasonCode" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "badge" TEXT NOT NULL,
  "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
  "weeklyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "eligibleVolumeUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "feePaidUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "realizedProfitUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rewardShareUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "riskFlag" TEXT,
  "breakdown" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "txHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RewardPayout" (
  "id" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amountUsd" DOUBLE PRECISION NOT NULL,
  "payoutMethod" TEXT NOT NULL DEFAULT 'manual',
  "destination" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "txHash" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RewardSeason_code_key" ON "RewardSeason"("code");
CREATE INDEX "RewardSeason_status_startsAt_idx" ON "RewardSeason"("status", "startsAt");

CREATE UNIQUE INDEX "FeeLedger_source_sourceId_key" ON "FeeLedger"("source", "sourceId");
CREATE INDEX "FeeLedger_userId_seasonCode_idx" ON "FeeLedger"("userId", "seasonCode");
CREATE INDEX "FeeLedger_seasonCode_source_idx" ON "FeeLedger"("seasonCode", "source");

CREATE UNIQUE INDEX "RewardAllocation_seasonCode_userId_key" ON "RewardAllocation"("seasonCode", "userId");
CREATE INDEX "RewardAllocation_status_seasonCode_idx" ON "RewardAllocation"("status", "seasonCode");
CREATE INDEX "RewardAllocation_userId_seasonCode_idx" ON "RewardAllocation"("userId", "seasonCode");

CREATE UNIQUE INDEX "RewardPayout_allocationId_key" ON "RewardPayout"("allocationId");
CREATE INDEX "RewardPayout_status_createdAt_idx" ON "RewardPayout"("status", "createdAt");
CREATE INDEX "RewardPayout_userId_createdAt_idx" ON "RewardPayout"("userId", "createdAt");

ALTER TABLE "FeeLedger" ADD CONSTRAINT "FeeLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeeLedger" ADD CONSTRAINT "FeeLedger_seasonCode_fkey" FOREIGN KEY ("seasonCode") REFERENCES "RewardSeason"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardAllocation" ADD CONSTRAINT "RewardAllocation_seasonCode_fkey" FOREIGN KEY ("seasonCode") REFERENCES "RewardSeason"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardAllocation" ADD CONSTRAINT "RewardAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardPayout" ADD CONSTRAINT "RewardPayout_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "RewardAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardPayout" ADD CONSTRAINT "RewardPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
