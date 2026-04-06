import prisma from '@/lib/prisma';
import { config } from '@/lib/config';
import { getCampaignRelayer } from '@/lib/services/campaign-relayer.service';

const CAMPAIGN_POINTS_SELECTOR = '0x6004c6e9';
const MULTICALL_BATCH_SIZE = 100;
const MAX_SAFE_POINTS = BigInt(Number.MAX_SAFE_INTEGER);
const BATCH_MAX_RETRIES = 3;

type PartnerCampaignPointSource = {
  id: number;
  onChainCampaignId: number;
  partnerContractAddress: string | null;
  displayPointCap: number | null;
};

const DISPLAY_POINT_CAPS_BY_CAMPAIGN_ID: Record<number, number> = {
  3: 100,
};

function normalizeWalletAddress(walletAddress: string) {
  return walletAddress.trim().toLowerCase();
}

function toSafePointNumber(value: bigint) {
  if (value <= 0n) {
    return 0;
  }
  return Number(value > MAX_SAFE_POINTS ? MAX_SAFE_POINTS : value);
}

export function getPartnerCampaignDisplayPointCap(campaignId: number): number | null {
  const cap = DISPLAY_POINT_CAPS_BY_CAMPAIGN_ID[campaignId];
  return Number.isFinite(cap) ? cap : null;
}

export function normalizePartnerCampaignDisplayPoints(
  campaignId: number,
  value: bigint,
) {
  const cap = getPartnerCampaignDisplayPointCap(campaignId);
  if (cap === null || value <= 0n) {
    return value <= 0n ? 0n : value;
  }

  const maxAllowed = BigInt(cap);
  return value > maxAllowed ? maxAllowed : value;
}

async function getPartnerCampaignPointSources(): Promise<PartnerCampaignPointSource[]> {
  const campaigns = await prisma.campaign.findMany({
    where: {
      contractType: 'PARTNER_CAMPAIGNS',
      onChainCampaignId: { not: null },
    },
    select: {
      id: true,
      onChainCampaignId: true,
      partnerContractAddress: true,
    },
  });

  return campaigns
    .filter((campaign): campaign is typeof campaign & { onChainCampaignId: number } => campaign.onChainCampaignId !== null)
    .map((campaign) => ({
      id: campaign.id,
      onChainCampaignId: campaign.onChainCampaignId,
      partnerContractAddress: campaign.partnerContractAddress,
      displayPointCap: getPartnerCampaignDisplayPointCap(campaign.id),
    }));
}

