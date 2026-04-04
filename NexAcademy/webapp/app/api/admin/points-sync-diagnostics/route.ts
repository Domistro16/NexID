import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import prisma from "@/lib/prisma";
import { getCampaignRelayer } from "@/lib/services/campaign-relayer.service";

type CampaignRow = {
  id: number;
  title: string;
  onChainCampaignId: number;
  partnerContractAddress: string | null;
};

type ParticipantRow = {
  userId: string;
  walletAddress: string;
  dbUserTotalPoints: number;
  campaignScore: number;
  onChainSyncedScore: number | null;
};

function parseInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const relayer = getCampaignRelayer();
  if (!relayer.isConfigured("PARTNER_CAMPAIGNS")) {
    return NextResponse.json(
      { error: "PARTNER_CAMPAIGNS contract not configured" },
      { status: 503 },
    );
  }

  try {
    const url = new URL(request.url);
    const campaignIdFilter = url.searchParams.get("campaignId");
    const walletFilter = url.searchParams.get("wallet")?.trim().toLowerCase() ?? "";
    const limit = Math.min(Math.max(parseInteger(url.searchParams.get("limit"), 100), 1), 1000);
    const campaignFilterSql = campaignIdFilter
      ? Prisma.sql`AND c."id" = ${Number(campaignIdFilter)}`
      : Prisma.empty;
    const walletFilterSql = walletFilter
      ? Prisma.sql`AND LOWER(u."walletAddress") = ${walletFilter}`
      : Prisma.empty;

    const campaigns = await prisma.$queryRaw<CampaignRow[]>(
      Prisma.sql`
      SELECT
        c."id",
        c."title",
        c."onChainCampaignId",
        c."partnerContractAddress"
      FROM "Campaign" c
      WHERE c."contractType" = 'PARTNER_CAMPAIGNS'
        AND c."status" = 'LIVE'
        AND c."onChainCampaignId" IS NOT NULL
        ${campaignFilterSql}
      ORDER BY c."id" DESC
    `,
    );

    const diagnostics: Array<{
      campaignId: number;
      title: string;
      onChainCampaignId: number;
      partnerContractAddress: string | null;
      participants: Array<{
        userId: string;
        walletAddress: string;
        dbUserTotalPoints: number;
        campaignScore: number;
        onChainSyncedScore: number | null;
        onChainCampaignPoints: string;
        effectiveBaseline: string;
        deltaToSync: string;
        needsSync: boolean;
      }>;
    }> = [];

    for (const campaign of campaigns) {
      const participants = await prisma.$queryRaw<ParticipantRow[]>(
        Prisma.sql`
        SELECT
          cp."userId",
          u."walletAddress",
          u."totalPoints" AS "dbUserTotalPoints",
          cp."score" AS "campaignScore",
          cp."onChainSyncedScore"
        FROM "CampaignParticipant" cp
        INNER JOIN "User" u ON u."id" = cp."userId"
        WHERE cp."campaignId" = ${campaign.id}
          AND cp."score" > 0
          ${walletFilterSql}
        ORDER BY cp."score" DESC, u."walletAddress" ASC
        LIMIT ${limit}
      `,
      );

      const participantDiagnostics = await Promise.all(
        participants.map(async (participant) => {
          const currentOnChain = await relayer.getOnChainPoints(
            campaign.onChainCampaignId,
            participant.walletAddress,
            campaign.partnerContractAddress,
          );
          const dbScore = BigInt(participant.campaignScore);
          const storedSynced =
            participant.onChainSyncedScore !== null && participant.onChainSyncedScore >= 0
              ? BigInt(participant.onChainSyncedScore)
              : 0n;
          const clampedOnChain =
            currentOnChain > dbScore ? dbScore : currentOnChain < 0n ? 0n : currentOnChain;
          const effectiveBaseline =
            storedSynced > clampedOnChain ? storedSynced : clampedOnChain;
          const delta = dbScore > effectiveBaseline ? dbScore - effectiveBaseline : 0n;

          return {
            userId: participant.userId,
            walletAddress: participant.walletAddress,
            dbUserTotalPoints: participant.dbUserTotalPoints,
            campaignScore: participant.campaignScore,
            onChainSyncedScore: participant.onChainSyncedScore,
            onChainCampaignPoints: currentOnChain.toString(),
            effectiveBaseline: effectiveBaseline.toString(),
            deltaToSync: delta > 0n ? delta.toString() : "0",
            needsSync: delta > 0n,
          };
        }),
      );

      diagnostics.push({
        campaignId: campaign.id,
        title: campaign.title,
        onChainCampaignId: campaign.onChainCampaignId,
        partnerContractAddress: campaign.partnerContractAddress,
        participants: participantDiagnostics,
      });
    }

    return NextResponse.json({
      note:
        "sync-points now uses CampaignParticipant.onChainSyncedScore as its primary idempotency baseline, with on-chain reads only used as a clamp/repair signal. It does not sync User.totalPoints directly.",
      diagnostics,
    });
  } catch (error) {
    console.error("GET /api/admin/points-sync-diagnostics error", error);
    return NextResponse.json(
      { error: "Failed to fetch points sync diagnostics" },
      { status: 500 },
    );
  }
}
