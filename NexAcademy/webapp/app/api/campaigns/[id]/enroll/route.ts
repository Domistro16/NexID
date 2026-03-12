import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { getCampaignRelayer } from "@/lib/services/campaign-relayer.service";
import { normalizeCompletedUntil } from "@/lib/campaign-modules";

async function getCompletedUntil(campaignId: number, userId: string, modules: unknown) {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; completedUntil: number }>>`
      SELECT
        "id",
        COALESCE("completedUntil", -1) AS "completedUntil"
      FROM "CampaignParticipant"
      WHERE "campaignId" = ${campaignId} AND "userId" = ${userId}
      LIMIT 1
    `;
    const participant = rows[0];
    if (!participant) {
      return -1;
    }

    const normalizedCompletedUntil = normalizeCompletedUntil(modules, participant.completedUntil);
    if (normalizedCompletedUntil !== participant.completedUntil) {
      await prisma.$executeRaw`
        UPDATE "CampaignParticipant"
        SET "completedUntil" = ${normalizedCompletedUntil}, "updatedAt" = NOW()
        WHERE "id" = ${participant.id}
      `;
    }

    return normalizedCompletedUntil;
  } catch (error) {
    console.error("Failed to read completedUntil", error);
    return -1;
  }
}

/**
 * POST /api/campaigns/[id]/enroll
 * Enroll the authenticated user in a campaign (DB + on-chain).
 *
 * GET /api/campaigns/[id]/enroll
 * Check if the authenticated user is enrolled and return their progress.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true, contractType: true, onChainCampaignId: true, modules: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "LIVE") {
    return NextResponse.json({ error: "Campaign is not accepting enrollments" }, { status: 400 });
  }

  // Check if already enrolled in DB
  const existing = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId, userId: auth.user.userId } },
    select: {
      score: true,
      rank: true,
      completedAt: true,
      enrolledAt: true,
    },
  });
  if (existing) {
    const completedUntil = await getCompletedUntil(campaignId, auth.user.userId, campaign.modules);
    return NextResponse.json({
      enrolled: true,
      participant: {
        ...existing,
        completedUntil,
      },
    });
  }

  // ── On-chain enrollment ──
  let onChainTxHash: string | null = null;

  if (campaign.onChainCampaignId !== null) {
    const relayer = getCampaignRelayer();
    const contractType = campaign.contractType as "NEXID_CAMPAIGNS" | "PARTNER_CAMPAIGNS";

    if (relayer.isConfigured(contractType)) {
      const result = await relayer.enrollUser(
        contractType,
        campaign.onChainCampaignId,
        auth.user.walletAddress,
      );

      if (!result.success) {
        console.error("On-chain enroll failed:", result.error);
        return NextResponse.json(
          { error: "On-chain enrollment failed", detail: result.error },
          { status: 502 },
        );
      }

      onChainTxHash = result.txHash ?? null;
    }
  }

  // ── DB enrollment ──
  const participant = await prisma.campaignParticipant.create({
    data: {
      campaignId,
      userId: auth.user.userId,
      score: 0,
    },
    select: {
      score: true,
      rank: true,
      completedAt: true,
      enrolledAt: true,
    },
  });
  const completedUntil = await getCompletedUntil(campaignId, auth.user.userId, campaign.modules);

  return NextResponse.json(
    {
      enrolled: true,
      participant: {
        ...participant,
        completedUntil,
      },
      onChainTxHash,
    },
    { status: 201 },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  const participant = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId, userId: auth.user.userId } },
    select: {
      score: true,
      rank: true,
      completedAt: true,
      enrolledAt: true,
    },
  });

  if (!participant) {
    return NextResponse.json({ enrolled: false });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { modules: true },
  });
  const completedUntil = await getCompletedUntil(
    campaignId,
    auth.user.userId,
    campaign?.modules ?? [],
  );

  return NextResponse.json({
    enrolled: true,
    participant: {
      score: participant.score,
      rank: participant.rank,
      completedUntil,
      completedAt: participant.completedAt,
      enrolledAt: participant.enrolledAt,
    },
  });
}
