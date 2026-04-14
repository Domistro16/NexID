import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { Contract, JsonRpcProvider } from "ethers";
import prisma from "@/lib/prisma";
import { getCampaignAssessmentSummary, type CampaignAssessmentSummary } from "@/lib/services/campaign-assessment-config.service";

type CampaignRow = {
  id: number;
  slug: string;
  title: string;
  objective: string;
  sponsorName: string;
  sponsorNamespace: string | null;
  tier: string;
  ownerType: string;
  contractType: string;
  prizePoolUsdc: string;
  keyTakeaways: string[];
  coverImageUrl: string | null;
  modules: unknown;
  status: string;
  isPublished: boolean;
  startAt: Date | null;
  endAt: Date | null;
  onChainCampaignId: number | null;
  hasOnchainVerification: boolean;
  onchainConfig: unknown;
  primaryChain: string;
};

type OnChainSnapshot = {
  contractType: "PARTNER_CAMPAIGNS" | "NEXID_CAMPAIGNS";
  contractAddress: string;
  campaignId: number;
  participantCount: number;
  sponsorAddress: string | null;
};

async function getOnChainSnapshot(campaign: CampaignRow): Promise<OnChainSnapshot | null> {
  if (campaign.onChainCampaignId === null) {
    return null;
  }

  const rpcUrl =
    process.env.RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    "https://mainnet.base.org";

  const contractType =
    campaign.contractType === "NEXID_CAMPAIGNS"
      ? "NEXID_CAMPAIGNS"
      : "PARTNER_CAMPAIGNS";

  const contractAddress =
    contractType === "NEXID_CAMPAIGNS"
      ? process.env.NEXID_CAMPAIGNS_ADDRESS || process.env.NEXT_PUBLIC_NEXID_CAMPAIGNS_ADDRESS
      : process.env.PARTNER_CAMPAIGNS_ADDRESS || process.env.NEXT_PUBLIC_PARTNER_CAMPAIGNS_ADDRESS;

  if (!contractAddress) {
    return null;
  }

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const abi =
      contractType === "PARTNER_CAMPAIGNS"
        ? [
            "function getParticipantCount(uint256) view returns (uint256)",
            "function getCampaignSponsor(uint256) view returns (address)",
          ]
        : ["function getParticipantCount(uint256) view returns (uint256)"];

    const contract = new Contract(contractAddress, abi, provider);
    const participantCountValue = await contract.getParticipantCount(campaign.onChainCampaignId);
    const participantCount = Number(participantCountValue ?? 0n);

    let sponsorAddress: string | null = null;
    if (contractType === "PARTNER_CAMPAIGNS") {
      sponsorAddress = await contract.getCampaignSponsor(campaign.onChainCampaignId);
    }

    return {
      contractType,
      contractAddress,
      campaignId: campaign.onChainCampaignId,
      participantCount,
      sponsorAddress,
    };
  } catch (error) {
    console.error("Failed to fetch on-chain snapshot", error);
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaignId = Number(id);
  const isNumeric = Number.isFinite(campaignId);

  try {
    const whereClause = isNumeric
      ? Prisma.sql`WHERE "id" = ${campaignId}`
      : Prisma.sql`WHERE "slug" = ${id}`;

    const [campaign] = await prisma.$queryRaw<CampaignRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "slug",
          "title",
          "objective",
          "sponsorName",
          "sponsorNamespace",
          "tier",
          "ownerType",
          "contractType",
          "prizePoolUsdc"::text AS "prizePoolUsdc",
          "keyTakeaways",
          "coverImageUrl",
          "modules",
          "status",
          "isPublished",
          "startAt",
          "endAt",
          "onChainCampaignId",
          ("onchainConfig" IS NOT NULL) AS "hasOnchainVerification",
          "onchainConfig",
          "primaryChain"
        FROM "Campaign"
        ${whereClause}
        LIMIT 1
      `,
    );

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const [leaderboard, onChain, assessmentSummary] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          rank: number | null;
          score: number;
          rewardAmountUsdc: string | null;
          completedAt: Date | null;
          walletAddress: string;
        }>
      >`
        SELECT
          cp."rank",
          cp."score",
          cp."rewardAmountUsdc"::text AS "rewardAmountUsdc",
          cp."completedAt",
          u."walletAddress"
        FROM "CampaignParticipant" cp
        INNER JOIN "User" u ON u."id" = cp."userId"
        WHERE cp."campaignId" = ${campaign.id}
        ORDER BY cp."rank" ASC NULLS LAST, cp."score" DESC
        LIMIT 100
      `,
      getOnChainSnapshot(campaign),
      getCampaignAssessmentSummary(campaign.id).catch((): CampaignAssessmentSummary => ({
        quizMode: null,
        mcqQuestionCount: 0,
        freeTextQuestionCount: 0,
        liveAssessmentQuestionCount: 0,
        freeTextQuizAvailable: false,
      })),
    ]);

    return NextResponse.json({ campaign, leaderboard, onChain, assessmentSummary });
  } catch (error) {
    console.error("GET /api/campaigns/[id] error", error);
    return NextResponse.json({ error: "Failed to fetch campaign" }, { status: 500 });
  }
}
