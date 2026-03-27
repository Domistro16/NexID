import { NextRequest, NextResponse } from 'next/server';
import { PartnerVerificationStatus, PartnerTier } from '@prisma/client';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import {
    listPartnersForReview,
    approvePartner,
    rejectPartner,
} from '@/lib/services/partner-verification.service';

const VALID_STATUSES = new Set<string>([
    'UNVERIFIED',
    'PENDING_REVIEW',
    'VERIFIED',
    'REJECTED',
]);

const VALID_TIERS = new Set<string>(['STANDARD', 'PREMIUM', 'ENTERPRISE']);

/**
 * GET /api/admin/partners
 * List partners with optional verification status filter.
 *
 * Query: ?status=PENDING_REVIEW
 */
export async function GET(request: NextRequest) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const statusFilter =
        statusParam && VALID_STATUSES.has(statusParam)
            ? (statusParam as PartnerVerificationStatus)
            : undefined;

    const partners = await listPartnersForReview(statusFilter);
    return NextResponse.json({ partners });
}

/**
 * PATCH /api/admin/partners
 * Approve or reject a partner's verification.
 *
 * Body: { partnerId, action: "approve" | "reject", reason?, tier? }
 */
export async function PATCH(request: NextRequest) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized || !admin.user) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const { partnerId, action, reason, tier } = body;

    if (!partnerId) {
        return NextResponse.json({ error: 'partnerId is required' }, { status: 400 });
    }

    switch (action) {
        case 'approve': {
            const partnerTier =
                tier && VALID_TIERS.has(tier)
                    ? (tier as PartnerTier)
                    : undefined;
            await approvePartner(partnerId, admin.user.userId, partnerTier);
            return NextResponse.json({ success: true });
        }

        case 'reject': {
            if (!reason) {
                return NextResponse.json(
                    { error: 'reason is required for rejection' },
                    { status: 400 },
                );
            }
            await rejectPartner(partnerId, admin.user.userId, reason);
            return NextResponse.json({ success: true });
        }

        default:
            return NextResponse.json(
                { error: 'action must be "approve" or "reject"' },
                { status: 400 },
            );
    }
}
