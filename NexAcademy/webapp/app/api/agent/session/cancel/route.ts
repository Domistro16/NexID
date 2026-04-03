import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import prisma from '@/lib/prisma';

/**
 * POST /api/agent/session/cancel
 *
 * Cancels a non-completed session owned by the authenticated user.
 * Used when a connection error occurs and the user wants to retry.
 *
 * Body: { sessionId }
 */
export async function POST(request: NextRequest) {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    let body: { sessionId?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { sessionId } = body;
    if (!sessionId) {
        return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const updated = await prisma.agentSession.updateMany({
        where: {
            id: sessionId,
            userId: auth.user.userId,
            OR: [
                { status: { notIn: ['COMPLETED'] } },
                {
                    status: 'COMPLETED',
                    overallScore: null,
                    sessionType: { in: ['CAMPAIGN_ASSESSMENT', 'CHARTERED_INTERVIEW', 'SECURITY_SIMULATION'] },
                },
            ],
        },
        data: { status: 'CANCELLED' },
    });

    if (updated.count === 0) {
        return NextResponse.json(
            { error: 'Session not found or already completed' },
            { status: 404 },
        );
    }

    return NextResponse.json({ success: true });
}
