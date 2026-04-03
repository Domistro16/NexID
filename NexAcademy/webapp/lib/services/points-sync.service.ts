import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { config } from "@/lib/config";
import { getCampaignRelayer } from "@/lib/services/campaign-relayer.service";

const MULTICALL_BATCH_SIZE = 100;
const CAMPAIGN_POINTS_SELECTOR = "0x6004c6e9";

export type PointsSyncCampaignResult = {
  campaignId: number;
  title: string;
  usersUpdated: number;
  txHash?: string;
  error?: string;
};

async function batchReadOnChainPoints(
  onChainCampaignId: number,
  walletAddresses: string[],
  relayer: ReturnType<typeof getCampaignRelayer>,
  contractAddress?: string | null,
): Promise<Map<string, bigint>> {
  const result = new Map<string, bigint>();
  const rpcUrl = config.rpcUrl;
  const partnerAddr = contractAddress || config.partnerCampaignsAddress;

  if (!rpcUrl || !partnerAddr) {
    for (const addr of walletAddresses) {
      result.set(addr, await relayer.getOnChainPoints(onChainCampaignId, addr, contractAddress));
    }
    return result;
  }

  const campaignIdHex = BigInt(onChainCampaignId).toString(16).padStart(64, "0");

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
            data: `${CAMPAIGN_POINTS_SELECTOR}${campaignIdHex}${paddedAddr}`,
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

      if (!response.ok) {
        throw new Error(`RPC batch request failed with status ${response.status}`);
      }

      const results = await response.json();
      if (!Array.isArray(results) || results.length !== chunk.length) {
        throw new Error("RPC batch response was not a full array result");
      }

      const sorted = results.sort((a: { id: number }, b: { id: number }) => a.id - b.id);
      const hasInvalidRow = sorted.some(
        (row: { result?: string; error?: unknown }) =>
          typeof row?.result !== "string" || Boolean(row?.error),
      );

      if (hasInvalidRow) {
        throw new Error("RPC batch response contained invalid rows");
      }

      for (let j = 0; j < chunk.length; j++) {
        const points = BigInt(sorted[j].result as string);
        result.set(chunk[j], points);
      }
    } catch (error) {
      console.error(`Multicall batch failed for chunk ${i}, falling back to sequential:`, error);
      for (const addr of chunk) {
        result.set(addr, await relayer.getOnChainPoints(onChainCampaignId, addr, contractAddress));
      }
    }
  }

  return result;
}

export async function syncPartnerCampaignPointsToChain(): Promise<{
  synced: true;
  campaignsProcessed: number;
  results: PointsSyncCampaignResult[];
}> {
  const relayer = getCampaignRelayer();
  if (!relayer.isConfigured("PARTNER_CAMPAIGNS")) {
    throw new Error("PARTNER_CAMPAIGNS contract not configured");
  }

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

  const results: PointsSyncCampaignResult[] = [];

  for (const campaign of campaigns) {
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

    const addresses = participants.map((participant) => participant.walletAddress);
    const onChainPointsMap = await batchReadOnChainPoints(
      campaign.onChainCampaignId,
      addresses,
      relayer,
      campaign.partnerContractAddress,
    );

    const usersToUpdate: string[] = [];
    const pointDeltas: bigint[] = [];

    for (const participant of participants) {
      const onChainPoints = onChainPointsMap.get(participant.walletAddress) ?? 0n;
      const dbScore = BigInt(participant.score);
      if (dbScore > onChainPoints) {
        usersToUpdate.push(participant.walletAddress);
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

  return {
    synced: true,
    campaignsProcessed: campaigns.length,
    results,
  };
}
