import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import { syncUserTotalPointsFromOnChain } from '@/lib/services/onchain-points.service';

export async function GET(request: NextRequest) {
    try {
        const auth = verifyAuth(request);
        if (!auth) {
            return unauthorizedResponse();
        }

        const user = await prisma.user.findUnique({
            where: { id: auth.userId },
            select: {
                id: true,
                walletAddress: true,
                totalPoints: true,
                createdAt: true,
                enrollments: {
                    include: {
                        course: {
                            select: {
                                id: true,
                                title: true,
                                category: true,
                            },
                        },
                    },
                    orderBy: { enrolledAt: 'desc' },
                },
            },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const totalPoints = await syncUserTotalPointsFromOnChain(user.id, user.walletAddress);

        return NextResponse.json({
            user: {
                ...user,
                totalPoints,
            },
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch profile' },
            { status: 500 }
        );
    }
}
