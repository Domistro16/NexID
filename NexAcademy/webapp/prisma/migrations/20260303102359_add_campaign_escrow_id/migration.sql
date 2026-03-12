/*
  Warnings:

  - You are about to drop the column `discordId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `discordUsername` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `CampaignNote` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DomainClaim` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CampaignNote" DROP CONSTRAINT "CampaignNote_authorId_fkey";

-- DropForeignKey
ALTER TABLE "CampaignNote" DROP CONSTRAINT "CampaignNote_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "DomainClaim" DROP CONSTRAINT "DomainClaim_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "DomainClaim" DROP CONSTRAINT "DomainClaim_userId_fkey";

-- DropIndex
DROP INDEX "User_discordId_key";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "claimMerkleRoot" TEXT,
ADD COLUMN     "claimTreeJson" JSONB,
ADD COLUMN     "escrowId" INTEGER,
ADD COLUMN     "rewardSchedule" JSONB,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CampaignParticipant" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CampaignRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "discordId",
DROP COLUMN "discordUsername";

-- DropTable
DROP TABLE "CampaignNote";

-- DropTable
DROP TABLE "DomainClaim";
