-- CreateIndex
CREATE INDEX "MappedMarket_narrativeId_idx" ON "MappedMarket"("narrativeId");

-- CreateIndex
CREATE INDEX "Market_updatedAt_idx" ON "Market"("updatedAt");

-- CreateIndex
CREATE INDEX "MarketComment_marketId_status_createdAt_idx" ON "MarketComment"("marketId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketOrderbookOrder_marketId_status_remainingUsdc_createdAt_idx" ON "MarketOrderbookOrder"("marketId", "status", "remainingUsdc", "createdAt");

-- CreateIndex
CREATE INDEX "NativeTargetOrder_status_executorAddress_createdAt_idx" ON "NativeTargetOrder"("status", "executorAddress", "createdAt");

-- CreateIndex
CREATE INDEX "NativeTargetOrder_marketId_walletAddress_createdAt_idx" ON "NativeTargetOrder"("marketId", "walletAddress", "createdAt");

-- CreateIndex
CREATE INDEX "MarketResolution_marketId_updatedAt_idx" ON "MarketResolution"("marketId", "updatedAt");

-- CreateIndex
CREATE INDEX "NativePosition_marketId_createdAt_idx" ON "NativePosition"("marketId", "createdAt");

