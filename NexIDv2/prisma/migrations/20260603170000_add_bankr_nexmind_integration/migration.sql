-- Bankr/NexMind integration tables and market metadata.
ALTER TABLE "Market" ADD COLUMN "createdByType" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "Market" ADD COLUMN "creatorAgentId" TEXT;
ALTER TABLE "Market" ADD COLUMN "sourceHealthStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Market" ADD COLUMN "lastSourceCheckAt" TIMESTAMP(3);

CREATE TABLE "BankrAiRequestLog" (
  "id" TEXT NOT NULL,
  "requestId" TEXT,
  "feature" TEXT NOT NULL,
  "userId" TEXT,
  "walletAddress" TEXT,
  "agentId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'bankr',
  "model" TEXT NOT NULL,
  "fallbackModel" TEXT,
  "status" TEXT NOT NULL,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "durationMs" INTEGER,
  "estimatedCostUsd" DOUBLE PRECISION,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankrAiRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrendingThesis" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "thesis" TEXT NOT NULL,
  "arena" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "fallbackSourceUrl" TEXT,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "measurabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sourceConfidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "shaped" JSONB,
  "routeDecision" JSONB,
  "generatedBy" TEXT NOT NULL DEFAULT 'bankr',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrendingThesis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SourceHealthCheck" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "fallbackSourceUrl" TEXT,
  "status" TEXT NOT NULL,
  "httpStatus" INTEGER,
  "latencyMs" INTEGER,
  "staleReason" TEXT,
  "checkedBy" TEXT NOT NULL DEFAULT 'bankr',
  "detail" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceHealthCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreatorNotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "walletAddress" TEXT,
  "email" TEXT,
  "telegramHandle" TEXT,
  "telegramChatId" TEXT,
  "channels" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreatorNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreatorNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "walletAddress" TEXT,
  "marketId" TEXT,
  "type" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'dashboard',
  "status" TEXT NOT NULL DEFAULT 'unread',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "metadata" JSONB,
  "sentAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreatorNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentApiKey" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "walletAddress" TEXT,
  "identity" TEXT,
  "userId" TEXT,
  "scopes" JSONB,
  "monthlyLimitUsd" DOUBLE PRECISION,
  "requestsToday" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentMarketAuditLog" (
  "id" TEXT NOT NULL,
  "agentId" TEXT,
  "marketId" TEXT,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "requestIp" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentMarketAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Market_createdByType_creatorAgentId_idx" ON "Market"("createdByType", "creatorAgentId");
CREATE INDEX "Market_sourceHealthStatus_lastSourceCheckAt_idx" ON "Market"("sourceHealthStatus", "lastSourceCheckAt");

CREATE INDEX "BankrAiRequestLog_feature_status_createdAt_idx" ON "BankrAiRequestLog"("feature", "status", "createdAt");
CREATE INDEX "BankrAiRequestLog_userId_createdAt_idx" ON "BankrAiRequestLog"("userId", "createdAt");
CREATE INDEX "BankrAiRequestLog_walletAddress_createdAt_idx" ON "BankrAiRequestLog"("walletAddress", "createdAt");
CREATE INDEX "BankrAiRequestLog_agentId_createdAt_idx" ON "BankrAiRequestLog"("agentId", "createdAt");

CREATE INDEX "TrendingThesis_status_score_idx" ON "TrendingThesis"("status", "score");
CREATE INDEX "TrendingThesis_arena_status_idx" ON "TrendingThesis"("arena", "status");
CREATE INDEX "TrendingThesis_createdAt_idx" ON "TrendingThesis"("createdAt");

CREATE INDEX "SourceHealthCheck_marketId_createdAt_idx" ON "SourceHealthCheck"("marketId", "createdAt");
CREATE INDEX "SourceHealthCheck_status_createdAt_idx" ON "SourceHealthCheck"("status", "createdAt");

CREATE INDEX "CreatorNotificationPreference_userId_idx" ON "CreatorNotificationPreference"("userId");
CREATE INDEX "CreatorNotificationPreference_walletAddress_idx" ON "CreatorNotificationPreference"("walletAddress");

CREATE INDEX "CreatorNotification_userId_status_idx" ON "CreatorNotification"("userId", "status");
CREATE INDEX "CreatorNotification_walletAddress_status_idx" ON "CreatorNotification"("walletAddress", "status");
CREATE INDEX "CreatorNotification_marketId_type_idx" ON "CreatorNotification"("marketId", "type");
CREATE INDEX "CreatorNotification_createdAt_idx" ON "CreatorNotification"("createdAt");

CREATE UNIQUE INDEX "AgentApiKey_keyHash_key" ON "AgentApiKey"("keyHash");
CREATE INDEX "AgentApiKey_walletAddress_status_idx" ON "AgentApiKey"("walletAddress", "status");
CREATE INDEX "AgentApiKey_userId_status_idx" ON "AgentApiKey"("userId", "status");

CREATE INDEX "AgentMarketAuditLog_agentId_action_idx" ON "AgentMarketAuditLog"("agentId", "action");
CREATE INDEX "AgentMarketAuditLog_marketId_idx" ON "AgentMarketAuditLog"("marketId");
CREATE INDEX "AgentMarketAuditLog_createdAt_idx" ON "AgentMarketAuditLog"("createdAt");
