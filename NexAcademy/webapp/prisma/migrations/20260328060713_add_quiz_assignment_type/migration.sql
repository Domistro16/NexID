/*
  Warnings:

  - You are about to drop the column `elevenLabsSessionId` on the `AgentSession` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'FREE_TEXT');

-- CreateEnum
CREATE TYPE "QuizAssignmentType" AS ENUM ('LIVE_AI', 'NORMAL_MCQ');

-- AlterTable
ALTER TABLE "AgentSession" DROP COLUMN "elevenLabsSessionId",
ADD COLUMN     "providerSessionId" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "onchainConfig" JSONB,
ADD COLUMN     "primaryChain" TEXT NOT NULL DEFAULT 'base';

-- AlterTable
ALTER TABLE "CampaignParticipant" ADD COLUMN     "agentScore" INTEGER,
ADD COLUMN     "compositeScore" INTEGER,
ADD COLUMN     "onchainScore" INTEGER,
ADD COLUMN     "penaltyMultiplier" DOUBLE PRECISION,
ADD COLUMN     "quizAssignment" "QuizAssignmentType",
ADD COLUMN     "quizScore" INTEGER,
ADD COLUMN     "videoScore" INTEGER;

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "questionText" TEXT NOT NULL,
    "variants" JSONB NOT NULL DEFAULT '[]',
    "options" JSONB,
    "correctIndex" INTEGER,
    "gradingRubric" TEXT,
    "points" INTEGER NOT NULL DEFAULT 10,
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSpeedTrap" BOOLEAN NOT NULL DEFAULT false,
    "speedTrapWindow" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "participantId" TEXT NOT NULL,
    "questionIds" JSONB NOT NULL,
    "totalScore" INTEGER,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "timeLimitExceeded" BOOLEAN NOT NULL DEFAULT false,
    "aiContentDetected" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionOrder" INTEGER NOT NULL,
    "selectedIndex" INTEGER,
    "freeTextAnswer" TEXT,
    "shuffledOrder" JSONB,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "aiGradingScore" INTEGER,
    "aiGradingNotes" TEXT,
    "aiContentFlag" BOOLEAN NOT NULL DEFAULT false,
    "aiDetectionConfidence" DOUBLE PRECISION,
    "isFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "followUpFromId" TEXT,
    "shownAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "timeTakenSeconds" INTEGER,

    CONSTRAINT "QuizAttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeedTrapInstance" (
    "id" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "triggerTimestamp" DOUBLE PRECISION NOT NULL,
    "answeredCorrectly" BOOLEAN,
    "timedOut" BOOLEAN NOT NULL DEFAULT false,
    "responseTime" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeedTrapInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnchainVerification" (
    "id" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "amountUsd" DECIMAL(18,6),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnchainVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Question_campaignId_isActive_idx" ON "Question"("campaignId", "isActive");

-- CreateIndex
CREATE INDEX "Question_campaignId_type_idx" ON "Question"("campaignId", "type");

-- CreateIndex
CREATE INDEX "Question_campaignId_isSpeedTrap_idx" ON "Question"("campaignId", "isSpeedTrap");

-- CreateIndex
CREATE INDEX "QuizAttempt_campaignId_idx" ON "QuizAttempt"("campaignId");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_idx" ON "QuizAttempt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAttempt_userId_campaignId_key" ON "QuizAttempt"("userId", "campaignId");

-- CreateIndex
CREATE INDEX "QuizAttemptAnswer_attemptId_idx" ON "QuizAttemptAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "QuizAttemptAnswer_questionId_idx" ON "QuizAttemptAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAttemptAnswer_attemptId_questionId_key" ON "QuizAttemptAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "SpeedTrapInstance_campaignId_userId_idx" ON "SpeedTrapInstance"("campaignId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SpeedTrapInstance_campaignId_userId_questionId_key" ON "SpeedTrapInstance"("campaignId", "userId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "OnchainVerification_participantId_key" ON "OnchainVerification"("participantId");

-- CreateIndex
CREATE INDEX "OnchainVerification_txHash_idx" ON "OnchainVerification"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "OnchainVerification_campaignId_userId_key" ON "OnchainVerification"("campaignId", "userId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CampaignParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttemptAnswer" ADD CONSTRAINT "QuizAttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttemptAnswer" ADD CONSTRAINT "QuizAttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnchainVerification" ADD CONSTRAINT "OnchainVerification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnchainVerification" ADD CONSTRAINT "OnchainVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnchainVerification" ADD CONSTRAINT "OnchainVerification_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CampaignParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
