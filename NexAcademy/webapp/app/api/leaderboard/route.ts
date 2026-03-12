import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/leaderboard
 * Public global leaderboard — returns top-100 users ranked by totalPoints.
 */
export async function GET() {
    try {
        const leaderboard = await prisma.$queryRaw<
            Array<{
                walletAddress: string;
                totalPoints: number;
                campaignsFinished: number;
                totalScore: number;
            }>
        >`
      SELECT
        u."walletAddress",
        u."totalPoints",
        COUNT(cp."id") FILTER (WHERE cp."completedAt" IS NOT NULL)::int AS "campaignsFinished",
        COALESCE(SUM(cp."score"), 0)::int AS "totalScore"
      FROM "User" u
      LEFT JOIN "CampaignParticipant" cp ON cp."userId" = u."id"
      GROUP BY u."id", u."walletAddress", u."totalPoints"
      ORDER BY u."totalPoints" DESC, "totalScore" DESC
      LIMIT 100
    `;

        return NextResponse.json({
            leaderboard: leaderboard.map((row, i) => ({
                rank: i + 1,
                ...row,
            })),
        });
    } catch (error) {
        console.error("GET /api/leaderboard error", error);
        return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
    }
}
