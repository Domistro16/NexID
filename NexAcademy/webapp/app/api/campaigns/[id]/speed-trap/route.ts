import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import {
    generateSpeedTraps,
    validateSpeedTrap,
    type GroupStructure,
} from '@/lib/services/speed-trap.service';

/**
 * GET /api/campaigns/[id]/speed-trap?groups=[3,2,4]
 *
 * Generate random speed traps for the current user's campaign.
 * `groups` is a JSON-encoded array of video counts per module group.
 * Returns trap questions with triggerAfterGroup + triggerAfterVideoInGroup
 * (without correct answers).
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

    // Parse group structure from query param
    let groupVideoCounts: number[] = [];
    const groupsParam = url.searchParams.get('groups');
    if (groupsParam) {
        try {
            const parsed = JSON.parse(decodeURIComponent(groupsParam));
            if (Array.isArray(parsed)) {
                groupVideoCounts = parsed.map((v: unknown) => Number(v) || 0);
            }
        } catch {
            // fallback: try legacy moduleCount param
        }
    }

    // Legacy fallback: moduleCount param (treat as single group)
    if (groupVideoCounts.length === 0) {
        const moduleCount = Number(url.searchParams.get('moduleCount') || '0');
        if (moduleCount >= 2) {
            groupVideoCounts = [moduleCount];
        }
    }

    const groups: GroupStructure[] = groupVideoCounts.map((videoCount, i) => ({
        groupIndex: i,
        videoCount,
    }));

    const traps = await generateSpeedTraps(campaignId, auth.user.userId, groups);

    return NextResponse.json({
        traps: traps.map((t) => ({
            id: t.id,
            questionId: t.questionId,
            questionText: t.questionText,
            options: t.options,
            triggerAfterGroup: t.triggerAfterGroup,
            triggerAfterVideoInGroup: t.triggerAfterVideoInGroup,
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
 *   triggerAfterGroup: number;
 *   triggerAfterVideoInGroup: number;
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
        body.triggerAfterGroup ?? 0,
        body.triggerAfterVideoInGroup ?? 0,
        body.responseTimeSeconds ?? 0,
    );

    return NextResponse.json(result);
}
