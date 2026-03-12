import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth";

/**
 * GET /api/user/campaigns
 * Returns the authenticated user's campaign enrollments with progress.
 */
export async function GET(request: NextRequest) {
  const auth = verifyAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  try {
    const campaigns = await prisma.$queryRaw<
      Array<{
        campaignId: number;
        title: string;
        status: string;
        score: number;
        rank: number | null;
        completedAt: Date | null;
        enrolledAt: Date;
        modules: unknown;
        coverImageUrl: string | null;
        sponsorName: string;
      }>
    >(
      Prisma.sql`
        SELECT
          c."id" AS "campaignId",
          c."title",
          c."status",
          cp."score",
          cp."rank",
          cp."completedAt",
          cp."enrolledAt",
          c."modules",
          c."coverImageUrl",
          c."sponsorName"
        FROM "CampaignParticipant" cp
        INNER JOIN "Campaign" c ON c."id" = cp."campaignId"
        WHERE cp."userId" = ${auth.userId}
        ORDER BY cp."enrolledAt" DESC
      `,
    );

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("GET /api/user/campaigns error", error);
    return NextResponse.json({ error: "Failed to fetch user campaigns" }, { status: 500 });
  }
}
