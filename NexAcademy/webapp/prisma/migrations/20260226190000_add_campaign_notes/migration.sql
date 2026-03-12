-- Encrypted notes for individual campaign pages (admin-only)
CREATE TABLE IF NOT EXISTS "CampaignNote" (
    "id" TEXT PRIMARY KEY,
    "campaignId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "encryptedContent" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignNote_campaignId_fkey"
        FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignNote_authorId_fkey"
        FOREIGN KEY ("authorId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CampaignNote_campaignId_createdAt_idx"
ON "CampaignNote" ("campaignId", "createdAt" DESC);
