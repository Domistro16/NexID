-- CreateEnum
CREATE TYPE "PartnerVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartnerTier" AS ENUM ('STANDARD', 'PREMIUM', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "ScanCadence" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('VERIFIED', 'CONSISTENT', 'RIGOROUS', 'DEFI_ACTIVE', 'DEFI_FLUENT', 'DEFI_NATIVE', 'PROTOCOL_SPECIALIST', 'ZERO_FLAGS', 'AGENT_CERTIFIED', 'CROSS_CHAIN', 'CHARTERED', 'EARLY_ADOPTER');

-- CreateEnum
CREATE TYPE "SybilFlagReason" AS ENUM ('WALLET_AGE_BELOW_MINIMUM', 'IP_CLUSTER', 'DEVICE_FINGERPRINT_CLUSTER', 'TX_TIMING_CLUSTER', 'SHALLOW_ON_CHAIN_DEPTH', 'AI_GENERATED_CONTENT', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "KillSwitchScope" AS ENUM ('GLOBAL', 'CAMPAIGN', 'USER');

-- CreateEnum
CREATE TYPE "AgentSessionType" AS ENUM ('CAMPAIGN_ASSESSMENT', 'CHARTERED_INTERVIEW', 'PROTOCOL_ONBOARDING', 'SCORE_DISPUTE', 'SECURITY_SIMULATION', 'PROOF_OF_OUTCOME_BRIEFING', 'CAMPAIGN_DISCOVERY', 'PRE_QUIZ_QA');

-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('QUEUED', 'WALLET_CHALLENGE', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "difficultyWeight" DECIMAL(3,2) NOT NULL DEFAULT 1.0,
ADD COLUMN     "escrowVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "escrowVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "minQuestions" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "partnerContractAddress" TEXT,
ADD COLUMN     "passThreshold" INTEGER NOT NULL DEFAULT 80;

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "entityRegistration" TEXT,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "isPubliclyVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "socialUrl" TEXT,
ADD COLUMN     "tier" "PartnerTier" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "verificationStatus" "PartnerVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT,
ADD COLUMN     "websiteUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "shadowBanned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PartnerContractWhitelist" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "campaignId" INTEGER,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "label" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerContractWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassportScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "frequencyScore" INTEGER NOT NULL DEFAULT 0,
    "recencyScore" INTEGER NOT NULL DEFAULT 0,
    "depthScore" INTEGER NOT NULL DEFAULT 0,
    "varietyScore" INTEGER NOT NULL DEFAULT 0,
    "volumeTier" INTEGER NOT NULL DEFAULT 0,
    "compositeScore" INTEGER NOT NULL DEFAULT 0,
    "consecutiveActiveWeeks" INTEGER NOT NULL DEFAULT 0,
    "crossProtocolCount" INTEGER NOT NULL DEFAULT 0,
    "scanCadence" "ScanCadence" NOT NULL DEFAULT 'WEEKLY',
    "lastScannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassportScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletScanLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "scanDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,
    "contractsInteracted" JSONB NOT NULL DEFAULT '[]',
    "actionsDetected" JSONB NOT NULL DEFAULT '[]',
    "activeDays" INTEGER NOT NULL DEFAULT 0,
    "txCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WalletScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BadgeType" NOT NULL,
    "partnerId" TEXT,
    "campaignId" INTEGER,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadgeDisplay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeIds" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "UserBadgeDisplay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SybilFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "SybilFlagReason" NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SybilFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionFingerprint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "deviceHash" TEXT,
    "userAgentHash" TEXT,
    "sessionStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KillSwitch" (
    "id" TEXT NOT NULL,
    "scope" "KillSwitchScope" NOT NULL,
    "targetId" TEXT,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "activatedBy" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "KillSwitch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" INTEGER,
    "flagType" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" INTEGER,
    "sessionType" "AgentSessionType" NOT NULL,
    "status" "AgentSessionStatus" NOT NULL DEFAULT 'QUEUED',
    "sessionToken" TEXT NOT NULL,
    "walletSignature" TEXT,
    "challengeIssuedAt" TIMESTAMP(3),
    "elevenLabsSessionId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "queuePosition" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "maxDurationSeconds" INTEGER NOT NULL DEFAULT 300,
    "depthScore" INTEGER,
    "accuracyScore" INTEGER,
    "originalityScore" INTEGER,
    "overallScore" INTEGER,
    "scoringNotes" JSONB,
    "transcript" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSlotConfig" (
    "id" TEXT NOT NULL,
    "sessionType" "AgentSessionType" NOT NULL,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 25,
    "maxDurationSeconds" INTEGER NOT NULL DEFAULT 300,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "topNEligible" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSlotConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerContractWhitelist_isApproved_idx" ON "PartnerContractWhitelist"("isApproved");

-- CreateIndex
CREATE INDEX "PartnerContractWhitelist_chainId_idx" ON "PartnerContractWhitelist"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerContractWhitelist_chainId_contractAddress_key" ON "PartnerContractWhitelist"("chainId", "contractAddress");

-- CreateIndex
CREATE UNIQUE INDEX "PassportScore_userId_key" ON "PassportScore"("userId");

-- CreateIndex
CREATE INDEX "PassportScore_compositeScore_idx" ON "PassportScore"("compositeScore");

-- CreateIndex
CREATE INDEX "PassportScore_scanCadence_idx" ON "PassportScore"("scanCadence");

-- CreateIndex
CREATE INDEX "WalletScanLog_userId_scanDate_idx" ON "WalletScanLog"("userId", "scanDate");

-- CreateIndex
CREATE INDEX "WalletScanLog_walletAddress_chainId_scanDate_idx" ON "WalletScanLog"("walletAddress", "chainId", "scanDate");

-- CreateIndex
CREATE INDEX "Badge_userId_idx" ON "Badge"("userId");

-- CreateIndex
CREATE INDEX "Badge_type_idx" ON "Badge"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_userId_type_partnerId_key" ON "Badge"("userId", "type", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadgeDisplay_userId_key" ON "UserBadgeDisplay"("userId");

-- CreateIndex
CREATE INDEX "SybilFlag_userId_idx" ON "SybilFlag"("userId");

-- CreateIndex
CREATE INDEX "SybilFlag_reason_idx" ON "SybilFlag"("reason");

-- CreateIndex
CREATE INDEX "SybilFlag_reviewed_idx" ON "SybilFlag"("reviewed");

-- CreateIndex
CREATE INDEX "SessionFingerprint_userId_idx" ON "SessionFingerprint"("userId");

-- CreateIndex
CREATE INDEX "SessionFingerprint_ipHash_idx" ON "SessionFingerprint"("ipHash");

-- CreateIndex
CREATE INDEX "SessionFingerprint_deviceHash_idx" ON "SessionFingerprint"("deviceHash");

-- CreateIndex
CREATE INDEX "KillSwitch_scope_enabled_idx" ON "KillSwitch"("scope", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "KillSwitch_scope_targetId_feature_key" ON "KillSwitch"("scope", "targetId", "feature");

-- CreateIndex
CREATE INDEX "EngagementFlag_userId_idx" ON "EngagementFlag"("userId");

-- CreateIndex
CREATE INDEX "EngagementFlag_campaignId_idx" ON "EngagementFlag"("campaignId");

-- CreateIndex
CREATE INDEX "EngagementFlag_flagType_idx" ON "EngagementFlag"("flagType");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_sessionToken_key" ON "AgentSession"("sessionToken");

-- CreateIndex
CREATE INDEX "AgentSession_userId_idx" ON "AgentSession"("userId");

-- CreateIndex
CREATE INDEX "AgentSession_status_idx" ON "AgentSession"("status");

-- CreateIndex
CREATE INDEX "AgentSession_sessionType_idx" ON "AgentSession"("sessionType");

-- CreateIndex
CREATE INDEX "AgentSession_scheduledAt_idx" ON "AgentSession"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_userId_campaignId_sessionType_key" ON "AgentSession"("userId", "campaignId", "sessionType");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSlotConfig_sessionType_key" ON "AgentSlotConfig"("sessionType");

-- CreateIndex
CREATE INDEX "Partner_verificationStatus_idx" ON "Partner"("verificationStatus");

-- CreateIndex
CREATE INDEX "Partner_isPubliclyVisible_idx" ON "Partner"("isPubliclyVisible");

-- AddForeignKey
ALTER TABLE "PassportScore" ADD CONSTRAINT "PassportScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadgeDisplay" ADD CONSTRAINT "UserBadgeDisplay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SybilFlag" ADD CONSTRAINT "SybilFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionFingerprint" ADD CONSTRAINT "SessionFingerprint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
