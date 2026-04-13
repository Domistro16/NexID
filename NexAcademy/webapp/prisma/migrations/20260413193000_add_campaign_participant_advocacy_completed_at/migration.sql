ALTER TABLE "CampaignParticipant"
  ADD COLUMN IF NOT EXISTS "advocacyCompletedAt" TIMESTAMP(3);
