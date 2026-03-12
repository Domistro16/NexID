-- Create enum for SCORM package versioning
DO $$
BEGIN
  CREATE TYPE "ScormVersion" AS ENUM ('SCORM_12', 'SCORM_2004');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Ensure completion tx type exists
DO $$
BEGIN
  ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'COMPLETE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Course dual-mode + SCORM metadata
ALTER TABLE "Course"
ADD COLUMN IF NOT EXISTS "isIncentivized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "scormVersion" "ScormVersion",
ADD COLUMN IF NOT EXISTS "scormLaunchUrl" TEXT,
ADD COLUMN IF NOT EXISTS "scormManifestPath" TEXT,
ADD COLUMN IF NOT EXISTS "scormPackageVersion" INTEGER NOT NULL DEFAULT 1;

-- UserCourse scoring/claim fields
ALTER TABLE "UserCourse"
ADD COLUMN IF NOT EXISTS "quizScore" INTEGER,
ADD COLUMN IF NOT EXISTS "engagementTimeScore" INTEGER,
ADD COLUMN IF NOT EXISTS "baseScore" INTEGER,
ADD COLUMN IF NOT EXISTS "actionBoostMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "idMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "finalScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "leaderboardEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "completionFlags" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "proofSigned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "proofSignedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "dappVisitTracked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "dappVisitedAt" TIMESTAMP(3);

-- SCORM runtime snapshots
CREATE TABLE IF NOT EXISTS "ScormRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "courseId" INTEGER NOT NULL,
  "cmiState" JSONB NOT NULL,
  "completionStatus" TEXT,
  "successStatus" TEXT,
  "rawScore" DOUBLE PRECISION,
  "scaledScore" DOUBLE PRECISION,
  "normalizedScore" INTEGER,
  "totalTimeSeconds" INTEGER NOT NULL DEFAULT 0,
  "initializedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCommitAt" TIMESTAMP(3),
  "terminatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScormRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScormRun_userId_courseId_key" ON "ScormRun"("userId", "courseId");
CREATE INDEX IF NOT EXISTS "ScormRun_courseId_normalizedScore_idx" ON "ScormRun"("courseId", "normalizedScore");

ALTER TABLE "ScormRun"
ADD CONSTRAINT "ScormRun_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScormRun"
ADD CONSTRAINT "ScormRun_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nonce replay protection for claim signatures
CREATE TABLE IF NOT EXISTS "ScoreActionNonce" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "courseId" INTEGER NOT NULL,
  "nonce" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScoreActionNonce_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScoreActionNonce_nonce_key" ON "ScoreActionNonce"("nonce");
CREATE INDEX IF NOT EXISTS "ScoreActionNonce_userId_courseId_idx" ON "ScoreActionNonce"("userId", "courseId");

ALTER TABLE "ScoreActionNonce"
ADD CONSTRAINT "ScoreActionNonce_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScoreActionNonce"
ADD CONSTRAINT "ScoreActionNonce_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Leaderboard indexes
CREATE INDEX IF NOT EXISTS "Course_isIncentivized_idx" ON "Course"("isIncentivized");
CREATE INDEX IF NOT EXISTS "UserCourse_courseId_leaderboardEligible_idx" ON "UserCourse"("courseId", "leaderboardEligible");
CREATE INDEX IF NOT EXISTS "UserCourse_courseId_finalScore_idx" ON "UserCourse"("courseId", "finalScore");
