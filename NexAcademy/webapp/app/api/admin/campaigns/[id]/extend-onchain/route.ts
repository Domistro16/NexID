import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import { getCampaignRelayer } from '@/lib/services/campaign-relayer.service';

/**
 * POST /api/admin/campaigns/[id]/extend-onchain
 *
 * Extends the on-chain campaign end time by calling updateCampaign on the
 * PartnerCampaigns contract. Also updates endAt in the DB.
 *
 * Body: { newEndTimestamp: number }  (Unix seconds)
 *   OR  { additionalDays: number }   (days from now)
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
            contractType: true,
            onChainCampaignId: true,
            partnerContractAddress: true,
        },
    });

    if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.contractType !== 'PARTNER_CAMPAIGNS') {
        return NextResponse.json(
            { error: 'End time extension is only supported for PARTNER_CAMPAIGNS' },
            { status: 400 },
        );
    }

    if (campaign.onChainCampaignId === null) {
        return NextResponse.json(
            { error: 'Campaign has not been deployed on-chain yet' },
            { status: 400 },
        );
    }

    const relayer = getCampaignRelayer();
    if (!relayer.isOwnerConfigured()) {
        return NextResponse.json(
            { error: 'OWNER_PRIVATE_KEY not configured' },
            { status: 503 },
        );
    }

    const body = await request.json().catch(() => ({}));

    let newEndTimestamp: number;
    if (typeof body.newEndTimestamp === 'number' && body.newEndTimestamp > 0) {
        newEndTimestamp = body.newEndTimestamp;
    } else if (typeof body.additionalDays === 'number' && body.additionalDays > 0) {
        newEndTimestamp = Math.floor(Date.now() / 1000) + body.additionalDays * 86400;
    } else {
        return NextResponse.json(
            { error: 'Provide newEndTimestamp (unix seconds) or additionalDays' },
            { status: 400 },
        );
    }

    const result = await relayer.extendPartnerCampaignOnChain(
        campaign.onChainCampaignId,
        newEndTimestamp,
        campaign.partnerContractAddress,
    );

    if (!result.success) {
        return NextResponse.json(
            { error: 'On-chain extension failed', detail: result.error },
            { status: 502 },
        );
    }

    // Sync new endAt to DB
    await prisma.campaign.update({
        where: { id: campaignId },
        data: { endAt: new Date(newEndTimestamp * 1000) },
    });

    return NextResponse.json({
        extended: true,
        newEndTimestamp,
        newEndAt: new Date(newEndTimestamp * 1000).toISOString(),
        txHash: result.txHash,
    });
}
