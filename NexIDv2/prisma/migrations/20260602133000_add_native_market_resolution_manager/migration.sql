ALTER TABLE "Market"
ADD COLUMN "resolutionManagerAddress" TEXT;

ALTER TABLE "NativeMarketRules"
ADD COLUMN "resolutionManagerAddress" TEXT;

CREATE INDEX "Market_resolutionManagerAddress_idx" ON "Market"("resolutionManagerAddress");
CREATE INDEX "NativeMarketRules_resolutionManagerAddress_idx" ON "NativeMarketRules"("resolutionManagerAddress");
