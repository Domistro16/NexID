ALTER TABLE "User" ADD COLUMN "edgeScoreTotal" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Position"
  ADD COLUMN "requestedWalletAddress" TEXT,
  ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'disabled',
  ADD COLUMN "orderIntent" JSONB,
  ADD COLUMN "orderPreview" JSONB,
  ADD COLUMN "marketQualityScore" INTEGER,
  ADD COLUMN "exitPrice" DOUBLE PRECISION,
  ADD COLUMN "settlementPrice" DOUBLE PRECISION,
  ADD COLUMN "exitValue" DOUBLE PRECISION,
  ADD COLUMN "settlementSource" TEXT,
  ADD COLUMN "settledAt" TIMESTAMP(3);

ALTER TABLE "Receipt"
  ADD COLUMN "edgeScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scoreBreakdown" JSONB,
  ADD COLUMN "settlementSource" TEXT,
  ADD COLUMN "settledAt" TIMESTAMP(3);
