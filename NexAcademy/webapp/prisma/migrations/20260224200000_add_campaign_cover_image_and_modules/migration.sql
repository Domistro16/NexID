-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "coverImageUrl" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "modules" JSONB NOT NULL DEFAULT '[]';
