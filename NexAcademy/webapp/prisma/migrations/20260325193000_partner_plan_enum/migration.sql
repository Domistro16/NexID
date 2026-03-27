ALTER TYPE "CampaignTier" RENAME TO "CampaignTier_old";

CREATE TYPE "CampaignTier" AS ENUM ('LAUNCH_SPRINT', 'DEEP_DIVE', 'CUSTOM');

ALTER TABLE "Campaign"
ALTER COLUMN "tier" DROP DEFAULT;

ALTER TABLE "Campaign"
ALTER COLUMN "tier" TYPE "CampaignTier"
USING (
  CASE "tier"::text
    WHEN 'STANDARD' THEN 'LAUNCH_SPRINT'
    WHEN 'PREMIUM' THEN 'DEEP_DIVE'
    WHEN 'ECOSYSTEM' THEN 'CUSTOM'
    ELSE "tier"::text
  END
)::"CampaignTier";

ALTER TABLE "CampaignRequest"
ALTER COLUMN "tier" TYPE "CampaignTier"
USING (
  CASE "tier"::text
    WHEN 'STANDARD' THEN 'LAUNCH_SPRINT'
    WHEN 'PREMIUM' THEN 'DEEP_DIVE'
    WHEN 'ECOSYSTEM' THEN 'CUSTOM'
    ELSE "tier"::text
  END
)::"CampaignTier";

ALTER TABLE "Campaign"
ALTER COLUMN "tier" SET DEFAULT 'LAUNCH_SPRINT';

DROP TYPE "CampaignTier_old";
