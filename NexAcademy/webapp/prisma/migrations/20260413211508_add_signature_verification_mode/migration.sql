-- AlterEnum
ALTER TYPE "BadgeType" ADD VALUE 'PROTOCOL_ADVOCATE';

-- AlterTable
ALTER TABLE "OnchainVerification" ADD COLUMN     "signature" TEXT,
ADD COLUMN     "signedMessage" TEXT,
ADD COLUMN     "verificationMode" TEXT NOT NULL DEFAULT 'transaction',
ALTER COLUMN "txHash" DROP NOT NULL;
