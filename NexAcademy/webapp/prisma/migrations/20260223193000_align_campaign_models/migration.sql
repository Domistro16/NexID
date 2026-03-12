DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'Campaign' AND column_name = 'summary'
    ) THEN
        ALTER TABLE "Campaign" RENAME COLUMN "summary" TO "objective";
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'Campaign' AND column_name = 'onChainEscrow'
    ) THEN
        ALTER TABLE "Campaign" RENAME COLUMN "onChainEscrow" TO "escrowAddress";
    END IF;
END $$;

ALTER TABLE "Campaign"
    ALTER COLUMN "category" DROP NOT NULL;

ALTER TABLE "Campaign"
    ADD COLUMN IF NOT EXISTS "sponsorNamespace" TEXT,
    ADD COLUMN IF NOT EXISTS "keyTakeaways" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "requestId" TEXT;

ALTER TABLE "CampaignRequest"
    DROP COLUMN IF EXISTS "contactEmail",
    DROP COLUMN IF EXISTS "category",
    DROP COLUMN IF EXISTS "additionalRewards",
    DROP COLUMN IF EXISTS "campaignId";

ALTER TABLE "CampaignRequest"
    DROP CONSTRAINT IF EXISTS "CampaignRequest_campaignId_fkey";

DO $$ BEGIN
    CREATE UNIQUE INDEX "Campaign_requestId_key" ON "Campaign"("requestId");
EXCEPTION
    WHEN duplicate_table THEN null;
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Campaign"
    ADD CONSTRAINT "Campaign_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "CampaignRequest"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
