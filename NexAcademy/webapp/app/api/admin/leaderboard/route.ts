import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import prisma from "@/lib/prisma";
import { getCumulativePartnerDisplayPointsByWallet } from "@/lib/services/onchain-points.service";

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
    const leaderboardBase = await prisma.$queryRaw<
      Array<{
        userId: string;
        walletAddress: string;
        dbTotalPoints: number;
        totalPoints: number;
        campaignsFinished: number;
        usdcClaimed: string;
        totalScore: number;
      }>
    >`
      SELECT
        u."id" AS "userId",
        u."walletAddress",
        u."totalPoints" AS "dbTotalPoints",
        u."totalPoints" AS "totalPoints",
        COUNT(cp."id") FILTER (WHERE cp."completedAt" IS NOT NULL)::int AS "campaignsFinished",
        COALESCE(SUM(cp."rewardAmountUsdc") FILTER (WHERE cp."rewardTxHash" IS NOT NULL), 0)::text AS "usdcClaimed",
        COALESCE(SUM(cp."score"), 0)::int AS "totalScore"
      FROM "User" u
      LEFT JOIN "CampaignParticipant" cp ON cp."userId" = u."id"
      GROUP BY u."id", u."walletAddress", u."totalPoints"
      LIMIT 100
    `;

    const onChainPointsByWallet = await getCumulativePartnerDisplayPointsByWallet(
      leaderboardBase.map((row) => row.walletAddress),
    );

    const leaderboard = leaderboardBase
      .map((row) => ({
        ...row,
        totalPoints:
          onChainPointsByWallet.get(row.walletAddress.toLowerCase()) ?? row.dbTotalPoints ?? 0,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints || b.totalScore - a.totalScore)
      .slice(0, 100);

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
