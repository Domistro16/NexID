import { NextRequest, NextResponse } from 'next/server';
import { AgentSessionType } from '@prisma/client';
import { getQueueStatus } from '@/lib/services/agent-session.service';

/**
 * GET /api/agent/queue?type=CAMPAIGN_ASSESSMENT
 * Get the queue status for a session type.
 * Public endpoint — shows slot availability and wait time.
 *
 * Strategy: "Queue visible to users ('Your slot: 2h 14m') — this builds
 * anticipation, not frustration."
 */
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');

    if (!type) {
        return NextResponse.json(
            { error: 'type query parameter is required' },
            { status: 400 },
        );
    }

    try {
        const status = await getQueueStatus(type as AgentSessionType);
        return NextResponse.json(status);
    } catch (err) {
        return NextResponse.json(
            { error: 'Invalid session type' },
            { status: 400 },
        );
    }
}
