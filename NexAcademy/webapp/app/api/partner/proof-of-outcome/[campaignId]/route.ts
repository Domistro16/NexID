import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import { getProtocolProofOfOutcome } from '@/lib/services/proof-of-outcome.service';

/**
 * GET /api/partner/proof-of-outcome/[campaignId]
 *
 * Protocol-specific Proof of Outcome dashboard — campaign-specific deep analytics.
 * Authenticated + partner must own the campaign.
 *
 * Data points:
 * - Campaign bot removal rate
 * - Per-campaign completion rate & quiz scores
 * - On-chain action failure points
 * - 30-day post-campaign return rate (powered by weekly passport scan)
 * - Score distribution for this campaign
 * - User quality segments (full breakdown)
 * - Post-campaign volume generated
 * - Platform benchmark comparison (their campaign vs. average)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ campaignId: string }> },
) {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { campaignId: campaignIdStr } = await params;
    const campaignId = Number(campaignIdStr);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    // Verify partner owns this campaign
    const partner = await prisma.partner.findUnique({
        where: { userId: auth.user.userId },
    });

    if (!partner) {
        // Allow admins to view any campaign's proof of outcome
        const user = await prisma.user.findUnique({
            where: { id: auth.user.userId },
            select: { isAdmin: true },
        });
        if (!user?.isAdmin) {
            return NextResponse.json(
                { error: 'Partner profile not found' },
                { status: 403 },
            );
        }
    } else {
        // Check campaign belongs to this partner
        const campaign = await prisma.campaign.findUnique({
            where: { id: campaignId },
            select: { sponsorName: true },
        });
        if (!campaign || campaign.sponsorName !== partner.orgName) {
            return NextResponse.json(
                { error: 'Campaign not found or not owned by your organisation' },
                { status: 404 },
            );
        }
    }

    try {
        const data = await getProtocolProofOfOutcome(campaignId);
        if (!data) {
            return NextResponse.json(
                { error: 'Campaign not found' },
                { status: 404 },
            );
        }
        return NextResponse.json(data);
    } catch (error) {
        console.error(
            `[ProofOfOutcome] Protocol dashboard error for campaign ${campaignId}:`,
            error,
        );
        return NextResponse.json(
            { error: 'Failed to generate proof of outcome' },
            { status: 500 },
        );
    }
}
