import { NextRequest, NextResponse } from 'next/server';
import { AgentSessionType } from '@prisma/client';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import {
    requestSession,
    getUserSessions,
    checkEligibility,
} from '@/lib/services/agent-session.service';

const VALID_SESSION_TYPES = new Set<string>([
    'CAMPAIGN_ASSESSMENT',
    'CHARTERED_INTERVIEW',
    'SCORE_DISPUTE',
    'SECURITY_SIMULATION',
    'CAMPAIGN_DISCOVERY',
    'PRE_QUIZ_QA',
]);

/**
 * GET /api/agent/session
 * Get the user's agent session history.
 */
export async function GET(request: NextRequest) {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const sessions = await getUserSessions(auth.user.userId);
    return NextResponse.json({ sessions });
}

/**
 * POST /api/agent/session
 * Request a new agent session slot.
 *
 * Body: { sessionType, campaignId? }
 */
export async function POST(request: NextRequest) {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const { sessionType, campaignId } = body;

    if (!sessionType || !VALID_SESSION_TYPES.has(sessionType)) {
        return NextResponse.json(
            { error: 'Invalid session type' },
            { status: 400 },
        );
    }

    // Campaign assessment requires a campaignId
    if (
        ['CAMPAIGN_ASSESSMENT', 'PRE_QUIZ_QA', 'SECURITY_SIMULATION'].includes(sessionType) &&
        !campaignId
    ) {
        return NextResponse.json(
            { error: 'campaignId is required for this session type' },
            { status: 400 },
        );
    }

    try {
        const result = await requestSession(
            auth.user.userId,
            sessionType as AgentSessionType,
            campaignId ?? undefined,
        );
        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to request session';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
