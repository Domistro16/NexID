import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";

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

    const sponsorName = partner.orgName;

    const campaigns = await prisma.$queryRaw<
      Array<{
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
        createdAt: Date;
      }>
    >(
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
          "coverImageUrl",
          "status",
          "isPublished",
          "startAt",
          "endAt",
          "createdAt"
        FROM "Campaign"
        WHERE "sponsorName" = ${sponsorName}
        ORDER BY "createdAt" DESC
      `,
    );

    const campaignIds = campaigns.map((c) => c.id);
    let metricsMap = new Map<
      number,
      { participantCount: number; topScore: number; totalScore: number; completedCount: number }
    >();

    if (campaignIds.length > 0) {
      const metrics = await prisma.$queryRaw<
        Array<{
          campaignId: number;
          participantCount: number;
          topScore: number;
          totalScore: number;
          completedCount: number;
        }>
      >(
        Prisma.sql`
          SELECT
            "campaignId",
            COUNT(*)::int AS "participantCount",
            COALESCE(MAX("score"), 0)::int AS "topScore",
            COALESCE(SUM("score"), 0)::int AS "totalScore",
            COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL)::int AS "completedCount"
          FROM "CampaignParticipant"
          WHERE "campaignId" IN (${Prisma.join(campaignIds)})
          GROUP BY "campaignId"
        `,
      );

      metricsMap = new Map(
        metrics.map((m) => [
          m.campaignId,
          {
            participantCount: m.participantCount,
            topScore: m.topScore,
            totalScore: m.totalScore,
            completedCount: m.completedCount,
          },
        ]),
      );
    }

    const totalPrizePool = campaigns.reduce((sum, c) => sum + Number(c.prizePoolUsdc), 0);
    const liveCampaigns = campaigns.filter((c) => c.status === "LIVE");
    let totalEnrollments = 0;
    let totalCompleted = 0;

    const enriched = campaigns.map((c) => {
      const m = metricsMap.get(c.id) ?? {
        participantCount: 0,
        topScore: 0,
        totalScore: 0,
        completedCount: 0,
      };
      totalEnrollments += m.participantCount;
      totalCompleted += m.completedCount;
      return { ...c, ...m };
    });

    const completionRate =
      totalEnrollments > 0
        ? Math.round((totalCompleted / totalEnrollments) * 1000) / 10
        : 0;

    return NextResponse.json({
      campaigns: enriched,
      summary: {
        totalCampaigns: campaigns.length,
        liveCampaigns: liveCampaigns.length,
        totalEnrollments,
        totalCompleted,
        completionRate,
        totalPrizePoolUsdc: totalPrizePool.toFixed(2),
      },
    });
  } catch (error) {
    console.error("GET /api/partner/campaigns error", error);
    return NextResponse.json({ error: "Failed to fetch partner campaigns" }, { status: 500 });
  }
}
