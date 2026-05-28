ALTER TABLE "MarketResolution"
ADD COLUMN "resolutionMode" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "assertionId" TEXT,
ADD COLUMN "assertionClaim" TEXT,
ADD COLUMN "assertionTxHash" TEXT,
ADD COLUMN "assertionDeadline" TIMESTAMP(3),
ADD COLUMN "settlementTxHash" TEXT,
ADD COLUMN "lastError" TEXT;

CREATE UNIQUE INDEX "MarketResolution_assertionId_key" ON "MarketResolution"("assertionId");
