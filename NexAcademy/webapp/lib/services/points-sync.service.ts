import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { config } from "@/lib/config";
import { getCampaignRelayer } from "@/lib/services/campaign-relayer.service";

const MULTICALL_BATCH_SIZE = 100;
const CAMPAIGN_POINTS_SELECTOR = "0x6004c6e9";
let rpcBatchSupported: boolean | null = null;
let rpcBatchWarningShown = false;

export type PointsSyncCampaignResult = {
  campaignId: number;
  title: string;
  usersUpdated: number;
  stateOnlyUpdates?: number;
  txHash?: string;
  error?: string;
};

export type PartnerCampaignSyncParticipant = {
  participantId: string;
  walletAddress: string;
  score: number;
  onChainSyncedScore: number | null;
};

type ParticipantSyncPlan = {
  participantId: string;
  walletAddress: string;
  score: number;
  onChainSyncedScore: number | null;
  currentOnChain: bigint;
  effectiveBaseline: bigint;
  delta: bigint;
  nextSyncedScore: number | null;
};

function isBatchUnsupportedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("full array result") ||
    message.includes("invalid rows")
  );
}

async function batchReadOnChainPoints(
  onChainCampaignId: number,
  walletAddresses: string[],
  relayer: ReturnType<typeof getCampaignRelayer>,
  contractAddress?: string | null,
): Promise<Map<string, bigint>> {
  const result = new Map<string, bigint>();
  const rpcUrl = config.rpcUrl;
  const partnerAddr = contractAddress || config.partnerCampaignsAddress;

  if (!rpcUrl || !partnerAddr || rpcBatchSupported === false) {
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

      rpcBatchSupported = true;

      for (let j = 0; j < chunk.length; j++) {
        const points = BigInt(sorted[j].result as string);
        result.set(chunk[j], points);
      }
    } catch (error) {
      if (isBatchUnsupportedError(error)) {
        rpcBatchSupported = false;
        if (!rpcBatchWarningShown) {
          rpcBatchWarningShown = true;
          console.warn("RPC provider does not support JSON-RPC batch responses; using sequential eth_call fallback.");
        }
      } else {
        console.error(`Multicall batch failed for chunk ${i}, falling back to sequential:`, error);
      }
      for (const addr of chunk) {
        result.set(addr, await relayer.getOnChainPoints(onChainCampaignId, addr, contractAddress));
      }
    }
  }

  return result;
}

function clampOnChainBaseline(score: number, currentOnChain: bigint) {
  if (currentOnChain <= 0n) {
    return 0n;
  }

  const dbScore = BigInt(score);
  return currentOnChain > dbScore ? dbScore : currentOnChain;
}

function calculateParticipantSyncPlan(
  participant: PartnerCampaignSyncParticipant,
  currentOnChain: bigint,
): ParticipantSyncPlan {
  const dbScore = BigInt(participant.score);
  const storedSyncedScore =
    participant.onChainSyncedScore !== null && participant.onChainSyncedScore >= 0
      ? BigInt(participant.onChainSyncedScore)
      : 0n;
  const chainBaseline = clampOnChainBaseline(participant.score, currentOnChain);
  const effectiveBaseline =
    storedSyncedScore > chainBaseline ? storedSyncedScore : chainBaseline;
  const delta = dbScore > effectiveBaseline ? dbScore - effectiveBaseline : 0n;

  let nextSyncedScore: number | null = null;
  if (delta > 0n) {
    nextSyncedScore = participant.score;
  } else if (
    participant.onChainSyncedScore === null ||
    chainBaseline > storedSyncedScore
  ) {
    nextSyncedScore = Number(effectiveBaseline);
  }

  return {
    participantId: participant.participantId,
    walletAddress: participant.walletAddress,
    score: participant.score,
    onChainSyncedScore: participant.onChainSyncedScore,
    currentOnChain,
    effectiveBaseline,
    delta,
    nextSyncedScore,
  };
}

