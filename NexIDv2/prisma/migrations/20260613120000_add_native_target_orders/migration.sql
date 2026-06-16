CREATE TABLE "NativeTargetOrder" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "userId" TEXT,
  "walletAddress" TEXT NOT NULL,
  "side" "NativeOutcomeSide" NOT NULL,
  "amountUsdc" DOUBLE PRECISION NOT NULL,
  "targetPrice" DOUBLE PRECISION NOT NULL,
  "maxPriceBps" INTEGER NOT NULL,
  "depositUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "feeUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "executorAddress" TEXT,
  "executorOrderId" TEXT,
  "createTxHash" TEXT,
  "executeTxHash" TEXT,
  "cancelTxHash" TEXT,
  "failureReason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "triggeredAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NativeTargetOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NativeTargetOrder_executorAddress_executorOrderId_key" ON "NativeTargetOrder"("executorAddress", "executorOrderId");
CREATE INDEX "NativeTargetOrder_marketId_status_side_targetPrice_idx" ON "NativeTargetOrder"("marketId", "status", "side", "targetPrice");
CREATE INDEX "NativeTargetOrder_marketId_createdAt_idx" ON "NativeTargetOrder"("marketId", "createdAt");
CREATE INDEX "NativeTargetOrder_walletAddress_status_idx" ON "NativeTargetOrder"("walletAddress", "status");
CREATE INDEX "NativeTargetOrder_userId_createdAt_idx" ON "NativeTargetOrder"("userId", "createdAt");
CREATE INDEX "NativeTargetOrder_status_expiresAt_idx" ON "NativeTargetOrder"("status", "expiresAt");

ALTER TABLE "NativeTargetOrder" ADD CONSTRAINT "NativeTargetOrder_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NativeTargetOrder" ADD CONSTRAINT "NativeTargetOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
