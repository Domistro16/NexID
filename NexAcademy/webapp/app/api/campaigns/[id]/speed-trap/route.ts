import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import prisma from '@/lib/prisma';
import {
    generateSpeedTraps,
    validateSpeedTrap,
} from '@/lib/services/speed-trap.service';

/**
 * GET /api/campaigns/[id]/speed-trap
 *
 * Resolve configured speed traps for the current user's campaign.
 * Speed traps are attached to grouped-module transitions and fire
 * after a grouped module completes, before the next one begins.
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

    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { modules: true },
    });

    if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const traps = await generateSpeedTraps(campaignId, auth.user.userId, campaign.modules);

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