async function persistSyncedScores(
  updates: Array<{ participantId: string; syncedScore: number }>,
) {
  if (updates.length === 0) {
    return;
  }

  await prisma.$transaction(
    updates.map(({ participantId, syncedScore }) =>
      prisma.$executeRaw`
        UPDATE "CampaignParticipant"
        SET "onChainSyncedScore" = ${syncedScore}, "updatedAt" = NOW()
        WHERE "id" = ${participantId}
      `,
    ),
  );
}

export async function syncPartnerCampaignParticipantScoresToChain(params: {
  onChainCampaignId: number;
  participants: PartnerCampaignSyncParticipant[];
  contractAddress?: string | null;
}): Promise<{
  usersUpdated: number;
  stateOnlyUpdates: number;
  txHash?: string;
  error?: string;
}> {
  const { onChainCampaignId, participants, contractAddress } = params;
  const relayer = getCampaignRelayer();

  if (!relayer.isConfigured("PARTNER_CAMPAIGNS")) {
    return {
      usersUpdated: 0,
      stateOnlyUpdates: 0,
      error: "PARTNER_CAMPAIGNS contract not configured",
    };
  }

  if (participants.length === 0) {
    return {
      usersUpdated: 0,
      stateOnlyUpdates: 0,
    };
  }

  const addresses = participants.map((participant) => participant.walletAddress);
  const onChainPointsMap = await batchReadOnChainPoints(
    onChainCampaignId,
    addresses,
    relayer,
    contractAddress,
  );

  const plans = participants.map((participant) =>
    calculateParticipantSyncPlan(
      participant,
      onChainPointsMap.get(participant.walletAddress) ?? 0n,
    ),
  );

  const stateOnlyUpdates = plans
    .filter((plan) => plan.delta === 0n && plan.nextSyncedScore !== null)
    .map((plan) => ({
      participantId: plan.participantId,
      syncedScore: plan.nextSyncedScore as number,
    }));

  if (stateOnlyUpdates.length > 0) {
    await persistSyncedScores(stateOnlyUpdates);
  }

  const pointSyncPlans = plans.filter((plan) => plan.delta > 0n);
  if (pointSyncPlans.length === 0) {
    return {
      usersUpdated: 0,
      stateOnlyUpdates: stateOnlyUpdates.length,
    };
  }

  const batchResult = await relayer.batchAddPoints(
    onChainCampaignId,
    pointSyncPlans.map((plan) => plan.walletAddress),
    pointSyncPlans.map((plan) => plan.delta),
    contractAddress,
  );

  if (!batchResult.success) {
    return {
      usersUpdated: 0,
      stateOnlyUpdates: stateOnlyUpdates.length,
      error: batchResult.error,
    };
  }

  await persistSyncedScores(
    pointSyncPlans.map((plan) => ({
      participantId: plan.participantId,
      syncedScore: plan.score,
    })),
  );

  return {
    usersUpdated: pointSyncPlans.length,
    stateOnlyUpdates: stateOnlyUpdates.length,
    txHash: batchResult.txHash,
  };
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
        participantId: string;
        userId: string;
        walletAddress: string;
        score: number;
        onChainSyncedScore: number | null;
      }>
    >(
      Prisma.sql`
        SELECT
          cp."id" AS "participantId",
          cp."userId",
          u."walletAddress",
          cp."score",
          cp."onChainSyncedScore"
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

    const syncResult = await syncPartnerCampaignParticipantScoresToChain({
      onChainCampaignId: campaign.onChainCampaignId,
      contractAddress: campaign.partnerContractAddress,
      participants,
    });

    results.push({
      campaignId: campaign.id,
      title: campaign.title,
      usersUpdated: syncResult.usersUpdated,
      stateOnlyUpdates: syncResult.stateOnlyUpdates,
      txHash: syncResult.txHash,
      error: syncResult.error,
    });
  }

  return {
    synced: true,
    campaignsProcessed: campaigns.length,
    results,
  };
}
