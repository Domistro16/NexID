ALTER TABLE "CampaignParticipant"
  ADD COLUMN IF NOT EXISTS "viewedItemKeys" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
