CREATE TABLE "TelegramConnectToken" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "userId" TEXT,
  "walletAddress" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramConnectToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramConnectToken_token_key" ON "TelegramConnectToken"("token");
CREATE INDEX "TelegramConnectToken_userId_idx" ON "TelegramConnectToken"("userId");
CREATE INDEX "TelegramConnectToken_walletAddress_idx" ON "TelegramConnectToken"("walletAddress");
CREATE INDEX "TelegramConnectToken_expiresAt_idx" ON "TelegramConnectToken"("expiresAt");