async function batchReadCampaignPoints(
  onChainCampaignId: number,
  walletAddresses: string[],
  contractAddress?: string | null,
): Promise<Map<string, bigint>> {
  const relayer = getCampaignRelayer();
  const result = new Map<string, bigint>();
  const rpcUrl = config.rpcUrl;
  const partnerAddr = contractAddress || config.partnerCampaignsAddress;

  // No RPC URL or contract address — go straight to sequential reads
  if (!rpcUrl || !partnerAddr) {
    for (const walletAddress of walletAddresses) {
      result.set(
        normalizeWalletAddress(walletAddress),
        await relayer.getOnChainPoints(onChainCampaignId, walletAddress, contractAddress),
      );
    }
    return result;
  }

  const campaignIdHex = BigInt(onChainCampaignId).toString(16).padStart(64, '0');

  for (let start = 0; start < walletAddresses.length; start += MULTICALL_BATCH_SIZE) {
    const chunk = walletAddresses.slice(start, start + MULTICALL_BATCH_SIZE);
    const payload = chunk.map((walletAddress, index) => {
      const paddedAddress = normalizeWalletAddress(walletAddress).replace('0x', '').padStart(64, '0');
      return {
        jsonrpc: '2.0',
        id: start + index,
        method: 'eth_call',
        params: [
          {
            to: partnerAddr,
            data: `${CAMPAIGN_POINTS_SELECTOR}${campaignIdHex}${paddedAddress}`,
          },
          'latest',
        ],
      };
    });

    let batchSucceeded = false;

    // Retry batch RPC with exponential backoff
    for (let attempt = 0; attempt < BATCH_MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`RPC batch request failed with status ${response.status}`);
        }

        const body = await response.json();
        if (!Array.isArray(body) || body.length !== chunk.length) {
          throw new Error('RPC batch response was not a full array result');
        }

        const rows = body.sort((a: { id: number }, b: { id: number }) => a.id - b.id);
        const hasInvalidRow = rows.some(
          (row: { result?: string; error?: unknown }) =>
            typeof row?.result !== 'string' || Boolean(row?.error),
        );

        if (hasInvalidRow) {
          throw new Error('RPC batch response contained invalid rows');
        }

        chunk.forEach((walletAddress, index) => {
          const value = BigInt(rows[index].result as string);
          result.set(normalizeWalletAddress(walletAddress), value);
        });

        batchSucceeded = true;
        break;
      } catch (error) {
        if (attempt < BATCH_MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
          continue;
        }
        console.error(
          `[OnChain] Batch RPC failed after ${BATCH_MAX_RETRIES} attempts for campaign ${onChainCampaignId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // If batch exhausted retries, fall back to sequential on-chain reads (also have retries built in)
    if (!batchSucceeded) {
      for (const walletAddress of chunk) {
        result.set(
          normalizeWalletAddress(walletAddress),
          await relayer.getOnChainPoints(onChainCampaignId, walletAddress, contractAddress),
        );
      }
    }
  }

  return result;
}

export async function getCumulativePartnerOnChainPointsByWallet(
  walletAddresses: string[],
): Promise<Map<string, number>> {
  const normalizedWallets = Array.from(
    new Set(
      walletAddresses
        .filter((walletAddress): walletAddress is string => typeof walletAddress === 'string')
        .map((walletAddress) => normalizeWalletAddress(walletAddress))
        .filter((walletAddress) => walletAddress.startsWith('0x') && walletAddress.length === 42),
    ),
  );

  const totals = new Map<string, bigint>();
  normalizedWallets.forEach((walletAddress) => {
    totals.set(walletAddress, 0n);
  });

  if (normalizedWallets.length === 0) {
    return new Map<string, number>();
  }

  const campaigns = await getPartnerCampaignPointSources();
  for (const campaign of campaigns) {
    const pointsByWallet = await batchReadCampaignPoints(
      campaign.onChainCampaignId,
      normalizedWallets,
      campaign.partnerContractAddress,
    );

    for (const walletAddress of normalizedWallets) {
      const current = totals.get(walletAddress) ?? 0n;
      const rawPoints = pointsByWallet.get(walletAddress) ?? 0n;
      const displayPoints =
        campaign.displayPointCap !== null
          ? normalizePartnerCampaignDisplayPoints(campaign.id, rawPoints)
          : rawPoints;
      totals.set(walletAddress, current + displayPoints);
    }
  }

  return new Map(
    Array.from(totals.entries()).map(([walletAddress, totalPoints]) => [
      walletAddress,
      toSafePointNumber(totalPoints),
    ]),
  );
}

export async function getCumulativePartnerDisplayPointsByWallet(
  walletAddresses: string[],
): Promise<Map<string, number>> {
  return getCumulativePartnerOnChainPointsByWallet(walletAddresses);
}

export async function getCumulativePartnerOnChainPoints(walletAddress: string): Promise<number> {
  const points = await getCumulativePartnerOnChainPointsByWallet([walletAddress]);
  return points.get(normalizeWalletAddress(walletAddress)) ?? 0;
}

export async function getCumulativePartnerDisplayPoints(walletAddress: string): Promise<number> {
  const points = await getCumulativePartnerDisplayPointsByWallet([walletAddress]);
  return points.get(normalizeWalletAddress(walletAddress)) ?? 0;
}

export async function syncUserTotalPointsFromOnChain(userId: string, walletAddress: string): Promise<number> {
  const totalPoints = await getCumulativePartnerDisplayPoints(walletAddress);

  await prisma.user.update({
    where: { id: userId },
    data: { totalPoints },
  });

  return totalPoints;
}
