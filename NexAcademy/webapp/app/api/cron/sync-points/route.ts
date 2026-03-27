import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { config } from "@/lib/config";
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
 * 2. Batch-reads their current on-chain points via multicall
 * 3. Computes the delta (DB score − on-chain points)
 * 4. Calls batchAddPoints with the deltas for users who have earned new points
 *
 * Protected by CRON_SECRET header to prevent unauthorized access.
 */

/** Max addresses per multicall batch to stay within RPC size limits */
const MULTICALL_BATCH_SIZE = 100;

/**
 * Batch-read on-chain points for multiple users via JSON-RPC batch calls.
 * Falls back to sequential reads if batching fails.
 */
async function batchReadOnChainPoints(
    onChainCampaignId: number,
    walletAddresses: string[],
    relayer: ReturnType<typeof getCampaignRelayer>,
    contractAddress?: string | null,
): Promise<Map<string, bigint>> {
    const result = new Map<string, bigint>();
    const rpcUrl = config.rpcUrl;
    // Use the campaign's stored contract address (v1 or v2), fall back to current config
    const partnerAddr = contractAddress || config.partnerCampaignsAddress;

    // If no RPC or contract, fall back to sequential
    if (!rpcUrl || !partnerAddr) {
        for (const addr of walletAddresses) {
            result.set(addr, await relayer.getOnChainPoints(onChainCampaignId, addr, contractAddress));
        }
        return result;
    }

    // Build eth_call batch requests for campaignPoints(uint256, address)
    // Selector: keccak256("campaignPoints(uint256,address)") = first 4 bytes
    const selector = "0x6004c6e9"; // campaignPoints(uint256,address)
    const campaignIdHex = BigInt(onChainCampaignId).toString(16).padStart(64, "0");

    // Process in chunks to avoid RPC request size limits
    for (let i = 0; i < walletAddresses.length; i += MULTICALL_BATCH_SIZE) {
        const chunk = walletAddresses.slice(i, i + MULTICALL_BATCH_SIZE);

        const batchPayload = chunk.map((addr, idx) => {
            const paddedAddr = addr.toLowerCase().replace("0x", "").padStart(64, "0");
            return {
                jsonrpc: "2.0",
                id: i + idx,
                method: "eth_call",
                params: [
                    {
                        to: partnerAddr,
                        data: `${selector}${campaignIdHex}${paddedAddr}`,
                    },
                    "latest",
                ],
            };
        });

        try {
            const response = await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(batchPayload),
            });

            const results = await response.json();
            const sorted = Array.isArray(results)
                ? results.sort((a: { id: number }, b: { id: number }) => a.id - b.id)
                : [];

            for (let j = 0; j < chunk.length; j++) {
                const rpcResult = sorted[j];
                const points = rpcResult?.result
                    ? BigInt(rpcResult.result)
                    : 0n;
                result.set(chunk[j], points);
            }
        } catch (err) {
            console.error(`Multicall batch failed for chunk ${i}, falling back to sequential:`, err);
            for (const addr of chunk) {
                result.set(addr, await relayer.getOnChainPoints(onChainCampaignId, addr, contractAddress));
            }
        }
    }

    return result;
}

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
        partnerContractAddress: string | null;
      }>
    >`
      SELECT "id", "onChainCampaignId", "title", "partnerContractAddress"
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

      // Batch-read on-chain points via multicall
      const addresses = participants.map(p => p.walletAddress);
      const onChainPointsMap = await batchReadOnChainPoints(
        campaign.onChainCampaignId,
        addresses,
        relayer,
        campaign.partnerContractAddress,
      );

      // Compute deltas
      const usersToUpdate: string[] = [];
      const pointDeltas: bigint[] = [];

      for (const p of participants) {
        const onChainPoints = onChainPointsMap.get(p.walletAddress) ?? 0n;
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
        campaign.partnerContractAddress,
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
