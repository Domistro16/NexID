-- AlterTable
ALTER TABLE "AgentSession" ADD COLUMN     "nonce" TEXT,
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3);
