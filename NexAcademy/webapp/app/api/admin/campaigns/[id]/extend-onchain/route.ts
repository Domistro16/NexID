import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import { getCampaignRelayer } from '@/lib/services/campaign-relayer.service';

/**
 * GET /api/admin/campaigns/[id]/extend-onchain
 *
 * Returns the current on-chain campaign params needed to build an
 * updateCampaign transaction to be signed by the owner wallet in the browser.
 */
export async function GET(
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
    const onChainParams = await relayer.getPartnerCampaignUpdateParams(
        campaign.onChainCampaignId,
        campaign.partnerContractAddress,
    );

    if (!onChainParams) {
        return NextResponse.json(
            { error: 'Failed to read on-chain campaign data' },
            { status: 502 },
        );
    }

    return NextResponse.json({
        onChainCampaignId: campaign.onChainCampaignId,
        contractAddress: campaign.partnerContractAddress,
        params: {
            ...onChainParams,
            prizePool: onChainParams.prizePool.toString(),
        },
    });
}

/**
 * POST /api/admin/campaigns/[id]/extend-onchain
 *
 * Syncs the new endAt to the DB after the owner has sent the updateCampaign
 * transaction from their own wallet. No private key required on the server.
 *
 * Body: { newEndTimestamp: number, txHash?: string }
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

    const body = await request.json().catch(() => ({}));

    const newEndTimestamp = typeof body.newEndTimestamp === 'number' ? body.newEndTimestamp : null;
    if (!newEndTimestamp || newEndTimestamp <= 0) {
        return NextResponse.json(
            { error: 'Provide newEndTimestamp (unix seconds)' },
            { status: 400 },
        );
    }

    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true },
    });

    if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    await prisma.campaign.update({
        where: { id: campaignId },
        data: { endAt: new Date(newEndTimestamp * 1000) },
    });

    return NextResponse.json({
        synced: true,
        newEndTimestamp,
        newEndAt: new Date(newEndTimestamp * 1000).toISOString(),
        txHash: body.txHash ?? null,
    });
}
