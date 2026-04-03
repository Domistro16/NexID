import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { getCampaignRelayer } from "@/lib/services/campaign-relayer.service";
import { normalizeCompletedUntil } from "@/lib/campaign-modules";
import { runSybilChecks, hasBlockingSybilFlags, recordFingerprint } from "@/lib/services/sybil-detection.service";
import { isKilled, FEATURES } from "@/lib/services/kill-switch.service";
import { ensureCampaignParticipantScorecard } from "@/lib/services/campaign-scorecard.service";

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
    select: { id: true, status: true, contractType: true, onChainCampaignId: true, partnerContractAddress: true, modules: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "LIVE") {
    return NextResponse.json({ error: "Campaign is not accepting enrollments" }, { status: 400 });
  }

  // Kill switch check
  const enrollmentKilled = await isKilled(FEATURES.ENROLLMENT, {
    campaignId,
    userId: auth.user.userId,
  });
  if (enrollmentKilled) {
    return NextResponse.json(
      { error: "Enrollment is temporarily disabled" },
      { status: 503 },
    );
  }

  // Record fingerprint for sybil correlation
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const deviceFingerprint = request.headers.get("x-device-fingerprint") ?? undefined;
  const userAgent = request.headers.get("user-agent") ?? undefined;

  recordFingerprint(auth.user.userId, ip, deviceFingerprint, userAgent).catch(
    (err) => console.error("[SybilDetection] fingerprint recording failed:", err),
  );

  // Run sybil checks (non-blocking for existing flags, blocking for wallet age)
  const sybilResult = await runSybilChecks(
    auth.user.userId,
    auth.user.walletAddress,
    ip,
    deviceFingerprint,
  );

  // Block enrollment if user has critical sybil flags (e.g. wallet too new)
  if (!sybilResult.passed && await hasBlockingSybilFlags(auth.user.userId)) {
    return NextResponse.json(
      { error: "Your wallet does not meet the minimum requirements for enrollment" },
      { status: 403 },
    );
  }

  // Check if already enrolled in DB
  const existing = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId, userId: auth.user.userId } },
    select: {
      score: true,
      rank: true,
      completedAt: true,
      enrolledAt: true,
      videoScore: true,
      quizScore: true,
      onchainScore: true,
      agentScore: true,
      compositeScore: true,
    },
  });
  if (existing) {
    const completedUntil = await getCompletedUntil(campaignId, auth.user.userId, campaign.modules);
    const scorecard = await ensureCampaignParticipantScorecard(campaignId, auth.user.userId);
    return NextResponse.json({
      enrolled: true,
      participant: {
        score: scorecard.score,
        rank: scorecard.rank,
        completedAt: scorecard.completedAt,
        enrolledAt: existing.enrolledAt,
        videoScore: scorecard.videoScore,
        quizScore: scorecard.quizScore,
        onchainScore: scorecard.onchainScore,
        agentScore: scorecard.agentScore,
        compositeScore: scorecard.compositeScore,
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
        campaign.partnerContractAddress,
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

  // ── DB enrollment (upsert to prevent race-condition duplicates) ──
  const participant = await prisma.campaignParticipant.upsert({
    where: { campaignId_userId: { campaignId, userId: auth.user.userId } },
    create: {
      campaignId,
      userId: auth.user.userId,
      score: 0,
    },
    update: {}, // No-op if already exists
    select: {
      score: true,
      rank: true,
      completedAt: true,
      enrolledAt: true,
      videoScore: true,
      quizScore: true,
      onchainScore: true,
      agentScore: true,
      compositeScore: true,
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
      videoScore: true,
      quizScore: true,
      onchainScore: true,
      agentScore: true,
      compositeScore: true,
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
  const scorecard = await ensureCampaignParticipantScorecard(campaignId, auth.user.userId);

  return NextResponse.json({
    enrolled: true,
    participant: {
      score: scorecard.score,
      rank: scorecard.rank,
      completedUntil,
      completedAt: scorecard.completedAt,
      enrolledAt: participant.enrolledAt,
      videoScore: scorecard.videoScore,
      quizScore: scorecard.quizScore,
      onchainScore: scorecard.onchainScore,
      agentScore: scorecard.agentScore,
      compositeScore: scorecard.compositeScore,
    },
  });
}
