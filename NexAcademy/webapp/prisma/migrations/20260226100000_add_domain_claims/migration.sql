-- Domain claims for the NexID campaign course
-- First 500 completions can claim a free 5-character domain name
CREATE TABLE IF NOT EXISTS "DomainClaim" (
    "id" TEXT PRIMARY KEY,
    "campaignId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "domainName" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DomainClaim_campaignId_fkey"
        FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DomainClaim_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- One claim per user per campaign
CREATE UNIQUE INDEX IF NOT EXISTS "DomainClaim_campaignId_userId_key"
ON "DomainClaim" ("campaignId", "userId");

-- Domain name must be unique globally
CREATE UNIQUE INDEX IF NOT EXISTS "DomainClaim_domainName_key"
ON "DomainClaim" ("domainName");

-- Index for counting claims per campaign efficiently
CREATE INDEX IF NOT EXISTS "DomainClaim_campaignId_idx"
ON "DomainClaim" ("campaignId");
