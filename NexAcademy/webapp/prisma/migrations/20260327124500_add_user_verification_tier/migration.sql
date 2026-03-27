-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'VerificationTier'
    ) THEN
        CREATE TYPE "VerificationTier" AS ENUM ('NONE', 'BASIC', 'VERIFIED', 'EXPERT');
    END IF;
END
$$;

-- AlterTable
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "verificationTier" "VerificationTier";

ALTER TABLE "User"
    ALTER COLUMN "verificationTier" SET DEFAULT 'NONE';

UPDATE "User"
SET "verificationTier" = 'NONE'
WHERE "verificationTier" IS NULL;

ALTER TABLE "User"
    ALTER COLUMN "verificationTier" SET NOT NULL;
