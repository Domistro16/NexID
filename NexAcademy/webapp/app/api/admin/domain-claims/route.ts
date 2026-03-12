import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import prisma from "@/lib/prisma";

type DomainClaimRow = {
  id: string;
  domainName: string;
  walletAddress: string;
  claimedAt: Date;
  campaignId: number;
  campaignTitle: string | null;
};

export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const claims = await prisma.$queryRaw<DomainClaimRow[]>`
      SELECT
        dc."id",
        dc."domainName",
        dc."walletAddress",
        dc."claimedAt",
        dc."campaignId",
        c."title" AS "campaignTitle"
      FROM "DomainClaim" dc
      LEFT JOIN "Campaign" c ON c."id" = dc."campaignId"
      ORDER BY dc."claimedAt" DESC, dc."domainName" ASC
    `;

    const [summary] = await prisma.$queryRaw<Array<{
      totalClaims: number;
      uniqueWallets: number;
      uniqueCampaigns: number;
    }>>`
      SELECT
        COUNT(*)::int AS "totalClaims",
        COUNT(DISTINCT "walletAddress")::int AS "uniqueWallets",
        COUNT(DISTINCT "campaignId")::int AS "uniqueCampaigns"
      FROM "DomainClaim"
    `;

    return NextResponse.json({
      claims,
      summary: {
        totalClaims: summary?.totalClaims ?? 0,
        uniqueWallets: summary?.uniqueWallets ?? 0,
        uniqueCampaigns: summary?.uniqueCampaigns ?? 0,
      },
      reservedNames: claims.map((claim) => claim.domainName),
    });
  } catch (error) {
    console.error("GET /api/admin/domain-claims error", error);
    return NextResponse.json({ error: "Failed to fetch domain claims" }, { status: 500 });
  }
}
