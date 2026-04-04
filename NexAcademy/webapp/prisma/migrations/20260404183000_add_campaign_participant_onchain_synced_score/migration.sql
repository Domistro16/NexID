ALTER TABLE "CampaignParticipant"
ADD COLUMN "onChainSyncedScore" INTEGER;

UPDATE "CampaignParticipant" cp
SET "onChainSyncedScore" = cp."score"
FROM "Campaign" c
WHERE c."id" = cp."campaignId"
  AND c."contractType" = 'PARTNER_CAMPAIGNS'
  AND c."onChainCampaignId" IS NOT NULL
  AND cp."score" > 0;
