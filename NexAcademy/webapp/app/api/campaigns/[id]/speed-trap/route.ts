import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import {
    generateSpeedTraps,
    validateSpeedTrap,
} from '@/lib/services/speed-trap.service';

/**
 * GET /api/campaigns/[id]/speed-trap?videoDuration=90
 *
 * Generate random speed traps for the current user's video session.
 * Returns trap questions with trigger timestamps (without correct answers).
 */
export async function GET(
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
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    const url = new URL(request.url);
    const videoDuration = Number(url.searchParams.get('videoDuration') || '90');

    const traps = await generateSpeedTraps(campaignId, auth.user.userId, videoDuration);

    return NextResponse.json({
        traps: traps.map((t) => ({
            id: t.id,
            questionId: t.questionId,
            questionText: t.questionText,
            options: t.options,
            triggerTimestamp: t.triggerTimestamp,
            windowSeconds: t.windowSeconds,
        })),
    });
}

/**
 * POST /api/campaigns/[id]/speed-trap
 *
 * Submit a speed trap answer for validation.
 *
 * Body: {
 *   questionId: string;
 *   selectedIndex: number;
 *   triggerTimestamp: number;
 *   responseTimeSeconds: number;
 * }
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
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    const body = await request.json();
    if (!body.questionId || typeof body.selectedIndex !== 'number') {
        return NextResponse.json({ error: 'Missing questionId or selectedIndex' }, { status: 400 });
    }

    const result = await validateSpeedTrap(
        campaignId,
        auth.user.userId,
        body.questionId,
        body.selectedIndex,
        body.triggerTimestamp ?? 0,
        body.responseTimeSeconds ?? 0,
    );

    return NextResponse.json(result);
}
