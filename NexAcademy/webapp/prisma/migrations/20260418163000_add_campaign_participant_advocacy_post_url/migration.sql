ALTER TABLE "CampaignParticipant"
  ADD COLUMN IF NOT EXISTS "advocacyPostUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "advocacySubmittedAt" TIMESTAMP(3);
