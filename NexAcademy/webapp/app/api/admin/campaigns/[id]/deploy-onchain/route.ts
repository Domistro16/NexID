import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { config } from '@/lib/config';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import { getCampaignRelayer } from '@/lib/services/campaign-relayer.service';
import { flattenCampaignModuleItems, getCampaignModuleCount } from '@/lib/campaign-modules';

const PLAN_ENUM_MAP: Record<string, number> = {
    LAUNCH_SPRINT: 0,
    DEEP_DIVE: 1,
    CUSTOM: 2,
};

function buildNexIdObjectives(
    keyTakeaways: string[],
    modules: unknown,
    objective: string,
): string[] {
    const takeaways = Array.isArray(keyTakeaways)
        ? keyTakeaways.map((entry) => String(entry).trim()).filter(Boolean)
        : [];
    if (takeaways.length > 0) {
        return takeaways.slice(0, 6);
    }

    const lessonTitles = flattenCampaignModuleItems(modules)
        .map((item) => item.title.trim())
        .filter(Boolean);
    if (lessonTitles.length > 0) {
        return Array.from(new Set(lessonTitles)).slice(0, 6);
    }

    const trimmedObjective = objective.trim();
    if (trimmedObjective.length > 0) {
        return [trimmedObjective.slice(0, 160)];
    }

    return ['Complete the guided campaign syllabus.'];
}

function buildLessonDurationLabel(totalLessons: number): string {
    if (totalLessons <= 0) {
        return 'Self-paced';
    }

    return totalLessons === 1 ? '1 lesson' : `${totalLessons} lessons`;
}

/**
 * GET /api/admin/campaigns/[id]/deploy-onchain
 * Returns the params needed to encode a createCampaign calldata in the browser.
 * The frontend signs the transaction with the owner wallet and calls POST with the txHash.
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
            tier: true,
            contractType: true,
            prizePoolUsdc: true,
            keyTakeaways: true,
            coverImageUrl: true,
            modules: true,
            startAt: true,
            rewardSchedule: true,
            onChainCampaignId: true,
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

    const moduleCount = getCampaignModuleCount(campaign.modules);
    const lessonCount = flattenCampaignModuleItems(campaign.modules).length;

    if (campaign.contractType === 'NEXID_CAMPAIGNS') {
        if (!config.nexidCampaignsAddress?.startsWith('0x')) {
            return NextResponse.json(
                { error: 'NexIDCampaigns contract address is not configured' },
                { status: 500 },
            );
        }

        return NextResponse.json({
            contractType: campaign.contractType,
            contractLabel: 'NexIDCampaigns',
            contractAddress: config.nexidCampaignsAddress,
            createParams: {
                title: campaign.title,
                description: campaign.objective,
                longDescription: campaign.objective,
                instructor: campaign.sponsorName || 'NexID',
                objectives: buildNexIdObjectives(campaign.keyTakeaways, campaign.modules, campaign.objective),
                prerequisites: [],
                category: 'education',
                level: 'beginner',
                thumbnailUrl: campaign.coverImageUrl ?? '',
                duration: buildLessonDurationLabel(lessonCount),
                totalLessons: lessonCount || moduleCount || 1,
            },
        });
    }

    if (campaign.contractType === 'PARTNER_CAMPAIGNS') {
        if (!config.partnerCampaignsAddress?.startsWith('0x')) {
            return NextResponse.json(
                { error: 'PartnerCampaigns contract address is not configured' },
                { status: 500 },
            );
        }

        const prizePoolUsdc = Number(campaign.prizePoolUsdc);
        const prizePoolWei = BigInt(Math.round(prizePoolUsdc * 1e6)).toString();
        const startTime = campaign.startAt
            ? Math.floor(campaign.startAt.getTime() / 1000)
            : Math.floor(Date.now() / 1000);
        const tier = campaign.tier as string;
        const plan = PLAN_ENUM_MAP[tier] ?? 0;
        const schedule = campaign.rewardSchedule as Record<string, unknown> | null;
        const customWinnerCap = schedule?.customWinnerCap ? Number(schedule.customWinnerCap) : 0;

        return NextResponse.json({
            contractType: campaign.contractType,
            contractLabel: 'PartnerCampaigns',
            contractAddress: config.partnerCampaignsAddress,
            createParams: {
                title: campaign.title,
                description: campaign.objective,
                category: 'education',
                level: 'beginner',
                thumbnailUrl: campaign.coverImageUrl ?? '',
                totalTasks: moduleCount,
                sponsorName: campaign.sponsorName,
                sponsorLogo: campaign.coverImageUrl ?? '',
                prizePool: prizePoolWei,
                startTime,
                plan,
                customWinnerCap,
            },
        });
    }

    return NextResponse.json(
        { error: `Unsupported contract type: ${campaign.contractType}` },
        { status: 400 },
    );
}

/**
 * POST /api/admin/campaigns/[id]/deploy-onchain
 *
 * Wallet-signed mode: body has { txHash, contractAddress? }
 * Server parses the CampaignCreated event from the receipt → saves onChainCampaignId.
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

    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, onChainCampaignId: true, contractType: true },
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

    const txHash = typeof body.txHash === 'string' ? body.txHash.trim() : null;
    const defaultContractAddress =
        campaign.contractType === 'NEXID_CAMPAIGNS'
            ? config.nexidCampaignsAddress
            : config.partnerCampaignsAddress;
    const contractAddress = typeof body.contractAddress === 'string'
        ? body.contractAddress.trim()
        : defaultContractAddress;

    if (!txHash) {
        return NextResponse.json({ error: 'Provide txHash from the wallet transaction' }, { status: 400 });
    }
    if (!contractAddress?.startsWith('0x')) {
        return NextResponse.json({ error: 'Contract address is not configured' }, { status: 500 });
    }

    const relayer = getCampaignRelayer();
    const parseResult = campaign.contractType === 'NEXID_CAMPAIGNS'
        ? await relayer.parseNexIdCampaignCreatedFromTx(txHash, contractAddress)
        : await relayer.parsePartnerCampaignCreatedFromTx(txHash, contractAddress);

    if (parseResult.error || parseResult.onChainCampaignId === undefined) {
        return NextResponse.json(
            { error: 'Failed to parse CampaignCreated event', detail: parseResult.error },
            { status: 502 },
        );
    }

    await prisma.campaign.update({
        where: { id: campaignId },
        data: {
            onChainCampaignId: parseResult.onChainCampaignId,
            partnerContractAddress: contractAddress || null,
        },
    });

    return NextResponse.json({
        deployed: true,
        contractType: campaign.contractType,
        onChainCampaignId: parseResult.onChainCampaignId,
        contractAddress,
        txHash,
    });
}
