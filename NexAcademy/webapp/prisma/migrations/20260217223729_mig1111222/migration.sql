/*
  Warnings:

  - You are about to drop the column `quizScore` on the `UserCourse` table. All the data in the column will be lost.
  - You are about to drop the `Quiz` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `QuizAttempt` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Quiz" DROP CONSTRAINT "Quiz_lessonId_fkey";

-- DropForeignKey
ALTER TABLE "QuizAttempt" DROP CONSTRAINT "QuizAttempt_quizId_fkey";

-- DropForeignKey
ALTER TABLE "QuizAttempt" DROP CONSTRAINT "QuizAttempt_userId_fkey";

-- AlterTable
ALTER TABLE "UserCourse" DROP COLUMN "quizScore";

-- DropTable
DROP TABLE "Quiz";

-- DropTable
DROP TABLE "QuizAttempt";
