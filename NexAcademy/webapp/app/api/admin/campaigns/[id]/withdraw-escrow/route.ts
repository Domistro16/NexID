import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import { getCampaignRelayer } from '@/lib/services/campaign-relayer.service';

/**
 * POST /api/admin/campaigns/[id]/withdraw-escrow
 * Withdraw remaining escrow funds after the 30-day grace period.
 * Unclaimed rewards are returned to the owner.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
            id: true,
            status: true,
            escrowId: true,
            escrowAddress: true,
            endAt: true,
        },
    });

    if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status !== 'ENDED') {
        return NextResponse.json(
            { error: 'Campaign must be ENDED before withdrawing escrow' },
            { status: 400 },
        );
    }

    if (campaign.escrowId === null) {
        return NextResponse.json({ error: 'No escrow configured for this campaign' }, { status: 400 });
    }

    // Verify grace period has passed (30 days after endAt)
    if (campaign.endAt) {
        const gracePeriodEnd = new Date(campaign.endAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (new Date() < gracePeriodEnd) {
            return NextResponse.json(
                {
                    error: 'Grace period has not ended yet',
                    gracePeriodEndsAt: gracePeriodEnd.toISOString(),
                },
                { status: 400 },
            );
        }
    }

    const relayer = getCampaignRelayer();

    // Read remaining balance first
    const escrowInfo = await relayer.getEscrowCampaign(campaign.escrowId, campaign.escrowAddress);
    if (!escrowInfo) {
        return NextResponse.json({ error: 'Could not read escrow from chain' }, { status: 502 });
    }

    const remaining = escrowInfo.totalFunded - escrowInfo.totalDistributed;
    if (remaining === 0n) {
        return NextResponse.json({
            withdrawn: false,
            message: 'No remaining funds — all rewards have been claimed',
            totalFunded: escrowInfo.totalFunded.toString(),
            totalDistributed: escrowInfo.totalDistributed.toString(),
        });
    }

    const result = await relayer.withdrawRemainingEscrow(campaign.escrowId, campaign.escrowAddress);
    if (!result.success) {
        return NextResponse.json(
            { error: 'Withdrawal failed', detail: result.error },
            { status: 502 },
        );
    }

    return NextResponse.json({
        withdrawn: true,
        txHash: result.txHash,
        amountWithdrawnRaw: remaining.toString(),
        amountWithdrawnUsdc: (Number(remaining) / 1e6).toFixed(6),
    });
}
