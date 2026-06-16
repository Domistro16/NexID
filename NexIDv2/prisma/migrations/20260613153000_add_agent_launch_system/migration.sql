ALTER TABLE "Market" ADD COLUMN "creatorAgentPublicId" TEXT;
ALTER TABLE "MarketDraft" ADD COLUMN "creatorAgentId" TEXT;
ALTER TABLE "MarketReceipt" ADD COLUMN "agentId" TEXT;
ALTER TABLE "MarketReceipt" ADD COLUMN "agentPublicId" TEXT;
ALTER TABLE "MarketReceipt" ADD COLUMN "launchMethod" TEXT;

ALTER TABLE "AgentApiKey" ADD COLUMN "publicId" TEXT;
ALTER TABLE "AgentApiKey" ADD COLUMN "dailyLaunchLimit" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "AgentApiKey" ADD COLUMN "maxBondSpendUsdc" DOUBLE PRECISION NOT NULL DEFAULT 100;
ALTER TABLE "AgentApiKey" ADD COLUMN "launchesToday" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentApiKey" ADD COLUMN "bondSpentTodayUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AgentApiKey" ADD COLUMN "limitsResetAt" TIMESTAMP(3);
ALTER TABLE "AgentApiKey" ADD COLUMN "launchingDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentApiKey" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "AgentApiKey" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "AgentApiKey" ADD COLUMN "lastLaunchAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AgentApiKey_publicId_key" ON "AgentApiKey"("publicId");
CREATE INDEX "Market_creatorAgentPublicId_idx" ON "Market"("creatorAgentPublicId");
CREATE INDEX "MarketDraft_creatorAgentId_createdAt_idx" ON "MarketDraft"("creatorAgentId", "createdAt");
CREATE INDEX "MarketReceipt_agentId_createdAt_idx" ON "MarketReceipt"("agentId", "createdAt");
CREATE INDEX "MarketReceipt_agentPublicId_createdAt_idx" ON "MarketReceipt"("agentPublicId", "createdAt");
CREATE INDEX "AgentApiKey_publicId_idx" ON "AgentApiKey"("publicId");

CREATE TABLE "AgentLaunchRequest" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "draftId" TEXT,
  "marketId" TEXT,
  "status" TEXT NOT NULL,
  "validation" JSONB,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentLaunchRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentLaunchRequest_agentId_idempotencyKey_key" ON "AgentLaunchRequest"("agentId", "idempotencyKey");
CREATE INDEX "AgentLaunchRequest_agentId_status_createdAt_idx" ON "AgentLaunchRequest"("agentId", "status", "createdAt");
CREATE INDEX "AgentLaunchRequest_marketId_idx" ON "AgentLaunchRequest"("marketId");
