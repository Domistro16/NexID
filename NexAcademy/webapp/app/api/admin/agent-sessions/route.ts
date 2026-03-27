import { NextRequest, NextResponse } from 'next/server';
import { AgentSessionType } from '@prisma/client';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import { cancelSession, getQueueStatus } from '@/lib/services/agent-session.service';

/**
 * GET /api/admin/agent-sessions
 * Admin view of agent sessions with filtering.
 *
 * Query: ?type=&status=&userId=&limit=50&offset=0
 */
export async function GET(request: NextRequest) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    const userId = url.searchParams.get('userId');
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;

    const where: Record<string, unknown> = {};
    if (type) where.sessionType = type;
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const [sessions, total] = await Promise.all([
        prisma.agentSession.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            include: {
                user: { select: { walletAddress: true } },
            },
        }),
        prisma.agentSession.count({ where }),
    ]);

    // Get queue status for all types
    const types: AgentSessionType[] = [
        'CAMPAIGN_ASSESSMENT',
        'CHARTERED_INTERVIEW',
        'PROTOCOL_ONBOARDING',
        'SCORE_DISPUTE',
        'SECURITY_SIMULATION',
        'PROOF_OF_OUTCOME_BRIEFING',
        'CAMPAIGN_DISCOVERY',
        'PRE_QUIZ_QA',
    ];
    const queues = await Promise.all(types.map((t) => getQueueStatus(t)));

    return NextResponse.json({ sessions, total, limit, offset, queues });
}

/**
 * DELETE /api/admin/agent-sessions
 * Cancel an agent session (admin action).
 *
 * Body: { sessionId }
 */
export async function DELETE(request: NextRequest) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
        return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    try {
        await cancelSession(sessionId);
        return NextResponse.json({ success: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel session';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
