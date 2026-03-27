import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { config } from '@/lib/config';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import { getCampaignRelayer } from '@/lib/services/campaign-relayer.service';

/**
 * POST /api/admin/campaigns/[id]/create-escrow
 * Create an escrow campaign on-chain and optionally fund it.
 *
 * 1. Creates an EscrowCampaign on the CampaignEscrow contract
 * 2. Stores escrowId + escrowAddress on the DB Campaign record
 * 3. Optionally funds the escrow if `fund: true` is passed
 *
 * Body: { sponsor?: string, fund?: boolean }
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
            onChainCampaignId: true,
            escrowId: true,
            prizePoolUsdc: true,
            sponsorName: true,
            endAt: true,
            contractType: true,
        },
    });

    if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.escrowId !== null) {
        return NextResponse.json(
            { error: 'Escrow already created for this campaign', escrowId: campaign.escrowId },
            { status: 409 },
        );
    }

    if (campaign.contractType !== 'PARTNER_CAMPAIGNS') {
        return NextResponse.json(
            { error: 'Escrow is only applicable to PARTNER_CAMPAIGNS (NexID campaigns have no prize pool)' },
            { status: 400 },
        );
    }

    if (campaign.onChainCampaignId === null) {
        return NextResponse.json(
            { error: 'Deploy campaign on-chain first (POST /deploy-onchain)' },
            { status: 400 },
        );
    }

    if (!campaign.endAt) {
        return NextResponse.json({ error: 'Campaign has no end date' }, { status: 400 });
    }

    const relayer = getCampaignRelayer();
    if (!relayer.isOwnerConfigured()) {
        return NextResponse.json(
            { error: 'OWNER_PRIVATE_KEY not configured' },
            { status: 503 },
        );
    }

    const body = await request.json().catch(() => ({}));
    const sponsor = body.sponsor ?? admin.user?.walletAddress ?? '0x0000000000000000000000000000000000000000';
    const endTimestamp = Math.floor(campaign.endAt.getTime() / 1000);

    // 1. Create escrow campaign on-chain
    const createResult = await relayer.createEscrowCampaign(
        campaign.onChainCampaignId,
        sponsor,
        endTimestamp,
    );

    if (!createResult.success || createResult.escrowId === undefined) {
        return NextResponse.json(
            { error: 'Failed to create escrow on-chain', detail: createResult.error },
            { status: 502 },
        );
    }

    // 2. Store escrowId + escrowAddress in DB
    const escrowAddress = config.campaignEscrowAddress;
    await prisma.campaign.update({
        where: { id: campaignId },
        data: {
            escrowId: createResult.escrowId,
            escrowAddress: escrowAddress || null,
        },
    });

    // 3. Optionally fund the escrow
    let fundResult = null;
    if (body.fund) {
        const prizePoolUsdc = Number(campaign.prizePoolUsdc);
        const amountRaw = BigInt(Math.round(prizePoolUsdc * 1e6)); // USDC 6 decimals

        fundResult = await relayer.fundEscrowCampaign(createResult.escrowId, amountRaw);
        if (!fundResult.success) {
            // Escrow was created but funding failed — return partial success
            return NextResponse.json({
                created: true,
                funded: false,
                escrowId: createResult.escrowId,
                escrowAddress,
                createTxHash: createResult.txHash,
                fundError: fundResult.error,
            });
        }
    }

    return NextResponse.json({
        created: true,
        funded: !!fundResult?.success,
        escrowId: createResult.escrowId,
        escrowAddress,
        createTxHash: createResult.txHash,
        fundTxHash: fundResult?.txHash ?? null,
    });
}
