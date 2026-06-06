ALTER TABLE "Market"
ADD COLUMN "sourceQualificationStatus" TEXT,
ADD COLUMN "sourceQualificationScore" INTEGER,
ADD COLUMN "sourceQualificationReason" TEXT,
ADD COLUMN "sourceValidationTimestamp" TIMESTAMP(3),
ADD COLUMN "sourceRepairAttempts" JSONB,
ADD COLUMN "extractorValidationStatus" TEXT,
ADD COLUMN "extractorValidationReason" TEXT,
ADD COLUMN "dryRunStatus" TEXT,
ADD COLUMN "dryRunResult" JSONB;

ALTER TABLE "MarketDraft"
ADD COLUMN "sourceQualificationStatus" TEXT,
ADD COLUMN "sourceQualificationScore" INTEGER,
ADD COLUMN "sourceQualificationReason" TEXT,
ADD COLUMN "sourceValidationTimestamp" TIMESTAMP(3),
ADD COLUMN "sourceRepairAttempts" JSONB,
ADD COLUMN "extractorValidationStatus" TEXT,
ADD COLUMN "extractorValidationReason" TEXT,
ADD COLUMN "dryRunStatus" TEXT,
ADD COLUMN "dryRunResult" JSONB;

CREATE INDEX "Market_sourceQualificationStatus_sourceQualificationScore_idx"
ON "Market"("sourceQualificationStatus", "sourceQualificationScore");

CREATE INDEX "MarketDraft_sourceQualificationStatus_sourceQualificationScore_idx"
ON "MarketDraft"("sourceQualificationStatus", "sourceQualificationScore");
