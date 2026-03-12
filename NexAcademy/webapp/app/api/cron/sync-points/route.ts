import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCampaignRelayer } from "@/lib/services/campaign-relayer.service";

/**
 * POST /api/cron/sync-points
 *
 * Scheduled job (run every day at 12:00 AM) that syncs campaign participant
 * scores from the database to the PartnerCampaigns contract on-chain using
 * batchAddPoints().
 *
 * For each LIVE partner campaign with an on-chain ID, it:
 * 1. Reads all participant scores from DB
 * 2. Reads their current on-chain points
 * 3. Computes the delta (DB score − on-chain points)
 * 4. Calls batchAddPoints with the deltas for users who have earned new points
 *
 * Protected by CRON_SECRET header to prevent unauthorized access.
 */
export async function POST(request: NextRequest) {
  // Verify cron secret (fail-closed: reject if CRON_SECRET is not configured)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const relayer = getCampaignRelayer();
  if (!relayer.isConfigured("PARTNER_CAMPAIGNS")) {
    return NextResponse.json(
      { error: "PARTNER_CAMPAIGNS contract not configured" },
      { status: 503 },
    );
  }

  try {
    // Get all LIVE partner campaigns with on-chain IDs
    const campaigns = await prisma.$queryRaw<
      Array<{
        id: number;
        onChainCampaignId: number;
        title: string;
      }>
    >`
      SELECT "id", "onChainCampaignId", "title"
      FROM "Campaign"
      WHERE "contractType" = 'PARTNER_CAMPAIGNS'
        AND "status" = 'LIVE'
        AND "onChainCampaignId" IS NOT NULL
    `;

    const results: Array<{
      campaignId: number;
      title: string;
      usersUpdated: number;
      txHash?: string;
      error?: string;
    }> = [];

    for (const campaign of campaigns) {
      // Get all participants with their wallet addresses and DB scores
      const participants = await prisma.$queryRaw<
        Array<{
          userId: string;
          walletAddress: string;
          score: number;
        }>
      >(
        Prisma.sql`
          SELECT
            cp."userId",
            u."walletAddress",
            cp."score"
          FROM "CampaignParticipant" cp
          INNER JOIN "User" u ON u."id" = cp."userId"
          WHERE cp."campaignId" = ${campaign.id}
            AND cp."score" > 0
        `,
      );

      if (participants.length === 0) {
        results.push({
          campaignId: campaign.id,
          title: campaign.title,
          usersUpdated: 0,
        });
        continue;
      }

      // For each participant, compute delta = DB score − on-chain points
      const usersToUpdate: string[] = [];
      const pointDeltas: bigint[] = [];

      for (const p of participants) {
        const onChainPoints = await relayer.getOnChainPoints(
          campaign.onChainCampaignId,
          p.walletAddress,
        );

        const dbScore = BigInt(p.score);
        if (dbScore > onChainPoints) {
          usersToUpdate.push(p.walletAddress);
          pointDeltas.push(dbScore - onChainPoints);
        }
      }

      if (usersToUpdate.length === 0) {
        results.push({
          campaignId: campaign.id,
          title: campaign.title,
          usersUpdated: 0,
        });
        continue;
      }

      // Batch-add point deltas on-chain
      const batchResult = await relayer.batchAddPoints(
        campaign.onChainCampaignId,
        usersToUpdate,
        pointDeltas,
      );

      results.push({
        campaignId: campaign.id,
        title: campaign.title,
        usersUpdated: usersToUpdate.length,
        txHash: batchResult.txHash,
        error: batchResult.error,
      });
    }

    return NextResponse.json({
      synced: true,
      campaignsProcessed: campaigns.length,
      results,
    });
  } catch (error) {
    console.error("Cron sync-points error:", error);
    return NextResponse.json(
      { error: "Failed to sync points" },
      { status: 500 },
    );
  }
}
