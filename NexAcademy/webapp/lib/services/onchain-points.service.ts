import prisma from '@/lib/prisma';
import { config } from '@/lib/config';
import { getCampaignRelayer } from '@/lib/services/campaign-relayer.service';

const CAMPAIGN_POINTS_SELECTOR = '0x6004c6e9';
const MULTICALL_BATCH_SIZE = 100;
const MAX_SAFE_POINTS = BigInt(Number.MAX_SAFE_INTEGER);

type PartnerCampaignPointSource = {
  id: number;
  onChainCampaignId: number;
  partnerContractAddress: string | null;
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

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await response.json();
      const rows = Array.isArray(body)
        ? body.sort((a: { id: number }, b: { id: number }) => a.id - b.id)
        : [];

      chunk.forEach((walletAddress, index) => {
        const value = rows[index]?.result ? BigInt(rows[index].result) : 0n;
        result.set(normalizeWalletAddress(walletAddress), value);
      });
    } catch {
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
      totals.set(walletAddress, current + (pointsByWallet.get(walletAddress) ?? 0n));
    }
  }

  return new Map(
    Array.from(totals.entries()).map(([walletAddress, totalPoints]) => [
      walletAddress,
      toSafePointNumber(totalPoints),
    ]),
  );
}

export async function getCumulativePartnerOnChainPoints(walletAddress: string): Promise<number> {
  const points = await getCumulativePartnerOnChainPointsByWallet([walletAddress]);
  return points.get(normalizeWalletAddress(walletAddress)) ?? 0;
}

export async function syncUserTotalPointsFromOnChain(userId: string, walletAddress: string): Promise<number> {
  const totalPoints = await getCumulativePartnerOnChainPoints(walletAddress);

  await prisma.user.update({
    where: { id: userId },
    data: { totalPoints },
  });

  return totalPoints;
}
