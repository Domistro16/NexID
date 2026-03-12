import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const auth = verifyAuth(request);
        if (!auth) {
            return unauthorizedResponse();
        }

        const [
            enrolledCount,
            completedCount,
            lessonsCompleted,
            quizzesPassed,
        ] = await Promise.all([
            prisma.userCourse.count({
                where: { userId: auth.userId },
            }),
            prisma.userCourse.count({
                where: {
                    userId: auth.userId,
                    isCompleted: true,
                },
            }),
            prisma.userLesson.count({
                where: {
                    userId: auth.userId,
                    isWatched: true,
                },
            }),
            // QuizAttempt model not yet in schema — return 0 until it is added
            Promise.resolve(0),
        ]);

        const user = await prisma.user.findUnique({
            where: { id: auth.userId },
            select: { totalPoints: true },
        });

        return NextResponse.json({
            coursesEnrolled: enrolledCount,
            coursesCompleted: completedCount,
            lessonsCompleted,
            quizzesPassed,
            totalPoints: user?.totalPoints || 0,
        });
    } catch (error) {
        console.error('Stats fetch error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch stats' },
            { status: 500 }
        );
    }
}
