DO $$ BEGIN
    CREATE TYPE "CampaignTier" AS ENUM ('STANDARD', 'PREMIUM', 'ECOSYSTEM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'LIVE', 'ENDED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CampaignRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "Campaign" (
    "id" SERIAL PRIMARY KEY,
    "slug" TEXT NOT NULL UNIQUE,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sponsorName" TEXT NOT NULL,
    "tier" "CampaignTier" NOT NULL DEFAULT 'STANDARD',
    "prizePoolUsdc" DECIMAL(18,6) NOT NULL,
    "additionalRewards" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "onChainEscrow" TEXT,
    "onChainCampaignId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Campaign_status_isPublished_idx"
ON "Campaign" ("status", "isPublished");

CREATE INDEX IF NOT EXISTS "Campaign_sponsorName_idx"
ON "Campaign" ("sponsorName");

CREATE TABLE IF NOT EXISTS "CampaignRequest" (
    "id" TEXT PRIMARY KEY,
    "submittedById" TEXT,
    "reviewedById" TEXT,
    "partnerName" TEXT NOT NULL,
    "partnerNamespace" TEXT,
    "contactEmail" TEXT,
    "campaignTitle" TEXT NOT NULL,
    "primaryObjective" TEXT NOT NULL,
    "category" TEXT,
    "tier" "CampaignTier" NOT NULL,
    "prizePoolUsdc" DECIMAL(18,6) NOT NULL,
    "additionalRewards" TEXT,
    "briefFileName" TEXT,
    "status" "CampaignRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "campaignId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CampaignRequest_status_createdAt_idx"
ON "CampaignRequest" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "CampaignRequest_partnerName_idx"
ON "CampaignRequest" ("partnerName");

CREATE TABLE IF NOT EXISTS "CampaignParticipant" (
    "id" TEXT PRIMARY KEY,
    "campaignId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "rewardAmountUsdc" DECIMAL(18,6),
    "rewardTxHash" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CampaignParticipant_campaignId_userId_key"
ON "CampaignParticipant" ("campaignId", "userId");

CREATE INDEX IF NOT EXISTS "CampaignParticipant_campaignId_rank_idx"
ON "CampaignParticipant" ("campaignId", "rank");

CREATE TABLE IF NOT EXISTS "CampaignRewardDistribution" (
    "id" TEXT PRIMARY KEY,
    "campaignId" INTEGER NOT NULL,
    "executedById" TEXT,
    "txHash" TEXT,
    "totalDistributedUsdc" DECIMAL(18,6) NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CampaignRewardDistribution_campaignId_createdAt_idx"
ON "CampaignRewardDistribution" ("campaignId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "CampaignRequest"
    ADD CONSTRAINT "CampaignRequest_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CampaignRequest"
    ADD CONSTRAINT "CampaignRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CampaignRequest"
    ADD CONSTRAINT "CampaignRequest_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CampaignParticipant"
    ADD CONSTRAINT "CampaignParticipant_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CampaignParticipant"
    ADD CONSTRAINT "CampaignParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CampaignRewardDistribution"
    ADD CONSTRAINT "CampaignRewardDistribution_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CampaignRewardDistribution"
    ADD CONSTRAINT "CampaignRewardDistribution_executedById_fkey"
    FOREIGN KEY ("executedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
