CREATE TABLE "AgentTradingPolicy" (
  "id" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "agentProfileId" TEXT,
  "publicId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "dailyExposureLimitUsdc" DOUBLE PRECISION NOT NULL DEFAULT 500,
  "relaxedDailyLimitUsdc" DOUBLE PRECISION,
  "exposureTodayUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "limitsResetAt" TIMESTAMP(3),
  "trustStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trustExpiresAt" TIMESTAMP(3),
  "relaxationTradeThreshold" INTEGER NOT NULL DEFAULT 25,
  "relaxationDurationDays" INTEGER NOT NULL DEFAULT 30,
  "cleanTradesCount" INTEGER NOT NULL DEFAULT 0,
  "selfTradeEver" BOOLEAN NOT NULL DEFAULT false,
  "selfTradeCount" INTEGER NOT NULL DEFAULT 0,
  "washTradeFlagCount" INTEGER NOT NULL DEFAULT 0,
  "tradingDisabled" BOOLEAN NOT NULL DEFAULT false,
  "relaxedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentTradingPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentTradingExposureLedger" (
  "id" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "agentProfileId" TEXT,
  "marketId" TEXT,
  "tradeId" TEXT,
  "side" TEXT,
  "amountUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "exposureDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECORDED',
  "txHash" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentTradingExposureLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentTradingRiskFlag" (
  "id" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "agentProfileId" TEXT,
  "publicId" TEXT,
  "marketId" TEXT,
  "tradeId" TEXT,
  "txHash" TEXT,
  "flagType" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "status" TEXT NOT NULL DEFAULT 'active',
  "relatedWalletAddress" TEXT,
  "relatedAgentProfileId" TEXT,
  "fundingEdgeId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentTradingRiskFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletFundingEdge" (
  "id" TEXT NOT NULL,
  "funderWallet" TEXT NOT NULL,
  "fundedWallet" TEXT NOT NULL,
  "txHash" TEXT NOT NULL,
  "logIndex" INTEGER,
  "tokenAddress" TEXT,
  "chainId" INTEGER,
  "amountUsdc" DOUBLE PRECISION,
  "blockNumber" INTEGER,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL DEFAULT 'onchain_indexer',
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WalletFundingEdge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentTradingPolicy_walletAddress_key" ON "AgentTradingPolicy"("walletAddress");
CREATE INDEX "AgentTradingPolicy_agentProfileId_idx" ON "AgentTradingPolicy"("agentProfileId");
CREATE INDEX "AgentTradingPolicy_publicId_idx" ON "AgentTradingPolicy"("publicId");
CREATE INDEX "AgentTradingPolicy_status_idx" ON "AgentTradingPolicy"("status");
CREATE INDEX "AgentTradingPolicy_selfTradeEver_idx" ON "AgentTradingPolicy"("selfTradeEver");
CREATE INDEX "AgentTradingPolicy_walletAddress_status_idx" ON "AgentTradingPolicy"("walletAddress", "status");

CREATE INDEX "AgentTradingExposureLedger_walletAddress_exposureDate_idx" ON "AgentTradingExposureLedger"("walletAddress", "exposureDate");
CREATE INDEX "AgentTradingExposureLedger_agentProfileId_exposureDate_idx" ON "AgentTradingExposureLedger"("agentProfileId", "exposureDate");
CREATE INDEX "AgentTradingExposureLedger_marketId_walletAddress_idx" ON "AgentTradingExposureLedger"("marketId", "walletAddress");
CREATE INDEX "AgentTradingExposureLedger_tradeId_idx" ON "AgentTradingExposureLedger"("tradeId");
CREATE INDEX "AgentTradingExposureLedger_status_createdAt_idx" ON "AgentTradingExposureLedger"("status", "createdAt");

CREATE INDEX "AgentTradingRiskFlag_walletAddress_flagType_createdAt_idx" ON "AgentTradingRiskFlag"("walletAddress", "flagType", "createdAt");
CREATE INDEX "AgentTradingRiskFlag_agentProfileId_flagType_createdAt_idx" ON "AgentTradingRiskFlag"("agentProfileId", "flagType", "createdAt");
CREATE INDEX "AgentTradingRiskFlag_publicId_flagType_createdAt_idx" ON "AgentTradingRiskFlag"("publicId", "flagType", "createdAt");
CREATE INDEX "AgentTradingRiskFlag_marketId_flagType_idx" ON "AgentTradingRiskFlag"("marketId", "flagType");
CREATE INDEX "AgentTradingRiskFlag_relatedWalletAddress_flagType_idx" ON "AgentTradingRiskFlag"("relatedWalletAddress", "flagType");
CREATE INDEX "AgentTradingRiskFlag_status_createdAt_idx" ON "AgentTradingRiskFlag"("status", "createdAt");

CREATE UNIQUE INDEX "WalletFundingEdge_txHash_logIndex_key" ON "WalletFundingEdge"("txHash", "logIndex");
CREATE INDEX "WalletFundingEdge_funderWallet_fundedWallet_observedAt_idx" ON "WalletFundingEdge"("funderWallet", "fundedWallet", "observedAt");
CREATE INDEX "WalletFundingEdge_fundedWallet_observedAt_idx" ON "WalletFundingEdge"("fundedWallet", "observedAt");
CREATE INDEX "WalletFundingEdge_funderWallet_observedAt_idx" ON "WalletFundingEdge"("funderWallet", "observedAt");
CREATE INDEX "WalletFundingEdge_status_observedAt_idx" ON "WalletFundingEdge"("status", "observedAt");
