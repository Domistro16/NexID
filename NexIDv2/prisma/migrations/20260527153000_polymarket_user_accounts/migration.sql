-- CreateTable
CREATE TABLE "PolymarketAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ownerWalletAddress" TEXT NOT NULL,
    "funderAddress" TEXT NOT NULL,
    "signatureType" INTEGER NOT NULL DEFAULT 3,
    "walletType" TEXT NOT NULL DEFAULT 'deposit_wallet',
    "source" TEXT NOT NULL DEFAULT 'polymarket_profile',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "profileName" TEXT,
    "rawProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolymarketAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PolymarketAccount_userId_key" ON "PolymarketAccount"("userId");

-- CreateIndex
CREATE INDEX "PolymarketAccount_ownerWalletAddress_idx" ON "PolymarketAccount"("ownerWalletAddress");

-- CreateIndex
CREATE INDEX "PolymarketAccount_funderAddress_idx" ON "PolymarketAccount"("funderAddress");

-- AddForeignKey
ALTER TABLE "PolymarketAccount" ADD CONSTRAINT "PolymarketAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
