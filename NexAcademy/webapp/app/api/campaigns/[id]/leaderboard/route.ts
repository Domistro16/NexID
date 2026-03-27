import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCampaignRelayer } from "@/lib/services/campaign-relayer.service";

/**
 * GET /api/campaigns/[id]/leaderboard
 *
 * Public leaderboard for a partner campaign.
 * Source of truth: PartnerCampaigns contract on-chain.
 *
 * Returns participants ranked by on-chain points descending.
 * For NexID campaigns (no points), returns participants from the contract.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
    }

    // Look up the DB campaign to get the on-chain ID and contract type
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
            id: true,
            title: true,
            status: true,
            contractType: true,
            onChainCampaignId: true,
            partnerContractAddress: true,
            prizePoolUsdc: true,
            tier: true,
        },
    });

    if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.onChainCampaignId === null) {
        return NextResponse.json(
            { error: "Campaign is not deployed on-chain yet" },
            { status: 400 },
        );
    }

    if (campaign.contractType !== "PARTNER_CAMPAIGNS") {
        // NexID campaigns have no points/leaderboard
        return NextResponse.json({
            campaignId: campaign.id,
            contractType: campaign.contractType,
            leaderboard: [],
            message: "NexID campaigns do not have a points leaderboard",
        });
    }

    const relayer = getCampaignRelayer();

    // Read leaderboard from the contract (source of truth)
    const onChainData = await relayer.getOnChainLeaderboard(
        campaign.onChainCampaignId,
        campaign.partnerContractAddress,
    );
    if (!onChainData) {
        return NextResponse.json(
            { error: "Failed to read leaderboard from contract" },
            { status: 502 },
        );
    }

    // Build ranked entries sorted by points descending
    const entries: Array<{
        rank: number;
        walletAddress: string;
        points: string;
    }> = [];

    for (let i = 0; i < onChainData.users.length; i++) {
        entries.push({
            rank: 0, // assigned after sorting
            walletAddress: onChainData.users[i],
            points: onChainData.points[i].toString(),
        });
    }

    // Sort by points descending
    entries.sort((a, b) => {
        const diff = BigInt(b.points) - BigInt(a.points);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });

    // Assign ranks
    for (let i = 0; i < entries.length; i++) {
        entries[i].rank = i + 1;
    }

    // Read campaign metadata from chain for context
    const onChainCampaign = await relayer.getOnChainCampaign(
        campaign.onChainCampaignId,
        campaign.partnerContractAddress,
    );

    // Pagination
    const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? "50"), 100);
    const offset = (page - 1) * limit;
    const paged = entries.slice(offset, offset + limit);

    return NextResponse.json({
        campaignId: campaign.id,
        title: campaign.title,
        status: campaign.status,
        onChainCampaignId: campaign.onChainCampaignId,
        prizePoolUsdc: campaign.prizePoolUsdc.toString(),
        // On-chain campaign state
        onChain: onChainCampaign
            ? {
                  prizePool: onChainCampaign.prizePool.toString(),
                  startTime: onChainCampaign.startTime,
                  endTime: onChainCampaign.endTime,
                  winnerCap: onChainCampaign.winnerCap,
                  isActive: onChainCampaign.isActive,
              }
            : null,
        // Leaderboard from contract (source of truth)
        totalParticipants: entries.length,
        page,
        limit,
        leaderboard: paged,
    });
}
