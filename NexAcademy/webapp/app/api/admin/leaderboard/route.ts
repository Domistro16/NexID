import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/leaderboard
 * Returns the top-100 global leaderboard across all campaigns.
 * Aggregates scores, campaign completions, and reward claims per user.
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const leaderboard = await prisma.$queryRaw<
      Array<{
        walletAddress: string;
        totalPoints: number;
        campaignsFinished: number;
        usdcClaimed: string;
        totalScore: number;
      }>
    >`
      SELECT
        u."walletAddress",
        u."totalPoints",
        COUNT(cp."id") FILTER (WHERE cp."completedAt" IS NOT NULL)::int AS "campaignsFinished",
        COALESCE(SUM(cp."rewardAmountUsdc") FILTER (WHERE cp."rewardTxHash" IS NOT NULL), 0)::text AS "usdcClaimed",
        COALESCE(SUM(cp."score"), 0)::int AS "totalScore"
      FROM "User" u
      LEFT JOIN "CampaignParticipant" cp ON cp."userId" = u."id"
      GROUP BY u."id", u."walletAddress", u."totalPoints"
      ORDER BY u."totalPoints" DESC, "totalScore" DESC
      LIMIT 100
    `;

    // Summary stats
    const [summary] = await prisma.$queryRaw<
      Array<{
        totalRegistered: number;
        totalDistributedUsdc: string;
      }>
    >`
      SELECT
        (SELECT COUNT(*)::int FROM "User") AS "totalRegistered",
        COALESCE(
          (SELECT SUM("totalDistributedUsdc") FROM "CampaignRewardDistribution"),
          0
        )::text AS "totalDistributedUsdc"
    `;

    return NextResponse.json({
      leaderboard: leaderboard.map((row, i) => ({
        rank: i + 1,
        ...row,
      })),
      summary: {
        totalRegistered: summary?.totalRegistered ?? 0,
        totalDistributedUsdc: summary?.totalDistributedUsdc ?? "0",
      },
    });
  } catch (error) {
    console.error("GET /api/admin/leaderboard error", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
