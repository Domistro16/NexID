import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import { completeSession } from '@/lib/services/agent-session.service';

/**
 * POST /api/agent/session/complete
 * Complete an agent session with scoring data.
 *
 * This endpoint is called by the server/webhook after the ElevenLabs
 * session ends. Can also be called by admin to manually score.
 *
 * Body: {
 *   sessionId,
 *   elevenLabsSessionId?,
 *   durationSeconds,
 *   depthScore?,       // 0-100
 *   accuracyScore?,    // 0-100
 *   originalityScore?, // 0-100
 *   overallScore?,     // 0-100
 *   scoringNotes?,     // JSON
 *   transcript?        // JSON array
 * }
 */
export async function POST(request: NextRequest) {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, ...data } = body;

    if (!sessionId || typeof data.durationSeconds !== 'number') {
        return NextResponse.json(
            { error: 'sessionId and durationSeconds are required' },
            { status: 400 },
        );
    }

    try {
        const result = await completeSession(sessionId, data);
        return NextResponse.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to complete session';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
