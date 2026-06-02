ALTER TABLE "MarketResolution"
ADD COLUMN "evidence" JSONB,
ADD COLUMN "evidenceHash" TEXT,
ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "confidence" DOUBLE PRECISION,
ADD COLUMN "verifiedAt" TIMESTAMP(3);

CREATE INDEX "MarketResolution_verificationStatus_idx" ON "MarketResolution"("verificationStatus");
