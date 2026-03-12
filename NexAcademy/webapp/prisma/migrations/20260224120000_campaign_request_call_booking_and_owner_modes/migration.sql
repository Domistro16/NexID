DO $$
BEGIN
    CREATE TYPE "CampaignOwnerType" AS ENUM ('NEXID', 'PARTNER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE "CampaignContractType" AS ENUM ('NEXID_CAMPAIGNS', 'PARTNER_CAMPAIGNS');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "Campaign"
    ADD COLUMN IF NOT EXISTS "ownerType" "CampaignOwnerType" NOT NULL DEFAULT 'PARTNER',
    ADD COLUMN IF NOT EXISTS "contractType" "CampaignContractType" NOT NULL DEFAULT 'PARTNER_CAMPAIGNS';

ALTER TABLE "Campaign"
    DROP COLUMN IF EXISTS "category",
    DROP COLUMN IF EXISTS "additionalRewards";

ALTER TABLE "CampaignRequest"
    ADD COLUMN IF NOT EXISTS "callBookedFor" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "callTimeSlot" TEXT,
    ADD COLUMN IF NOT EXISTS "callTimezone" TEXT,
    ADD COLUMN IF NOT EXISTS "callBookingNotes" TEXT;

CREATE INDEX IF NOT EXISTS "Campaign_ownerType_contractType_idx"
ON "Campaign" ("ownerType", "contractType");
