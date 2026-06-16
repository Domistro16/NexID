CREATE TABLE "MarketOrderbookOrder" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "userId" TEXT,
  "walletAddress" TEXT NOT NULL,
  "side" "NativeOutcomeSide" NOT NULL,
  "direction" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "sizeUsdc" DOUBLE PRECISION NOT NULL,
  "remainingUsdc" DOUBLE PRECISION NOT NULL,
  "filledUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "shareEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "source" TEXT NOT NULL DEFAULT 'nexmarkets',
  "executionId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketOrderbookOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketOrderbookOrder_marketId_status_side_direction_price_idx"
  ON "MarketOrderbookOrder"("marketId", "status", "side", "direction", "price");

CREATE INDEX "MarketOrderbookOrder_marketId_createdAt_idx"
  ON "MarketOrderbookOrder"("marketId", "createdAt");

CREATE INDEX "MarketOrderbookOrder_walletAddress_status_idx"
  ON "MarketOrderbookOrder"("walletAddress", "status");

CREATE INDEX "MarketOrderbookOrder_userId_createdAt_idx"
  ON "MarketOrderbookOrder"("userId", "createdAt");

ALTER TABLE "MarketOrderbookOrder"
  ADD CONSTRAINT "MarketOrderbookOrder_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketOrderbookOrder"
  ADD CONSTRAINT "MarketOrderbookOrder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
