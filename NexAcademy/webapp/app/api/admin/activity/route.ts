import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/activity
 * Returns the most recent platform events for the admin dashboard feed.
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    // Fetch recent enrollments
    const recentEnrollments = await prisma.$queryRaw<
      Array<{
        type: string;
        walletAddress: string;
        campaignTitle: string;
        createdAt: Date;
      }>
    >`
      SELECT
        'ENROLLMENT' AS "type",
        u."walletAddress",
        c."title" AS "campaignTitle",
        cp."enrolledAt" AS "createdAt"
      FROM "CampaignParticipant" cp
      INNER JOIN "User" u ON u."id" = cp."userId"
      INNER JOIN "Campaign" c ON c."id" = cp."campaignId"
      ORDER BY cp."enrolledAt" DESC
      LIMIT 10
    `;

    // Fetch recent completions
    const recentCompletions = await prisma.$queryRaw<
      Array<{
        type: string;
        walletAddress: string;
        campaignTitle: string;
        score: number;
        createdAt: Date;
      }>
    >`
      SELECT
        'COMPLETION' AS "type",
        u."walletAddress",
        c."title" AS "campaignTitle",
        cp."score",
        cp."completedAt" AS "createdAt"
      FROM "CampaignParticipant" cp
      INNER JOIN "User" u ON u."id" = cp."userId"
      INNER JOIN "Campaign" c ON c."id" = cp."campaignId"
      WHERE cp."completedAt" IS NOT NULL
      ORDER BY cp."completedAt" DESC
      LIMIT 10
    `;

    // Fetch recent campaign requests
    const recentRequests = await prisma.$queryRaw<
      Array<{
        type: string;
        partnerName: string;
        campaignTitle: string;
        status: string;
        createdAt: Date;
      }>
    >`
      SELECT
        'CAMPAIGN_REQUEST' AS "type",
        "partnerName",
        "campaignTitle",
        "status"::text AS "status",
        "createdAt"
      FROM "CampaignRequest"
      ORDER BY "createdAt" DESC
      LIMIT 10
    `;

    // Fetch recent reward distributions
    const recentDistributions = await prisma.$queryRaw<
      Array<{
        type: string;
        campaignTitle: string;
        totalDistributedUsdc: string;
        recipientCount: number;
        createdAt: Date;
      }>
    >`
      SELECT
        'DISTRIBUTION' AS "type",
        c."title" AS "campaignTitle",
        crd."totalDistributedUsdc"::text AS "totalDistributedUsdc",
        crd."recipientCount",
        crd."createdAt"
      FROM "CampaignRewardDistribution" crd
      INNER JOIN "Campaign" c ON c."id" = crd."campaignId"
      ORDER BY crd."createdAt" DESC
      LIMIT 10
    `;

    // Merge and sort all events by createdAt DESC
    const allEvents = [
      ...recentEnrollments.map((e) => ({
        type: e.type,
        label: `ENROLL: ${e.walletAddress.slice(0, 6)}...${e.walletAddress.slice(-4)} joined "${e.campaignTitle}"`,
        createdAt: e.createdAt,
      })),
      ...recentCompletions.map((e) => ({
        type: e.type,
        label: `COMPLETE: ${e.walletAddress.slice(0, 6)}...${e.walletAddress.slice(-4)} finished "${e.campaignTitle}" (score: ${e.score})`,
        createdAt: e.createdAt,
      })),
      ...recentRequests.map((e) => ({
        type: e.type,
        label: `REQUEST: ${e.partnerName} submitted "${e.campaignTitle}" (${e.status})`,
        createdAt: e.createdAt,
      })),
      ...recentDistributions.map((e) => ({
        type: e.type,
        label: `DISTRIBUTE: $${Number(e.totalDistributedUsdc).toLocaleString()} USDC to ${e.recipientCount} recipients for "${e.campaignTitle}"`,
        createdAt: e.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    return NextResponse.json({ events: allEvents });
  } catch (error) {
    console.error("GET /api/admin/activity error", error);
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 });
  }
}
