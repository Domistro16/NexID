ALTER TABLE "Market" ADD COLUMN "creatorAgentProfileId" TEXT;
ALTER TABLE "MarketDraft" ADD COLUMN "creatorAgentProfileId" TEXT;
ALTER TABLE "MarketReceipt" ADD COLUMN "agentProfileId" TEXT;
ALTER TABLE "AgentMarketAuditLog" ADD COLUMN "agentProfileId" TEXT;
ALTER TABLE "AgentLaunchRequest" ADD COLUMN "agentProfileId" TEXT;
ALTER TABLE "AgentApiKey" ADD COLUMN "agentProfileId" TEXT;

CREATE TABLE "AgentProfile" (
  "id" TEXT NOT NULL,
  "publicId" TEXT,
  "displayName" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "ownerWallet" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "bio" TEXT,
  "avatarUrl" TEXT,
  "dailyLaunchLimit" INTEGER NOT NULL DEFAULT 3,
  "maxBondSpendUsdc" DOUBLE PRECISION NOT NULL DEFAULT 100,
  "launchesToday" INTEGER NOT NULL DEFAULT 0,
  "bondSpentTodayUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "limitsResetAt" TIMESTAMP(3),
  "launchingDisabled" BOOLEAN NOT NULL DEFAULT false,
  "pausedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastLaunchAt" TIMESTAMP(3),
  "erc8004Ref" TEXT,
  "erc8126ScoreRef" TEXT,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentReputationSnapshot" (
  "id" TEXT NOT NULL,
  "agentProfileId" TEXT NOT NULL,
  "marketsLaunched" INTEGER NOT NULL DEFAULT 0,
  "creatorFeesEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "invalidMarkets" INTEGER NOT NULL DEFAULT 0,
  "disputedMarkets" INTEGER NOT NULL DEFAULT 0,
  "resolvedMarkets" INTEGER NOT NULL DEFAULT 0,
  "accurateResolutions" INTEGER NOT NULL DEFAULT 0,
  "launchSuccessRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "resolutionAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "invalidMarketRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "communityTrustScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "calculationVersion" TEXT NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentReputationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentReputationEvent" (
  "id" TEXT NOT NULL,
  "agentProfileId" TEXT NOT NULL,
  "marketId" TEXT,
  "type" TEXT NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentReputationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentExternalCredential" (
  "id" TEXT NOT NULL,
  "agentProfileId" TEXT NOT NULL,
  "standard" TEXT NOT NULL,
  "chainId" INTEGER,
  "registry" TEXT,
  "subjectId" TEXT,
  "score" DOUBLE PRECISION,
  "payload" JSONB,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentExternalCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentBadge" (
  "id" TEXT NOT NULL,
  "agentProfileId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "tier" TEXT NOT NULL DEFAULT 'standard',
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,

  CONSTRAINT "AgentBadge_pkey" PRIMARY KEY ("id")
);

