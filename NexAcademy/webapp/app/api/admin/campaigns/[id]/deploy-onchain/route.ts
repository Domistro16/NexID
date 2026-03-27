import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { config } from '@/lib/config';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import { getCampaignRelayer } from '@/lib/services/campaign-relayer.service';
import { getCampaignModuleCount } from '@/lib/campaign-modules';

const PLAN_ENUM_MAP: Record<string, number> = {
    LAUNCH_SPRINT: 0,
    DEEP_DIVE: 1,
    CUSTOM: 2,
};

/**
 * POST /api/admin/campaigns/[id]/deploy-onchain
 * Deploy a campaign to the on-chain contract (NexIDCampaigns or PartnerCampaigns).
 * Sets `onChainCampaignId` in the DB on success.
 *
 * For PARTNER_CAMPAIGNS, also accepts an optional `sponsor` address override.
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
            title: true,
            objective: true,
            sponsorName: true,
            tier: true,
            ownerType: true,
            contractType: true,
            prizePoolUsdc: true,
            coverImageUrl: true,
            modules: true,
            startAt: true,
            endAt: true,
            onChainCampaignId: true,
            rewardSchedule: true,
        },
    });

    if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.onChainCampaignId !== null) {
        return NextResponse.json(
            { error: 'Campaign already deployed on-chain', onChainCampaignId: campaign.onChainCampaignId },
            { status: 409 },
        );
    }

    const relayer = getCampaignRelayer();
    if (!relayer.isOwnerConfigured()) {
        return NextResponse.json(
            { error: 'OWNER_PRIVATE_KEY not configured — cannot deploy on-chain' },
            { status: 503 },
        );
    }

    const body = await request.json().catch(() => ({}));
    const contractType = campaign.contractType as string;

    if (contractType === 'NEXID_CAMPAIGNS') {
        const moduleCount = getCampaignModuleCount(campaign.modules);

        const result = await relayer.createNexIDCampaignOnChain({
            title: campaign.title,
            description: campaign.objective,
            longDescription: campaign.objective,
            instructor: campaign.sponsorName,
            objectives: [],
            prerequisites: [],
            category: 'education',
            level: 'beginner',
            thumbnailUrl: campaign.coverImageUrl ?? '',
            duration: '7 days',
            totalLessons: moduleCount,
        });

        if (!result.success) {
            return NextResponse.json(
                { error: 'On-chain deployment failed', detail: result.error },
                { status: 502 },
            );
        }

        await prisma.campaign.update({
            where: { id: campaignId },
            data: {
                onChainCampaignId: result.onChainCampaignId,
                partnerContractAddress: config.nexidCampaignsAddress || null,
            },
        });

        return NextResponse.json({
            deployed: true,
            contractType,
            onChainCampaignId: result.onChainCampaignId,
            contractAddress: config.nexidCampaignsAddress,
            txHash: result.txHash,
        });
    }

    if (contractType === 'PARTNER_CAMPAIGNS') {
        const moduleCount = getCampaignModuleCount(campaign.modules);
        const prizePoolUsdc = Number(campaign.prizePoolUsdc);
        const prizePoolWei = BigInt(Math.round(prizePoolUsdc * 1e6)); // USDC 6 decimals
        const startTime = campaign.startAt
            ? Math.floor(campaign.startAt.getTime() / 1000)
            : Math.floor(Date.now() / 1000);
        const tier = campaign.tier as string;
        const plan = PLAN_ENUM_MAP[tier] ?? 0;
        const schedule = campaign.rewardSchedule as Record<string, unknown> | null;
        const customWinnerCap = schedule?.customWinnerCap
            ? Number(schedule.customWinnerCap)
            : 0;
        const sponsor = body.sponsor ?? admin.user?.walletAddress ?? '0x0000000000000000000000000000000000000000';

        const result = await relayer.createPartnerCampaignOnChain({
            title: campaign.title,
            description: campaign.objective,
            category: 'education',
            level: 'beginner',
            thumbnailUrl: campaign.coverImageUrl ?? '',
            totalTasks: moduleCount,
            sponsor,
            sponsorName: campaign.sponsorName,
            sponsorLogo: campaign.coverImageUrl ?? '',
            prizePool: prizePoolWei,
            startTime,
            plan,
            customWinnerCap,
        });

        if (!result.success) {
            return NextResponse.json(
                { error: 'On-chain deployment failed', detail: result.error },
                { status: 502 },
            );
        }

        await prisma.campaign.update({
            where: { id: campaignId },
            data: {
                onChainCampaignId: result.onChainCampaignId,
                partnerContractAddress: config.partnerCampaignsAddress || null,
            },
        });

        return NextResponse.json({
            deployed: true,
            contractType,
            onChainCampaignId: result.onChainCampaignId,
            contractAddress: config.partnerCampaignsAddress,
            txHash: result.txHash,
        });
    }

    return NextResponse.json({ error: `Unknown contractType: ${contractType}` }, { status: 400 });
}
