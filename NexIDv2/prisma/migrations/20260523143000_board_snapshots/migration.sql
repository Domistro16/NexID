CREATE TABLE "BoardSnapshot" (
  "id" TEXT NOT NULL,
  "boardKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BoardSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardSnapshot_boardKey_createdAt_idx" ON "BoardSnapshot"("boardKey", "createdAt");