WITH ranked_agent_keys AS (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY "publicId" ORDER BY "createdAt", "id") AS "publicIdRank"
  FROM "AgentApiKey"
)
INSERT INTO "AgentProfile" (
  "id",
  "publicId",
  "displayName",
  "ownerUserId",
  "ownerWallet",
  "status",
  "dailyLaunchLimit",
  "maxBondSpendUsdc",
  "launchesToday",
  "bondSpentTodayUsdc",
  "limitsResetAt",
  "launchingDisabled",
  "pausedAt",
  "revokedAt",
  "lastLaunchAt",
  "joinedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'agp_' || "id",
  CASE WHEN "publicId" IS NOT NULL AND "publicIdRank" = 1 THEN "publicId" ELSE NULL END,
  COALESCE(NULLIF("identity", ''), CASE WHEN "publicId" IS NOT NULL THEN "publicId" || '.id' ELSE "name" END),
  "userId",
  "walletAddress",
  "status",
  "dailyLaunchLimit",
  "maxBondSpendUsdc",
  "launchesToday",
  "bondSpentTodayUsdc",
  "limitsResetAt",
  "launchingDisabled",
  "pausedAt",
  "revokedAt",
  "lastLaunchAt",
  "createdAt",
  "createdAt",
  "updatedAt"
FROM ranked_agent_keys;

UPDATE "AgentApiKey"
SET "agentProfileId" = 'agp_' || "id";

UPDATE "Market"
SET "creatorAgentProfileId" = 'agp_' || "creatorAgentId"
WHERE "creatorAgentId" IS NOT NULL;

UPDATE "MarketDraft"
SET "creatorAgentProfileId" = 'agp_' || "creatorAgentId"
WHERE "creatorAgentId" IS NOT NULL;

UPDATE "MarketReceipt"
SET "agentProfileId" = 'agp_' || "agentId"
WHERE "agentId" IS NOT NULL;

UPDATE "AgentMarketAuditLog"
SET "agentProfileId" = 'agp_' || "agentId"
WHERE "agentId" IS NOT NULL;

UPDATE "AgentLaunchRequest"
SET "agentProfileId" = 'agp_' || "agentId"
WHERE "agentId" IS NOT NULL;

CREATE UNIQUE INDEX "AgentProfile_publicId_key" ON "AgentProfile"("publicId");
CREATE INDEX "AgentProfile_ownerWallet_idx" ON "AgentProfile"("ownerWallet");
CREATE INDEX "AgentProfile_ownerUserId_idx" ON "AgentProfile"("ownerUserId");
CREATE INDEX "AgentProfile_status_idx" ON "AgentProfile"("status");
CREATE INDEX "AgentProfile_publicId_idx" ON "AgentProfile"("publicId");

CREATE INDEX "AgentApiKey_agentProfileId_status_idx" ON "AgentApiKey"("agentProfileId", "status");
CREATE INDEX "Market_creatorAgentProfileId_idx" ON "Market"("creatorAgentProfileId");
CREATE INDEX "MarketDraft_creatorAgentProfileId_createdAt_idx" ON "MarketDraft"("creatorAgentProfileId", "createdAt");
CREATE INDEX "MarketReceipt_agentProfileId_createdAt_idx" ON "MarketReceipt"("agentProfileId", "createdAt");
CREATE INDEX "AgentMarketAuditLog_agentProfileId_action_idx" ON "AgentMarketAuditLog"("agentProfileId", "action");
CREATE INDEX "AgentLaunchRequest_agentProfileId_status_createdAt_idx" ON "AgentLaunchRequest"("agentProfileId", "status", "createdAt");

CREATE INDEX "AgentReputationSnapshot_agentProfileId_calculatedAt_idx" ON "AgentReputationSnapshot"("agentProfileId", "calculatedAt");
CREATE INDEX "AgentReputationSnapshot_communityTrustScore_idx" ON "AgentReputationSnapshot"("communityTrustScore");
CREATE INDEX "AgentReputationEvent_agentProfileId_createdAt_idx" ON "AgentReputationEvent"("agentProfileId", "createdAt");
CREATE INDEX "AgentReputationEvent_type_createdAt_idx" ON "AgentReputationEvent"("type", "createdAt");
CREATE INDEX "AgentExternalCredential_agentProfileId_standard_idx" ON "AgentExternalCredential"("agentProfileId", "standard");
CREATE INDEX "AgentExternalCredential_standard_subjectId_idx" ON "AgentExternalCredential"("standard", "subjectId");
CREATE UNIQUE INDEX "AgentBadge_agentProfileId_code_key" ON "AgentBadge"("agentProfileId", "code");
CREATE INDEX "AgentBadge_agentProfileId_awardedAt_idx" ON "AgentBadge"("agentProfileId", "awardedAt");

ALTER TABLE "AgentApiKey" ADD CONSTRAINT "AgentApiKey_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentReputationSnapshot" ADD CONSTRAINT "AgentReputationSnapshot_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentReputationEvent" ADD CONSTRAINT "AgentReputationEvent_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentExternalCredential" ADD CONSTRAINT "AgentExternalCredential_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentBadge" ADD CONSTRAINT "AgentBadge_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
