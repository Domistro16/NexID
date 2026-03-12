import { NextRequest, NextResponse } from "next/server";
import { Contract, JsonRpcProvider } from "ethers";
import { Prisma } from "@prisma/client";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import prisma from "@/lib/prisma";

// USDC on Base mainnet
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ERC20_BALANCE_ABI = ["function balanceOf(address) view returns (uint256)"];

/**
 * GET /api/admin/stats - Campaign-first dashboard statistics + on-chain TVL
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const [totalUsers, totalCampaignParticipants, totalCompletedParticipants] = await Promise.all([
      prisma.user.count(),
      prisma.campaignParticipant.count(),
      prisma.campaignParticipant.count({ where: { completedAt: { not: null } } }),
    ]);

    const [campaignCounts] = await prisma.$queryRaw<
      Array<{ totalCampaigns: number; pendingCampaignRequests: number; liveCampaigns: number }>
    >`
      SELECT
        (SELECT COUNT(*)::int FROM "Campaign") AS "totalCampaigns",
        (SELECT COUNT(*)::int FROM "Campaign" WHERE "status" = 'LIVE'::"CampaignStatus") AS "liveCampaigns",
        (SELECT COUNT(*)::int FROM "CampaignRequest" WHERE "status" = 'PENDING'::"CampaignRequestStatus") AS "pendingCampaignRequests"
    `;

    const campaignStats = await prisma.$queryRaw<
      Array<{
        campaignId: number;
        title: string;
        status: string;
        participants: number;
        completions: number;
      }>
    >(Prisma.sql`
      SELECT
        c."id" AS "campaignId",
        c."title",
        c."status"::text AS "status",
        COUNT(cp."id")::int AS "participants",
        COUNT(cp."completedAt")::int AS "completions"
      FROM "Campaign" c
      LEFT JOIN "CampaignParticipant" cp ON cp."campaignId" = c."id"
      GROUP BY c."id", c."title", c."status"
      ORDER BY c."id" DESC
      LIMIT 50
    `);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [recentEnrollments, recentCompletions] = await Promise.all([
      prisma.campaignParticipant.count({ where: { enrolledAt: { gte: sevenDaysAgo } } }),
      prisma.campaignParticipant.count({ where: { completedAt: { gte: sevenDaysAgo } } }),
    ]);

    // On-chain TVL: read USDC balances of all escrow addresses
    let escrowTvlUsdc = 0;
    let escrowError: string | null = null;

    try {
      const escrowAddresses = await prisma.$queryRaw<Array<{ escrowAddress: string }>>`
        SELECT DISTINCT "escrowAddress"
        FROM "Campaign"
        WHERE "escrowAddress" IS NOT NULL AND "escrowAddress" != ''
      `;

      if (escrowAddresses.length > 0) {
        const rpcUrl =
          process.env.RPC_URL ||
          process.env.NEXT_PUBLIC_BASE_RPC_URL ||
          "https://mainnet.base.org";
        const provider = new JsonRpcProvider(rpcUrl);
        const usdcContract = new Contract(BASE_USDC_ADDRESS, ERC20_BALANCE_ABI, provider);

        const balances = await Promise.allSettled(
          escrowAddresses.map(async ({ escrowAddress }) => {
            const bal = await usdcContract.balanceOf(escrowAddress);
            // USDC has 6 decimals
            return Number(bal) / 1e6;
          }),
        );

        for (const result of balances) {
          if (result.status === "fulfilled") {
            escrowTvlUsdc += result.value;
          }
        }
      }
    } catch (err) {
      console.error("Escrow TVL read error:", err);
      escrowError = "Failed to read on-chain escrow balances";
    }

    // DB-based total prize pool as a fallback/complementary metric
    const [prizePoolRow] = await prisma.$queryRaw<Array<{ totalPrizePool: string }>>`
      SELECT COALESCE(SUM("prizePoolUsdc"), 0)::text AS "totalPrizePool"
      FROM "Campaign"
      WHERE "status" IN ('LIVE', 'DRAFT')
    `;

    return NextResponse.json({
      totalUsers,
      totalCampaigns: campaignCounts?.totalCampaigns ?? 0,
      liveCampaigns: campaignCounts?.liveCampaigns ?? 0,
      pendingCampaignRequests: campaignCounts?.pendingCampaignRequests ?? 0,
      totalCampaignParticipants,
      totalCompletedParticipants,
      recentEnrollments,
      recentCompletions,
      campaignStats,
      escrowTvlUsdc,
      escrowError,
      totalPrizePoolUsdc: prizePoolRow?.totalPrizePool ?? "0",
    });
  } catch (error) {
    console.error("Error fetching campaign stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
