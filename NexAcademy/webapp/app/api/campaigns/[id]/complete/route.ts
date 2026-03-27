import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { getCampaignRelayer } from "@/lib/services/campaign-relayer.service";
import { getCampaignModuleCount, normalizeCompletedUntil } from "@/lib/campaign-modules";
import { getCampaignCompletionPoints } from "@/lib/campaign-rewards";
import { evaluateBadges } from "@/lib/services/badge-engine.service";
import { getUserMultiplier } from "@/lib/services/multiplier.service";
import { applyBehaviourMultiplier } from "@/lib/scorm/scoring";
import { isShadowBanned, applyShadowBanModifier } from "@/lib/services/shadow-ban.service";
import { isKilled, FEATURES } from "@/lib/services/kill-switch.service";



/**
 * POST /api/campaigns/[id]/complete
 * Mark a campaign as completed for the authenticated user (DB + on-chain).
 *
 * The user must be enrolled and not already completed.
 * On-chain: calls completeCampaign() via the relayer (relayer-only on both contracts).
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

  // Fetch campaign info
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      status: true,
      modules: true,
      contractType: true,
      onChainCampaignId: true,
      ownerType: true,
      sponsorName: true,
      sponsorNamespace: true,
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const moduleCount = getCampaignModuleCount(campaign.modules);
  if (moduleCount === 0) {
    return NextResponse.json({ error: "Campaign modules are not configured yet" }, { status: 400 });
  }

  // Kill switch check
  const completionKilled = await isKilled(FEATURES.COMPLETION, {
    campaignId,
    userId: auth.user.userId,
  });
  if (completionKilled) {
    return NextResponse.json(
      { error: "Campaign completion is temporarily disabled" },
      { status: 503 },
    );
  }

  // Check enrollment
  const participantRows = await prisma.$queryRaw<
    Array<{ id: string; completedAt: Date | null; completedUntil: number }>
  >`
    SELECT
      "id",
      "completedAt",
      COALESCE("completedUntil", -1) AS "completedUntil"
    FROM "CampaignParticipant"
    WHERE "campaignId" = ${campaignId} AND "userId" = ${auth.user.userId}
    LIMIT 1
  `;
  const participant = participantRows[0];
  if (!participant) {
    return NextResponse.json({ error: "Not enrolled in this campaign" }, { status: 400 });
  }
  if (participant.completedAt) {
    return NextResponse.json({ error: "Campaign already completed" }, { status: 400 });
  }

  const normalizedCompletedUntil = normalizeCompletedUntil(
    campaign.modules,
    participant.completedUntil,
  );
  if (normalizedCompletedUntil < moduleCount - 1) {
    return NextResponse.json(
      { error: "Complete all modules before finishing this campaign" },
      { status: 400 },
    );
  }
  if (normalizedCompletedUntil !== participant.completedUntil) {
    await prisma.$executeRaw`
      UPDATE "CampaignParticipant"
      SET "completedUntil" = ${normalizedCompletedUntil}, "updatedAt" = NOW()
      WHERE "id" = ${participant.id}
    `;
  }

  // On-chain completion
  let onChainTxHash: string | null = null;

  if (campaign.onChainCampaignId !== null) {
    const relayer = getCampaignRelayer();
    const contractType = campaign.contractType as "NEXID_CAMPAIGNS" | "PARTNER_CAMPAIGNS";

    if (relayer.isConfigured(contractType)) {
      const result = await relayer.completeCampaign(
        contractType,
        campaign.onChainCampaignId,
        auth.user.walletAddress,
      );

      if (!result.success) {
        console.error("On-chain completeCampaign failed:", result.error);
        return NextResponse.json(
          { error: "On-chain completion failed", detail: result.error },
          { status: 502 },
        );
      }

      onChainTxHash = result.txHash ?? null;
    }
  }

  // Only partner Genesis reward campaigns grant points on completion.
  const basePoints = getCampaignCompletionPoints(campaign);

  // Apply behaviour-based multiplier to the base score
  const multiplier = await getUserMultiplier(auth.user.userId);
  const multipliedPoints = basePoints > 0
    ? applyBehaviourMultiplier(basePoints, multiplier)
    : 0;

  // Shadow-ban: silently zero the score if the user is flagged
  const shadowBanned = await isShadowBanned(auth.user.userId);
  const pointsToAward = applyShadowBanModifier(multipliedPoints, shadowBanned);

  // DB completion
  // Run both updates in a transaction to ensure atomic score assignment
  const [updated] = await prisma.$transaction([
    prisma.campaignParticipant.update({
      where: { id: participant.id },
      data: {
        completedAt: new Date(),
        score: { increment: pointsToAward }
      },
      select: {
        score: true,
        rank: true,
        completedAt: true,
      },
    }),
    ...(pointsToAward > 0 ? [
      prisma.user.update({
        where: { id: auth.user.userId },
        data: { totalPoints: { increment: pointsToAward } },
      })
    ] : [])
  ]);

  // Evaluate badges asynchronously (don't block the response)
  evaluateBadges(auth.user.userId).catch((err) =>
    console.error("[BadgeEngine] post-completion evaluation failed:", err),
  );

  return NextResponse.json({
    completed: true,
    participant: {
      score: updated.score,
      rank: updated.rank,
      completedAt: updated.completedAt,
    },
    multiplier: {
      total: multiplier.total,
      basePoints,
      finalPoints: pointsToAward,
    },
    onChainTxHash,
  });
}
