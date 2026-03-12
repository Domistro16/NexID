import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const partner = await prisma.partner.findUnique({
    where: { userId: auth.user.userId },
  });
  if (!partner) {
    return NextResponse.json({ error: "Partner profile not found" }, { status: 403 });
  }

  const { id } = await params;
  const campaignId = Number(id);

  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  // Verify this campaign belongs to the partner
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, sponsorName: partner.orgName },
    select: { id: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  try {
    const leaderboard = await prisma.$queryRaw<
      Array<{
        rank: number | null;
        score: number;
        rewardAmountUsdc: string | null;
        walletAddress: string;
      }>
    >`
      SELECT
        cp."rank",
        cp."score",
        cp."rewardAmountUsdc"::text AS "rewardAmountUsdc",
        u."walletAddress"
      FROM "CampaignParticipant" cp
      INNER JOIN "User" u ON u."id" = cp."userId"
      WHERE cp."campaignId" = ${campaignId}
      ORDER BY cp."rank" ASC NULLS LAST, cp."score" DESC
      LIMIT 100
    `;

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error("GET /api/partner/campaigns/[id]/leaderboard error", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
