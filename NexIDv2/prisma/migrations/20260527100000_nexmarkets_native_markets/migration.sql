-- CreateEnum
CREATE TYPE "MarketOrigin" AS ENUM ('polymarket', 'native', 'draft');

-- CreateEnum
CREATE TYPE "NexMarketStatus" AS ENUM ('draft', 'route_check', 'ready_to_launch', 'live_pending_open', 'trading_live', 'closed', 'result_proposed', 'disputed', 'settled', 'invalid_refund', 'cancelled_before_trading');

-- CreateEnum
CREATE TYPE "MarketMatchType" AS ENUM ('exact', 'related', 'weak', 'none', 'blocked', 'ambiguous');

-- CreateEnum
CREATE TYPE "NativeOutcomeSide" AS ENUM ('ride', 'fade', 'invalid');

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "origin" "MarketOrigin" NOT NULL DEFAULT 'draft',
    "status" "NexMarketStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "arena" TEXT NOT NULL,
    "template" TEXT,
    "sourceUrl" TEXT,
    "closeTime" TIMESTAMP(3),
    "polymarketMarketId" TEXT,
    "polymarketConditionId" TEXT,
    "polymarketClobTokenIds" JSONB,
    "creatorUserId" TEXT,
    "creatorWallet" TEXT,
    "creatorIdentity" TEXT,
    "chainId" INTEGER,
    "contractAddress" TEXT,
    "rulesHash" TEXT,
    "metadataHash" TEXT,
    "launchStakeStatus" TEXT,
    "resolutionState" TEXT,
    "routeDecision" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "walletAddress" TEXT,
    "rawThesis" TEXT NOT NULL,
    "shaped" JSONB NOT NULL,
    "routeDecision" JSONB,
    "riskStatus" TEXT NOT NULL,
    "marketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketRouteMatch" (
    "id" TEXT NOT NULL,
    "draftId" TEXT,
    "marketId" TEXT,
    "origin" "MarketOrigin" NOT NULL,
    "matchType" "MarketMatchType" NOT NULL,
    "candidateId" TEXT,
    "candidateTitle" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketRouteMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NativeMarketRules" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "rulesHash" TEXT NOT NULL,
    "metadataHash" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "settlementSource" TEXT NOT NULL,
    "closeTime" TIMESTAMP(3) NOT NULL,
    "openTime" TIMESTAMP(3),
    "duplicateStatus" TEXT NOT NULL DEFAULT 'none',
    "riskStatus" TEXT NOT NULL DEFAULT 'allowed',
    "rawRules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NativeMarketRules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaunchStake" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "stakeId" TEXT,
    "creatorWallet" TEXT NOT NULL,
    "totalUsdc" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "feeUsdc" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "bondUsdc" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "txHash" TEXT,
    "returnedAt" TIMESTAMP(3),
    "slashedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaunchStake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NativePosition" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "userId" TEXT,
    "walletAddress" TEXT NOT NULL,
    "side" "NativeOutcomeSide" NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notionalUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NativePosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NativeTrade" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "positionId" TEXT,
    "walletAddress" TEXT NOT NULL,
    "side" "NativeOutcomeSide" NOT NULL,
    "notionalUsdc" DOUBLE PRECISION NOT NULL,
    "feeUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "txHash" TEXT NOT NULL,
    "eventLogIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NativeTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketResolution" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "proposedOutcome" "NativeOutcomeSide",
    "finalOutcome" "NativeOutcomeSide",
    "status" TEXT NOT NULL DEFAULT 'pending',
    "proposerWallet" TEXT,
    "txHash" TEXT,
    "proposedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketDispute" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "resolutionId" TEXT,
    "disputerWallet" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDeployment" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "network" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "deployer" TEXT,
    "txHash" TEXT,
    "verifiedUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnchainEventCursor" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "lastBlock" INTEGER NOT NULL DEFAULT 0,
    "lastLogIndex" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnchainEventCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketReceipt" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "userId" TEXT,
    "walletAddress" TEXT,
    "side" "NativeOutcomeSide",
    "title" TEXT NOT NULL,
    "proof" TEXT NOT NULL,
    "publicUrl" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorFeeLedger" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "creatorWallet" TEXT NOT NULL,
    "sourceTxHash" TEXT,
    "volumeUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creatorFeeUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "protocolFeeUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardsFeeUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "securityFeeUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorFeeLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "arena" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "defaultSource" TEXT,
    "riskPolicy" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Market_origin_status_idx" ON "Market"("origin", "status");
CREATE INDEX "Market_arena_status_idx" ON "Market"("arena", "status");
CREATE INDEX "Market_polymarketMarketId_idx" ON "Market"("polymarketMarketId");
CREATE INDEX "Market_contractAddress_idx" ON "Market"("contractAddress");
CREATE INDEX "Market_rulesHash_idx" ON "Market"("rulesHash");
CREATE INDEX "MarketDraft_userId_createdAt_idx" ON "MarketDraft"("userId", "createdAt");
CREATE INDEX "MarketDraft_walletAddress_createdAt_idx" ON "MarketDraft"("walletAddress", "createdAt");
CREATE INDEX "MarketDraft_riskStatus_idx" ON "MarketDraft"("riskStatus");
CREATE INDEX "MarketRouteMatch_draftId_idx" ON "MarketRouteMatch"("draftId");
CREATE INDEX "MarketRouteMatch_marketId_idx" ON "MarketRouteMatch"("marketId");
CREATE INDEX "MarketRouteMatch_origin_matchType_idx" ON "MarketRouteMatch"("origin", "matchType");
CREATE UNIQUE INDEX "NativeMarketRules_marketId_key" ON "NativeMarketRules"("marketId");
CREATE UNIQUE INDEX "NativeMarketRules_rulesHash_key" ON "NativeMarketRules"("rulesHash");
CREATE INDEX "NativeMarketRules_template_riskStatus_idx" ON "NativeMarketRules"("template", "riskStatus");
CREATE UNIQUE INDEX "LaunchStake_marketId_key" ON "LaunchStake"("marketId");
CREATE INDEX "LaunchStake_creatorWallet_status_idx" ON "LaunchStake"("creatorWallet", "status");
CREATE INDEX "NativePosition_marketId_walletAddress_idx" ON "NativePosition"("marketId", "walletAddress");
CREATE INDEX "NativePosition_userId_status_idx" ON "NativePosition"("userId", "status");
CREATE UNIQUE INDEX "NativeTrade_txHash_eventLogIndex_key" ON "NativeTrade"("txHash", "eventLogIndex");
CREATE INDEX "NativeTrade_marketId_createdAt_idx" ON "NativeTrade"("marketId", "createdAt");
CREATE INDEX "NativeTrade_walletAddress_createdAt_idx" ON "NativeTrade"("walletAddress", "createdAt");
CREATE INDEX "MarketResolution_marketId_status_idx" ON "MarketResolution"("marketId", "status");
CREATE INDEX "MarketDispute_marketId_status_idx" ON "MarketDispute"("marketId", "status");
CREATE UNIQUE INDEX "ContractDeployment_chainId_contractName_version_key" ON "ContractDeployment"("chainId", "contractName", "version");
CREATE INDEX "ContractDeployment_chainId_address_idx" ON "ContractDeployment"("chainId", "address");
CREATE UNIQUE INDEX "OnchainEventCursor_chainId_contractAddress_eventName_key" ON "OnchainEventCursor"("chainId", "contractAddress", "eventName");
CREATE INDEX "MarketReceipt_marketId_createdAt_idx" ON "MarketReceipt"("marketId", "createdAt");
CREATE INDEX "MarketReceipt_userId_createdAt_idx" ON "MarketReceipt"("userId", "createdAt");
CREATE INDEX "CreatorFeeLedger_marketId_createdAt_idx" ON "CreatorFeeLedger"("marketId", "createdAt");
CREATE INDEX "CreatorFeeLedger_creatorWallet_createdAt_idx" ON "CreatorFeeLedger"("creatorWallet", "createdAt");
CREATE INDEX "MarketTemplate_arena_status_idx" ON "MarketTemplate"("arena", "status");
