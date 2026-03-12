CREATE TABLE IF NOT EXISTS "DomainClaim" (
    "id" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "domainName" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainClaim_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DomainClaim_campaignId_fkey"
        FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DomainClaim_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DomainClaim_campaignId_userId_key"
ON "DomainClaim" ("campaignId", "userId");

CREATE UNIQUE INDEX IF NOT EXISTS "DomainClaim_domainName_key"
ON "DomainClaim" ("domainName");

CREATE INDEX IF NOT EXISTS "DomainClaim_campaignId_idx"
ON "DomainClaim" ("campaignId");
