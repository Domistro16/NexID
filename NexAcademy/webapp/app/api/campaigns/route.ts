import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";

const VALID_STATUSES = new Set(["LIVE", "ENDED", "ARCHIVED", "DRAFT"]);

export async function GET(request: NextRequest) {
  try {
    const includeDraft = request.nextUrl.searchParams.get("includeDraft") === "true";
    const statusParam = request.nextUrl.searchParams.get("status")?.toUpperCase() ?? null;
    const statusFilter = statusParam && VALID_STATUSES.has(statusParam) ? statusParam : null;

    // Require admin auth to view draft/unpublished campaigns
    if (includeDraft) {
      const auth = await verifyAdmin(request);
      if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
      }
    }

    const whereStatus = statusFilter
      ? Prisma.sql`AND c."status" = ${statusFilter}::"CampaignStatus"`
      : Prisma.empty;

    const whereVisibility = includeDraft
      ? Prisma.sql`WHERE 1 = 1`
      : Prisma.sql`WHERE c."isPublished" = true AND c."status" IN ('LIVE'::"CampaignStatus", 'ENDED'::"CampaignStatus")`;

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
        keyTakeaways: string[];
        coverImageUrl: string | null;
        status: string;
        isPublished: boolean;
        startAt: Date | null;
        endAt: Date | null;
      }>
    >(
      Prisma.sql`
        SELECT
          c."id",
          c."slug",
          c."title",
          c."objective",
          c."sponsorName",
          c."sponsorNamespace",
          c."tier",
          c."ownerType",
          c."contractType",
          c."prizePoolUsdc"::text AS "prizePoolUsdc",
          c."keyTakeaways",
          c."coverImageUrl",
          c."status",
          c."isPublished",
          c."startAt",
          c."endAt"
        FROM "Campaign" c
        ${whereVisibility}
        ${whereStatus}
        ORDER BY c."createdAt" DESC
      `,
    );

    const campaignIds = campaigns.map((campaign) => campaign.id);
    let metricsMap = new Map<number, { participantCount: number; topScore: number; totalScore: number }>();

    if (campaignIds.length > 0) {
      const metrics = await prisma.$queryRaw<
        Array<{
          campaignId: number;
          participantCount: number;
          topScore: number;
          totalScore: number;
        }>
      >(
        Prisma.sql`
          SELECT
            "campaignId",
            COUNT(*)::int AS "participantCount",
            COALESCE(MAX("score"), 0)::int AS "topScore",
            COALESCE(SUM("score"), 0)::int AS "totalScore"
          FROM "CampaignParticipant"
          WHERE "campaignId" IN (${Prisma.join(campaignIds)})
          GROUP BY "campaignId"
        `,
      );

      metricsMap = new Map(
        metrics.map((metric) => [
          metric.campaignId,
          {
            participantCount: metric.participantCount,
            topScore: metric.topScore,
            totalScore: metric.totalScore,
          },
        ]),
      );
    }

    return NextResponse.json({
      campaigns: campaigns.map((campaign) => {
        const metrics = metricsMap.get(campaign.id) ?? {
          participantCount: 0,
          topScore: 0,
          totalScore: 0,
        };
        return {
          ...campaign,
          ...metrics,
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/campaigns error", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}
