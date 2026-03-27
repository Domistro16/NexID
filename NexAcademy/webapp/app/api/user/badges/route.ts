import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import {
    getUserBadges,
    getDisplayBadges,
    setDisplayBadges,
} from '@/lib/services/badge-engine.service';

/**
 * GET /api/user/badges
 *
 * Returns all badges earned by the authenticated user, plus their
 * currently selected display badges (max 3).
 */
export async function GET(request: NextRequest) {
    const auth = verifyAuth(request);
    if (!auth) return unauthorizedResponse();

    const [allBadges, displayBadges] = await Promise.all([
        getUserBadges(auth.userId),
        getDisplayBadges(auth.userId),
    ]);

    return NextResponse.json({
        badges: allBadges,
        displayBadges,
        totalEarned: allBadges.length,
    });
}

/**
 * PUT /api/user/badges
 *
 * Set the user's selected display badges (max 3 badge IDs).
 * Body: { badgeIds: string[] }
 */
export async function PUT(request: NextRequest) {
    const auth = verifyAuth(request);
    if (!auth) return unauthorizedResponse();

    const body = await request.json();
    const { badgeIds } = body;

    if (!Array.isArray(badgeIds)) {
        return NextResponse.json(
            { error: 'badgeIds must be an array' },
            { status: 400 },
        );
    }

    if (badgeIds.length > 3) {
        return NextResponse.json(
            { error: 'Maximum 3 display badges allowed' },
            { status: 400 },
        );
    }

    try {
        await setDisplayBadges(auth.userId, badgeIds);
        const displayBadges = await getDisplayBadges(auth.userId);
        return NextResponse.json({ displayBadges });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update';
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
