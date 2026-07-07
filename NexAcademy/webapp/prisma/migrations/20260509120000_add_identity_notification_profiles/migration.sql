CREATE TYPE "RelevanceAgentStatus" AS ENUM ('NOT_LINKED', 'PENDING_LINK', 'LINKED', 'DISABLED', 'ERROR');
CREATE TYPE "IdentityNotificationChannel" AS ENUM ('TELEGRAM', 'EMAIL', 'IN_APP', 'RELEVANCE_AI');
CREATE TYPE "IdentityNotificationEventType" AS ENUM ('REPUTATION_DROP', 'INACTIVITY', 'CAMPAIGN_RETENTION', 'SOCIAL_SIGNAL', 'SYSTEM');
CREATE TYPE "IdentityNotificationStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'FAILED', 'DISMISSED');

CREATE TABLE "PassportScoreSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'NEXID_PASSPORT_SCAN',
  "frequencyScore" INTEGER NOT NULL DEFAULT 0,
  "recencyScore" INTEGER NOT NULL DEFAULT 0,
  "depthScore" INTEGER NOT NULL DEFAULT 0,
  "varietyScore" INTEGER NOT NULL DEFAULT 0,
  "volumeTier" INTEGER NOT NULL DEFAULT 0,
  "compositeScore" INTEGER NOT NULL DEFAULT 0,
  "consecutiveActiveWeeks" INTEGER NOT NULL DEFAULT 0,
  "crossProtocolCount" INTEGER NOT NULL DEFAULT 0,
  "activeDays" INTEGER NOT NULL DEFAULT 0,
  "txCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PassportScoreSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdentityNotificationProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "domainName" TEXT,
  "primaryWalletAddress" TEXT NOT NULL,
  "linkedWalletAddresses" TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  "telegramHandle" TEXT,
  "telegramChatId" TEXT,
  "email" TEXT,
  "xHandle" TEXT,
  "relevanceAgentId" TEXT,
  "relevanceAgentEmail" TEXT,
  "relevanceAgentStatus" "RelevanceAgentStatus" NOT NULL DEFAULT 'NOT_LINKED',
  "reputationDropThreshold" INTEGER NOT NULL DEFAULT 10,
  "inactivityDaysThreshold" INTEGER NOT NULL DEFAULT 21,
  "telegramOptInAt" TIMESTAMP(3),
  "relevanceOptInAt" TIMESTAMP(3),
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IdentityNotificationProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdentityNotificationEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "profileId" TEXT,
  "type" "IdentityNotificationEventType" NOT NULL,
  "channel" "IdentityNotificationChannel",
  "status" "IdentityNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "domainName" TEXT,
  "walletAddress" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "previousScore" INTEGER,
  "currentScore" INTEGER,
  "queuedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IdentityNotificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PassportScoreSnapshot_userId_createdAt_idx" ON "PassportScoreSnapshot"("userId", "createdAt");
CREATE INDEX "PassportScoreSnapshot_walletAddress_createdAt_idx" ON "PassportScoreSnapshot"("walletAddress", "createdAt");
CREATE INDEX "PassportScoreSnapshot_source_idx" ON "PassportScoreSnapshot"("source");

CREATE UNIQUE INDEX "IdentityNotificationProfile_userId_domainName_key" ON "IdentityNotificationProfile"("userId", "domainName");
CREATE INDEX "IdentityNotificationProfile_userId_idx" ON "IdentityNotificationProfile"("userId");
CREATE INDEX "IdentityNotificationProfile_domainName_idx" ON "IdentityNotificationProfile"("domainName");
CREATE INDEX "IdentityNotificationProfile_primaryWalletAddress_idx" ON "IdentityNotificationProfile"("primaryWalletAddress");
CREATE INDEX "IdentityNotificationProfile_isEnabled_idx" ON "IdentityNotificationProfile"("isEnabled");

CREATE INDEX "IdentityNotificationEvent_userId_createdAt_idx" ON "IdentityNotificationEvent"("userId", "createdAt");
CREATE INDEX "IdentityNotificationEvent_profileId_idx" ON "IdentityNotificationEvent"("profileId");
CREATE INDEX "IdentityNotificationEvent_status_createdAt_idx" ON "IdentityNotificationEvent"("status", "createdAt");
CREATE INDEX "IdentityNotificationEvent_type_createdAt_idx" ON "IdentityNotificationEvent"("type", "createdAt");
CREATE INDEX "IdentityNotificationEvent_walletAddress_createdAt_idx" ON "IdentityNotificationEvent"("walletAddress", "createdAt");

ALTER TABLE "PassportScoreSnapshot"
  ADD CONSTRAINT "PassportScoreSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IdentityNotificationProfile"
  ADD CONSTRAINT "IdentityNotificationProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IdentityNotificationEvent"
  ADD CONSTRAINT "IdentityNotificationEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IdentityNotificationEvent"
  ADD CONSTRAINT "IdentityNotificationEvent_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "IdentityNotificationProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
