import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import { checkEngagementIntegrity } from '@/lib/services/engagement-integrity.service';

/**
 * POST /api/campaigns/[id]/engagement
 *
 * Receives engagement integrity signals from the client (heartbeat timestamps,
 * tab focus events, mouse movements) and runs server-side analysis.
 *
 * Called by the SCORM player / video player on session end.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 });
    }

    const body = await request.json();
    const {
        heartbeatTimestamps = [],
        tabBlurEvents = [],
        mouseMovements = [],
    } = body;

    if (!Array.isArray(heartbeatTimestamps) || !Array.isArray(tabBlurEvents) || !Array.isArray(mouseMovements)) {
        return NextResponse.json({ error: 'Invalid engagement data format' }, { status: 400 });
    }

    const report = await checkEngagementIntegrity(
        auth.user.userId,
        campaignId,
        { heartbeatTimestamps, tabBlurEvents, mouseMovements },
    );

    // Return a minimal response — don't expose flag details to the client
    return NextResponse.json({
        received: true,
        heartbeatCount: report.heartbeat.heartbeatCount,
    });
}
