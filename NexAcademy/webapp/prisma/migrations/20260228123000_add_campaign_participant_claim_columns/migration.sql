-- Bring CampaignParticipant in sync with prisma/schema.prisma.
-- Some environments were created before claim fields were introduced.
ALTER TABLE "CampaignParticipant"
  ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "claimSignature" TEXT;
