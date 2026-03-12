-- Add discordId and discordUsername to User table for Discord OAuth linking
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discordId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discordUsername" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_discordId_key" ON "User"("discordId");
