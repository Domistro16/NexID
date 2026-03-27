import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import { dismissSybilFlag } from '@/lib/services/sybil-detection.service';
import { applyShadowBan, liftShadowBan } from '@/lib/services/shadow-ban.service';

/**
 * GET /api/admin/sybil-flags
 * List sybil flags with optional filters.
 *
 * Query params: ?userId=&reviewed=false&limit=50&offset=0
 */
export async function GET(request: NextRequest) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const reviewed = url.searchParams.get('reviewed');
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (reviewed === 'true') where.reviewed = true;
    if (reviewed === 'false') where.reviewed = false;

    const [flags, total] = await Promise.all([
        prisma.sybilFlag.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            include: {
                user: { select: { walletAddress: true } },
            },
        }),
        prisma.sybilFlag.count({ where }),
    ]);

    return NextResponse.json({ flags, total, limit, offset });
}

/**
 * PATCH /api/admin/sybil-flags
 * Admin actions on sybil flags: dismiss, shadow-ban, or lift shadow-ban.
 *
 * Body: { action: "dismiss" | "shadow_ban" | "lift_shadow_ban", flagId?, userId? }
 */
export async function PATCH(request: NextRequest) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized || !admin.user) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const { action, flagId, userId } = body;

    switch (action) {
        case 'dismiss': {
            if (!flagId) {
                return NextResponse.json({ error: 'flagId is required' }, { status: 400 });
            }
            await dismissSybilFlag(flagId, admin.user.userId);
            return NextResponse.json({ success: true });
        }

        case 'shadow_ban': {
            if (!userId) {
                return NextResponse.json({ error: 'userId is required' }, { status: 400 });
            }
            await applyShadowBan(userId, 'MANUAL_REVIEW', {
                reviewedBy: admin.user.userId,
            });
            return NextResponse.json({ success: true });
        }

        case 'lift_shadow_ban': {
            if (!userId) {
                return NextResponse.json({ error: 'userId is required' }, { status: 400 });
            }
            await liftShadowBan(userId);
            return NextResponse.json({ success: true });
        }

        default:
            return NextResponse.json(
                { error: 'Invalid action. Must be dismiss, shadow_ban, or lift_shadow_ban' },
                { status: 400 },
            );
    }
}
