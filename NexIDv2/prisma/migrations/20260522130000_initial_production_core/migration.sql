-- CreateEnum
CREATE TYPE "PositionSide" AS ENUM ('ride', 'fade');
CREATE TYPE "OrderType" AS ENUM ('market', 'limit');
CREATE TYPE "PositionStatus" AS ENUM ('pending', 'live', 'partial_fill', 'filled', 'closed', 'resolved', 'failed');
CREATE TYPE "IdStatus" AS ENUM ('reserved', 'payment_pending', 'active', 'released', 'failed');
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'confirmed', 'failed');
CREATE TYPE "ReceiptStatus" AS ENUM ('draft', 'ready', 'disputed', 'archived');

-- CreateTable
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "displayName" TEXT,
  "primaryIdName" TEXT,
  "pointsTotal" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletNonce" (
  "id" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletNonce_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Narrative" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "heat" INTEGER NOT NULL,
  "move7d" INTEGER NOT NULL,
  "quality" TEXT NOT NULL,
  "liquidity" DOUBLE PRECISION NOT NULL,
  "spread" DOUBLE PRECISION NOT NULL,
  "volume" DOUBLE PRECISION NOT NULL,
  "riders" INTEGER NOT NULL,
  "faders" INTEGER NOT NULL,
  "expiry" TEXT NOT NULL,
  "top" TEXT NOT NULL,
  "ridePrice" DOUBLE PRECISION NOT NULL,
  "fadePrice" DOUBLE PRECISION NOT NULL,
  "chart" JSONB NOT NULL,
  "comments" JSONB NOT NULL,
  "rules" JSONB NOT NULL,
  "bestMarketId" TEXT,
  "tradable" BOOLEAN NOT NULL DEFAULT true,
  "fallbackReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Narrative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MappedMarket" (
  "id" TEXT NOT NULL,
  "narrativeId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "outcomes" JSONB NOT NULL,
  "outcomePrices" JSONB NOT NULL,
  "liquidity" DOUBLE PRECISION NOT NULL,
  "volume24h" DOUBLE PRECISION NOT NULL,
  "spread" DOUBLE PRECISION NOT NULL,
  "expiry" TIMESTAMP(3),
  "enableOrderBook" BOOLEAN NOT NULL DEFAULT false,
  "qualityScore" INTEGER NOT NULL,
  "sideMap" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MappedMarket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Position" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "narrativeId" TEXT NOT NULL,
  "marketId" TEXT,
  "side" "PositionSide" NOT NULL,
  "orderType" "OrderType" NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "entryPrice" DOUBLE PRECISION NOT NULL,
  "outcomeToken" TEXT,
  "executionId" TEXT,
  "builder" TEXT,
  "fillStatus" TEXT,
  "status" "PositionStatus" NOT NULL DEFAULT 'live',
  "proof" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Receipt" (
  "id" TEXT NOT NULL,
  "positionId" TEXT NOT NULL,
  "userId" TEXT,
  "returnPct" INTEGER NOT NULL,
  "proofLevel" TEXT NOT NULL,
  "edgePoints" INTEGER NOT NULL,
  "rank" TEXT NOT NULL,
  "publicUrl" TEXT NOT NULL,
  "cardAsset" TEXT,
  "status" "ReceiptStatus" NOT NULL DEFAULT 'ready',
  "resultSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PointsEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "reason" TEXT NOT NULL,
  "season" TEXT NOT NULL DEFAULT 'Season 1',
  "points" INTEGER NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PointsEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdName" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "userId" TEXT,
  "status" "IdStatus" NOT NULL DEFAULT 'reserved',
  "price" DOUBLE PRECISION NOT NULL,
  "rarity" TEXT NOT NULL,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "mintedAt" TIMESTAMP(3),
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "paymentRef" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdName_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Referral" (
  "id" TEXT NOT NULL,
  "referrerUserId" TEXT,
  "referredUserId" TEXT,
  "referrerIdName" TEXT NOT NULL,
  "mintName" TEXT,
  "mintPrice" DOUBLE PRECISION NOT NULL,
  "rewardAmount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "riskFlag" TEXT,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "signups" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsEvent" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "userId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CardAsset" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "publicUrl" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CardAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminAuditLog" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");
CREATE UNIQUE INDEX "WalletNonce_nonce_key" ON "WalletNonce"("nonce");
CREATE INDEX "WalletNonce_walletAddress_idx" ON "WalletNonce"("walletAddress");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_walletAddress_idx" ON "AuthSession"("walletAddress");
CREATE UNIQUE INDEX "Receipt_positionId_key" ON "Receipt"("positionId");
CREATE UNIQUE INDEX "IdName_name_key" ON "IdName"("name");

-- Foreign keys
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MappedMarket" ADD CONSTRAINT "MappedMarket_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "Narrative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Position" ADD CONSTRAINT "Position_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "Narrative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Position" ADD CONSTRAINT "Position_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "MappedMarket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PointsEvent" ADD CONSTRAINT "PointsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IdName" ADD CONSTRAINT "IdName_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
