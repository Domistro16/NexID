-- CreateTable
CREATE TABLE "ClaimableBalanceLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'claimable',
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "referenceId" TEXT,
    "metadata" JSONB,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimableBalanceLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimableBalanceLedger_sourceType_sourceId_entryType_key" ON "ClaimableBalanceLedger"("sourceType", "sourceId", "entryType");

-- CreateIndex
CREATE INDEX "ClaimableBalanceLedger_userId_status_idx" ON "ClaimableBalanceLedger"("userId", "status");

-- CreateIndex
CREATE INDEX "ClaimableBalanceLedger_userId_sourceType_status_idx" ON "ClaimableBalanceLedger"("userId", "sourceType", "status");

-- CreateIndex
CREATE INDEX "ClaimableBalanceLedger_referenceId_idx" ON "ClaimableBalanceLedger"("referenceId");

-- AddForeignKey
ALTER TABLE "ClaimableBalanceLedger" ADD CONSTRAINT "ClaimableBalanceLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
