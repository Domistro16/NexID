import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { config } from '@/lib/config';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import { getCampaignModuleCount } from '@/lib/campaign-modules';

const PLAN_ENUM_MAP: Record<string, number> = {
    LAUNCH_SPRINT: 0,
    DEEP_DIVE: 1,
    CUSTOM: 2,
};

const PLAN_DURATION_DAYS: Record<string, number> = {
    LAUNCH_SPRINT: 7,
    DEEP_DIVE: 30,
    CUSTOM: 180,
};

const PLAN_DURATION_LABEL: Record<string, string> = {
    LAUNCH_SPRINT: '7 days',
    DEEP_DIVE: '30 days',
    CUSTOM: '180 days',
};

function isV1Contract(contractAddress: string | null | undefined): boolean {
    if (!contractAddress?.startsWith('0x')) return false;
    const v2 = config.partnerCampaignsAddress?.toLowerCase();
    return !!(v2 && contractAddress.toLowerCase() !== v2);
}

/**
 * GET /api/admin/campaigns/[id]/extend-onchain
 *
 * Returns DB-sourced params for the frontend to encode an updateCampaign calldata.
 * The frontend supplies the sponsor address from the connected wallet.
 * No on-chain read required.
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
            title: true,
            objective: true,
            sponsorName: true,
            coverImageUrl: true,
            tier: true,
            prizePoolUsdc: true,
            modules: true,
            startAt: true,
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

    const tier = campaign.tier as string;
    const prizePoolWei = BigInt(Math.round(Number(campaign.prizePoolUsdc) * 1e6)).toString();
    const moduleCount = getCampaignModuleCount(campaign.modules);
    const startTime = campaign.startAt
        ? Math.floor(campaign.startAt.getTime() / 1000)
        : Math.floor(Date.now() / 1000);
    const v1 = isV1Contract(campaign.partnerContractAddress);

    const commonParams = {
        title: campaign.title,
        description: campaign.objective ?? '',
        category: 'education',
        level: 'beginner',
        thumbnailUrl: campaign.coverImageUrl ?? '',
        totalTasks: moduleCount,
        sponsorName: campaign.sponsorName ?? '',
        sponsorLogo: campaign.coverImageUrl ?? '',
        prizePool: prizePoolWei,
        startTime,
    };

    const versionParams = v1
        ? { duration: PLAN_DURATION_LABEL[tier] ?? '30 days' }
        : { plan: PLAN_ENUM_MAP[tier] ?? 0, durationDays: PLAN_DURATION_DAYS[tier] ?? 30, customWinnerCap: 0 };

    return NextResponse.json({
        abiVersion: v1 ? 'v1' : 'v2',
        onChainCampaignId: campaign.onChainCampaignId,
        contractAddress: campaign.partnerContractAddress,
        params: { ...commonParams, ...versionParams },
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
