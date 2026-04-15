import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCampaignRelayer } from "@/lib/services/campaign-relayer.service";
import { normalizePartnerCampaignDisplayPoints } from "@/lib/services/onchain-points.service";
import { getSubgraphCampaignLeaderboard } from "@/lib/services/subgraph-points.service";
import { resolveCampaignId } from "@/lib/campaign-route";

/**
 * GET /api/campaigns/[id]/leaderboard
 *
 * Public leaderboard for a partner campaign.
 * Source of truth: Goldsky subgraph indexing PointsAwarded on PartnerCampaigns.
 * Campaign metadata (prize pool, times) still reads from the contract.
 *
 * Returns participants ranked by on-chain points descending.
 * For NexID campaigns (no points), returns empty.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const campaignId = await resolveCampaignId(id);
    if (campaignId === null) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

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

    if (campaign.onChainCampaignId === null || !campaign.partnerContractAddress) {
        return NextResponse.json(
            { error: "Campaign is not deployed on-chain yet" },
            { status: 400 },
        );
    }

    if (campaign.contractType !== "PARTNER_CAMPAIGNS") {
        return NextResponse.json({
            campaignId: campaign.id,
            contractType: campaign.contractType,
            leaderboard: [],
            message: "NexID campaigns do not have a points leaderboard",
        });
    }

    // Leaderboard rows come from the subgraph, pre-sorted by points desc.
    let subgraphEntries;
    try {
        subgraphEntries = await getSubgraphCampaignLeaderboard(
            campaign.partnerContractAddress,
            campaign.onChainCampaignId,
        );
    } catch (error) {
        console.error("Subgraph leaderboard fetch failed", error);
        return NextResponse.json(
            { error: "Failed to read leaderboard from subgraph" },
            { status: 502 },
        );
    }

    const entries = subgraphEntries.map((row, index) => ({
        rank: index + 1,
        walletAddress: row.walletAddress,
        points: normalizePartnerCampaignDisplayPoints(campaign.id, row.points).toString(),
    }));

    // Re-sort after display cap in case caps compressed ordering at the top.
    entries.sort((a, b) => {
        const diff = BigInt(b.points) - BigInt(a.points);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    for (let i = 0; i < entries.length; i++) entries[i].rank = i + 1;

    // Campaign metadata still reads from the contract (prize pool, times, cap).
    const relayer = getCampaignRelayer();
    const onChainCampaign = await relayer.getOnChainCampaign(
        campaign.onChainCampaignId,
        campaign.partnerContractAddress,
    );

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
        onChain: onChainCampaign
            ? {
                  prizePool: onChainCampaign.prizePool.toString(),
                  startTime: onChainCampaign.startTime,
                  endTime: onChainCampaign.endTime,
                  winnerCap: onChainCampaign.winnerCap,
                  isActive: onChainCampaign.isActive,
              }
            : null,
        totalParticipants: entries.length,
        page,
        limit,
        leaderboard: paged,
    });
}
