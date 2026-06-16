-- CreateTable
CREATE TABLE "ProofFlowReviewerAccess" (
    "id" TEXT NOT NULL,
    "accessId" TEXT NOT NULL,
    "reviewerWallet" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "keyHash" TEXT NOT NULL,
    "keySalt" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofFlowReviewerAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProofFlowReviewerAccess_accessId_key" ON "ProofFlowReviewerAccess"("accessId");

-- CreateIndex
CREATE INDEX "ProofFlowReviewerAccess_reviewerWallet_idx" ON "ProofFlowReviewerAccess"("reviewerWallet");

-- CreateIndex
CREATE INDEX "ProofFlowReviewerAccess_status_idx" ON "ProofFlowReviewerAccess"("status");

-- CreateIndex
CREATE INDEX "ProofFlowReviewerAccess_reviewerUserId_idx" ON "ProofFlowReviewerAccess"("reviewerUserId");

-- AddForeignKey
ALTER TABLE "ProofFlowReviewerAccess" ADD CONSTRAINT "ProofFlowReviewerAccess_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
