import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";

type PartnerCampaignRow = {
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
  coverImageUrl: string | null;
  status: string;
  isPublished: boolean;
  startAt: Date | null;
  endAt: Date | null;
  requestId: string | null;
  createdAt: Date;
  updatedAt: Date;
  participantCount: number;
  completedCount: number;
  topScore: number;
  averageScore: number;
  distributionCount: number;
  recipientCount: number;
  totalDistributedUsdc: string;
  lastDistributedAt: Date | null;
};

type CampaignRequestRow = {
  id: string;
  campaignTitle: string;
  primaryObjective: string;
  tier: string;
  prizePoolUsdc: string;
  briefFileName: string | null;
  callBookedFor: Date | null;
  callTimeSlot: string | null;
  callTimezone: string | null;
  callBookingNotes: string | null;
  status: string;
  reviewNotes: string | null;
  linkedCampaignId: number | null;
  linkedCampaignSlug: string | null;
  linkedCampaignTitle: string | null;
  linkedCampaignStatus: string | null;
  linkedCampaignPublished: boolean | null;
  linkedCampaignCreatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PayoutRow = {
  id: string;
  campaignId: number;
  campaignTitle: string;
  totalDistributedUsdc: string;
  recipientCount: number;
  txHash: string | null;
  createdAt: Date;
};

type AggregateLeaderboardRow = {
  walletAddress: string;
  totalScore: number;
  campaignCount: number;
  completedCount: number;
  totalRewardAmountUsdc: string;
  bestRank: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const partner = await prisma.partner.findUnique({
      where: { userId: auth.user.userId },
    });

    if (!partner) {
      return NextResponse.json(
        { error: "Partner profile not found. Complete onboarding first." },
        { status: 403 },
      );
    }

    const campaigns = await prisma.$queryRaw<PartnerCampaignRow[]>`
      SELECT
        c."id",
        c."slug",
        c."title",
        c."objective",
        c."sponsorName",
        c."sponsorNamespace",
        c."tier"::text AS "tier",
        c."ownerType"::text AS "ownerType",
        c."contractType"::text AS "contractType",
        c."prizePoolUsdc"::text AS "prizePoolUsdc",
        c."coverImageUrl",
        c."status"::text AS "status",
        c."isPublished",
        c."startAt",
        c."endAt",
        c."requestId",
        c."createdAt",
        c."updatedAt",
        COALESCE(metrics."participantCount", 0)::int AS "participantCount",
        COALESCE(metrics."completedCount", 0)::int AS "completedCount",
        COALESCE(metrics."topScore", 0)::int AS "topScore",
        COALESCE(metrics."averageScore", 0)::float AS "averageScore",
        COALESCE(distributions."distributionCount", 0)::int AS "distributionCount",
        COALESCE(distributions."recipientCount", 0)::int AS "recipientCount",
        COALESCE(distributions."totalDistributedUsdc", 0)::text AS "totalDistributedUsdc",
        distributions."lastDistributedAt"
      FROM "Campaign" c
      LEFT JOIN (
        SELECT
          cp."campaignId",
          COUNT(*)::int AS "participantCount",
          COUNT(*) FILTER (WHERE cp."completedAt" IS NOT NULL)::int AS "completedCount",
          COALESCE(MAX(cp."score"), 0)::int AS "topScore",
          COALESCE(ROUND(AVG(cp."score")::numeric, 1), 0)::float AS "averageScore"
        FROM "CampaignParticipant" cp
        GROUP BY cp."campaignId"
      ) metrics ON metrics."campaignId" = c."id"
      LEFT JOIN (
        SELECT
          crd."campaignId",
          COUNT(*)::int AS "distributionCount",
          COALESCE(SUM(crd."recipientCount"), 0)::int AS "recipientCount",
          COALESCE(SUM(crd."totalDistributedUsdc"), 0)::text AS "totalDistributedUsdc",
          MAX(crd."createdAt") AS "lastDistributedAt"
        FROM "CampaignRewardDistribution" crd
        GROUP BY crd."campaignId"
      ) distributions ON distributions."campaignId" = c."id"
      WHERE
        c."sponsorName" = ${partner.orgName}
        OR c."requestId" IN (
          SELECT "id"
          FROM "CampaignRequest"
          WHERE
            "submittedById" = ${auth.user.userId}
            OR ("submittedById" IS NULL AND "partnerName" = ${partner.orgName})
        )
      ORDER BY COALESCE(c."startAt", c."createdAt") DESC, c."createdAt" DESC
    `;

    const requests = await prisma.$queryRaw<CampaignRequestRow[]>`
      SELECT
        r."id",
        r."campaignTitle",
        r."primaryObjective",
        r."tier"::text AS "tier",
        r."prizePoolUsdc"::text AS "prizePoolUsdc",
        r."briefFileName",
        r."callBookedFor",
        r."callTimeSlot",
        r."callTimezone",
        r."callBookingNotes",
        r."status"::text AS "status",
        r."reviewNotes",
        c."id" AS "linkedCampaignId",
        c."slug" AS "linkedCampaignSlug",
        c."title" AS "linkedCampaignTitle",
        c."status"::text AS "linkedCampaignStatus",
        c."isPublished" AS "linkedCampaignPublished",
        c."createdAt" AS "linkedCampaignCreatedAt",
        r."createdAt",
        r."updatedAt"
      FROM "CampaignRequest" r
      LEFT JOIN "Campaign" c ON c."requestId" = r."id"
      WHERE
        r."submittedById" = ${auth.user.userId}
        OR (r."submittedById" IS NULL AND r."partnerName" = ${partner.orgName})
      ORDER BY r."createdAt" DESC
      LIMIT 50
    `;

    const payouts = await prisma.$queryRaw<PayoutRow[]>`
      SELECT
        crd."id",
        crd."campaignId",
        c."title" AS "campaignTitle",
        crd."totalDistributedUsdc"::text AS "totalDistributedUsdc",
        crd."recipientCount",
        crd."txHash",
        crd."createdAt"
      FROM "CampaignRewardDistribution" crd
      INNER JOIN "Campaign" c ON c."id" = crd."campaignId"
      WHERE c."sponsorName" = ${partner.orgName}
      ORDER BY crd."createdAt" DESC
      LIMIT 50
    `;

    const aggregateLeaderboard = await prisma.$queryRaw<AggregateLeaderboardRow[]>`
      SELECT
        u."walletAddress",
        COALESCE(SUM(cp."score"), 0)::int AS "totalScore",
        COUNT(cp."id")::int AS "campaignCount",
        COUNT(cp."id") FILTER (WHERE cp."completedAt" IS NOT NULL)::int AS "completedCount",
        COALESCE(SUM(cp."rewardAmountUsdc"), 0)::text AS "totalRewardAmountUsdc",
        MIN(cp."rank") AS "bestRank"
      FROM "CampaignParticipant" cp
      INNER JOIN "Campaign" c ON c."id" = cp."campaignId"
      INNER JOIN "User" u ON u."id" = cp."userId"
      WHERE c."sponsorName" = ${partner.orgName}
      GROUP BY u."id", u."walletAddress"
      ORDER BY "totalScore" DESC, "completedCount" DESC, "bestRank" ASC NULLS LAST
      LIMIT 100
    `;

    const totalParticipants = campaigns.reduce(
      (sum, campaign) => sum + campaign.participantCount,
      0,
    );
    const totalCompleted = campaigns.reduce(
      (sum, campaign) => sum + campaign.completedCount,
      0,
    );
    const totalPrizePoolUsdc = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.prizePoolUsdc || 0),
      0,
    );
    const totalDistributedUsdc = payouts.reduce(
      (sum, payout) => sum + Number(payout.totalDistributedUsdc || 0),
      0,
    );
    const totalRecipients = payouts.reduce(
      (sum, payout) => sum + payout.recipientCount,
      0,
    );
    const liveCampaigns = campaigns.filter((campaign) => campaign.status === "LIVE");
    const completionRate =
      totalParticipants > 0
        ? Math.round((totalCompleted / totalParticipants) * 1000) / 10
        : 0;

    const featuredCampaign =
      liveCampaigns[0] ??
      campaigns.find((campaign) => campaign.status === "DRAFT") ??
      campaigns[0] ??
      null;

    return NextResponse.json({
      partner,
      campaigns,
      requests,
      payouts,
      aggregateLeaderboard,
      featuredCampaignId: featuredCampaign?.id ?? null,
      summary: {
        totalCampaigns: campaigns.length,
        liveCampaigns: liveCampaigns.length,
        totalParticipants,
        totalCompleted,
        completionRate,
        totalPrizePoolUsdc: totalPrizePoolUsdc.toFixed(2),
        totalDistributedUsdc: totalDistributedUsdc.toFixed(2),
        totalRecipients,
        pendingRequests: requests.filter((request) => request.status === "PENDING").length,
        approvedRequests: requests.filter((request) => request.status === "APPROVED").length,
      },
    });
  } catch (error) {
    console.error("GET /api/partner/dashboard error", error);
    return NextResponse.json(
      { error: "Failed to fetch partner dashboard" },
      { status: 500 },
    );
  }
}
