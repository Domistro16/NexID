/**
 * Recalculate User Points Script
 * 
 * This script recalculates all user points based on their actual progress in the database.
 * Run with: npx ts-node scripts/recalculate-points.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function recalculatePoints() {
    console.log('Starting points recalculation...\n');

    // Get all users
    const users = await prisma.user.findMany({
        select: { id: true, walletAddress: true, totalPoints: true },
    });

    console.log(`Found ${users.length} users to process\n`);

    for (const user of users) {
        let calculatedPoints = 0;
        const breakdown: string[] = [];

        // 1. Points from watched lessons
        const watchedLessons = await prisma.userLesson.findMany({
            where: { userId: user.id, isWatched: true },
            include: { lesson: true },
        });

        for (const ul of watchedLessons) {
            if (ul.lesson) {
                calculatedPoints += ul.lesson.watchPoints;
                breakdown.push(`  - Watched "${ul.lesson.title}": +${ul.lesson.watchPoints} pts`);
            }
        }

        // 2. Points from passed quizzes (first pass only)
        const passedQuizzes = await prisma.quizAttempt.findMany({
            where: { userId: user.id, isPassed: true },
            include: { quiz: true },
            orderBy: { createdAt: 'asc' },
        });

        // Group by quizId to only count first pass
        const quizPointsAwarded = new Set<string>();
        for (const attempt of passedQuizzes) {
            if (!quizPointsAwarded.has(attempt.quizId)) {
                quizPointsAwarded.add(attempt.quizId);
                calculatedPoints += attempt.quiz.passPoints;
                breakdown.push(`  - Passed quiz (${attempt.quizId}): +${attempt.quiz.passPoints} pts`);
            }
        }

        // 3. Points from completed courses
        const completedCourses = await prisma.userCourse.findMany({
            where: { userId: user.id, isCompleted: true },
            include: { course: true },
        });

        for (const uc of completedCourses) {
            if (uc.course) {
                calculatedPoints += uc.course.completionPoints;
                breakdown.push(`  - Completed "${uc.course.title}": +${uc.course.completionPoints} pts`);
            }
        }

        // Check if update is needed
        const difference = calculatedPoints - user.totalPoints;

        console.log(`\n📊 User: ${user.walletAddress || user.id}`);
        console.log(`   Current points: ${user.totalPoints}`);
        console.log(`   Calculated points: ${calculatedPoints}`);

        if (breakdown.length > 0) {
            console.log('   Breakdown:');
            breakdown.forEach(b => console.log(b));
        }

        if (difference !== 0) {
            console.log(`   ⚠️  Difference: ${difference > 0 ? '+' : ''}${difference}`);

            // Update user points
            await prisma.user.update({
                where: { id: user.id },
                data: { totalPoints: calculatedPoints },
            });
            console.log(`   ✅ Updated points to ${calculatedPoints}`);

            // Also update watchPointsAwarded flag for lessons that were watched
            await prisma.userLesson.updateMany({
                where: { userId: user.id, isWatched: true },
                data: { watchPointsAwarded: true },
            });

            // Update completionPointsAwarded for completed courses
            await prisma.userCourse.updateMany({
                where: { userId: user.id, isCompleted: true },
                data: { completionPointsAwarded: true },
            });
        } else {
            console.log('   ✓ Points are correct');
        }
    }

    console.log('\n\n✅ Points recalculation complete!');
}

recalculatePoints()
    .catch((error) => {
        console.error('Error recalculating points:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
