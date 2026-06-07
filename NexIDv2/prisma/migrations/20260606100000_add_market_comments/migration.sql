CREATE TABLE "MarketComment" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "userId" TEXT,
  "walletAddress" TEXT,
  "authorLabel" TEXT NOT NULL,
  "body" VARCHAR(600) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'visible',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketComment_marketId_createdAt_idx" ON "MarketComment"("marketId", "createdAt");
CREATE INDEX "MarketComment_userId_createdAt_idx" ON "MarketComment"("userId", "createdAt");
CREATE INDEX "MarketComment_status_createdAt_idx" ON "MarketComment"("status", "createdAt");

ALTER TABLE "MarketComment"
  ADD CONSTRAINT "MarketComment_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketComment"
  ADD CONSTRAINT "MarketComment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
