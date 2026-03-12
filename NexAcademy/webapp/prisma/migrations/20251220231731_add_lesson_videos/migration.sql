/*
  Warnings:

  - You are about to drop the column `imageUrl` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `requiredPoints` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `totalLessons` on the `Course` table. All the data in the column will be lost.
  - The primary key for the `Lesson` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `contentUrl` on the `Lesson` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedMinutes` on the `Lesson` table. All the data in the column will be lost.
  - You are about to drop the column `minimumTimeSeconds` on the `Lesson` table. All the data in the column will be lost.
  - You are about to drop the column `order` on the `Lesson` table. All the data in the column will be lost.
  - You are about to drop the column `pointsValue` on the `Lesson` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Lesson` table. All the data in the column will be lost.
  - The primary key for the `Quiz` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `bonusPoints` on the `Quiz` table. All the data in the column will be lost.
  - You are about to drop the column `passed` on the `QuizAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `QuizAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `points` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `pointsEarned` on the `UserCourse` table. All the data in the column will be lost.
  - You are about to drop the column `progress` on the `UserCourse` table. All the data in the column will be lost.
  - You are about to drop the column `txHash` on the `UserCourse` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `UserCourse` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `UserLesson` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `UserLesson` table. All the data in the column will be lost.
  - You are about to drop the column `quizPointsAwarded` on the `UserLesson` table. All the data in the column will be lost.
  - You are about to drop the column `startedAt` on the `UserLesson` table. All the data in the column will be lost.
  - You are about to drop the column `timeSpent` on the `UserLesson` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `UserLesson` table. All the data in the column will be lost.
  - You are about to drop the column `videoProgress` on the `UserLesson` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[courseId,orderIndex]` on the table `Lesson` will be added. If there are existing duplicate values, this will fail.
  - Made the column `longDescription` on table `Course` required. This step will fail if there are existing NULL values in that column.
  - Made the column `instructor` on table `Course` required. This step will fail if there are existing NULL values in that column.
  - Made the column `category` on table `Course` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `level` to the `Course` table without a default value. This is not possible if the table is not empty.
  - Made the column `duration` on table `Course` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `orderIndex` to the `Lesson` table without a default value. This is not possible if the table is not empty.
  - Added the required column `attemptNumber` to the `QuizAttempt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `isPassed` to the `QuizAttempt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `scorePercent` to the `QuizAttempt` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- DropForeignKey
ALTER TABLE "Quiz" DROP CONSTRAINT "Quiz_lessonId_fkey";

-- DropForeignKey
ALTER TABLE "QuizAttempt" DROP CONSTRAINT "QuizAttempt_quizId_fkey";

-- DropForeignKey
ALTER TABLE "UserLesson" DROP CONSTRAINT "UserLesson_lessonId_fkey";

-- DropIndex
DROP INDEX "Course_isActive_idx";

-- DropIndex
DROP INDEX "Course_isPublished_idx";

-- DropIndex
DROP INDEX "Lesson_courseId_idx";

-- DropIndex
DROP INDEX "Lesson_courseId_order_key";

-- DropIndex
DROP INDEX "QuizAttempt_quizId_idx";

-- DropIndex
DROP INDEX "QuizAttempt_userId_idx";

-- DropIndex
DROP INDEX "User_walletAddress_idx";

-- DropIndex
DROP INDEX "UserCourse_courseId_idx";

-- DropIndex
DROP INDEX "UserCourse_onChainSynced_idx";

-- DropIndex
DROP INDEX "UserCourse_userId_idx";

-- DropIndex
DROP INDEX "UserLesson_lessonId_idx";

-- DropIndex
DROP INDEX "UserLesson_userId_idx";

-- AlterTable
ALTER TABLE "Course" DROP COLUMN "imageUrl",
DROP COLUMN "isActive",
DROP COLUMN "requiredPoints",
DROP COLUMN "totalLessons",
ADD COLUMN     "enrollmentCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "minPointsToAccess" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "longDescription" SET NOT NULL,
ALTER COLUMN "instructor" SET NOT NULL,
ALTER COLUMN "category" SET NOT NULL,
DROP COLUMN "level",
ADD COLUMN     "level" "CourseLevel" NOT NULL,
ALTER COLUMN "duration" SET NOT NULL,
ALTER COLUMN "objectives" DROP DEFAULT,
ALTER COLUMN "prerequisites" DROP DEFAULT,
ALTER COLUMN "completionPoints" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_pkey",
DROP COLUMN "contentUrl",
DROP COLUMN "estimatedMinutes",
DROP COLUMN "minimumTimeSeconds",
DROP COLUMN "order",
DROP COLUMN "pointsValue",
DROP COLUMN "type",
ADD COLUMN     "orderIndex" INTEGER NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "videoDuration" DROP DEFAULT,
ADD CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Lesson_id_seq";

-- AlterTable
ALTER TABLE "Quiz" DROP CONSTRAINT "Quiz_pkey",
DROP COLUMN "bonusPoints",
ADD COLUMN     "passPoints" INTEGER NOT NULL DEFAULT 20,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "lessonId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Quiz_id_seq";

-- AlterTable
ALTER TABLE "QuizAttempt" DROP COLUMN "passed",
DROP COLUMN "score",
ADD COLUMN     "attemptNumber" INTEGER NOT NULL,
ADD COLUMN     "isPassed" BOOLEAN NOT NULL,
ADD COLUMN     "passPointsAwarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scorePercent" INTEGER NOT NULL,
ALTER COLUMN "quizId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "points",
ADD COLUMN     "totalPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UserCourse" DROP COLUMN "pointsEarned",
DROP COLUMN "progress",
DROP COLUMN "txHash",
DROP COLUMN "updatedAt",
ADD COLUMN     "enrollTxHash" TEXT,
ADD COLUMN     "isCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "progressPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UserLesson" DROP COLUMN "completedAt",
DROP COLUMN "createdAt",
DROP COLUMN "quizPointsAwarded",
DROP COLUMN "startedAt",
DROP COLUMN "timeSpent",
DROP COLUMN "updatedAt",
DROP COLUMN "videoProgress",
ADD COLUMN     "lastWatchedAt" TIMESTAMP(3),
ADD COLUMN     "watchProgressPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "watchedAt" TIMESTAMP(3),
ALTER COLUMN "lessonId" SET DATA TYPE TEXT;

-- DropEnum
DROP TYPE "LessonType";

-- CreateTable
CREATE TABLE "LessonVideo" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "duration" INTEGER,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonVideo_lessonId_language_key" ON "LessonVideo"("lessonId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_courseId_orderIndex_key" ON "Lesson"("courseId", "orderIndex");

-- AddForeignKey
ALTER TABLE "LessonVideo" ADD CONSTRAINT "LessonVideo_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLesson" ADD CONSTRAINT "UserLesson_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
