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
import { getCampaignAssessmentConfig } from "@/lib/services/campaign-assessment-config.service";
import { getCampaignFlowState } from "@/lib/services/campaign-flow-state.service";
import { ensureCampaignParticipantScorecard } from "@/lib/services/campaign-scorecard.service";
import { syncPartnerCampaignParticipantScoresToChain } from "@/lib/services/points-sync.service";
import { resolveCampaignId } from "@/lib/campaign-route";



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
  const campaignId = await resolveCampaignId(id);
  if (campaignId === null) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
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
      partnerContractAddress: true,
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
    Array<{
      id: string;
      completedAt: Date | null;
      completedUntil: number;
      score: number;
      onChainSyncedScore: number | null;
    }>
  >`
    SELECT
      "id",
      "completedAt",
      COALESCE("completedUntil", -1) AS "completedUntil",
      COALESCE("score", 0) AS "score",
      "onChainSyncedScore"
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

  // Atomic guard: claim the completion slot via conditional update.
  // If two requests race, only one will match completedAt IS NULL.
  const lockResult = await prisma.$executeRaw`
    UPDATE "CampaignParticipant"
    SET "completedAt" = NOW()
    WHERE "id" = ${participant.id} AND "completedAt" IS NULL
  `;
  if (lockResult === 0) {
    return NextResponse.json({ error: "Campaign already completed" }, { status: 400 });
  }

  const normalizedCompletedUntil = normalizeCompletedUntil(
    campaign.modules,
    participant.completedUntil,
  );
  let completedGroupCount = 0;
  try {
    const flowState = await getCampaignFlowState(campaignId, auth.user.userId);
    completedGroupCount = new Set(
      flowState.completedGroupIndexes.filter((index) => index >= 0 && index < moduleCount),
    ).size;
  } catch {
    completedGroupCount = 0;
  }

  const allGroupsCompleted =
    completedGroupCount >= moduleCount || normalizedCompletedUntil >= moduleCount - 1;

  if (!allGroupsCompleted) {
    return NextResponse.json(
      { error: "Complete all modules before finishing this campaign" },
      { status: 400 },
    );
  }

  const completionCompatibilityIndex = moduleCount - 1;
  if (completionCompatibilityIndex !== participant.completedUntil) {
    await prisma.$executeRaw`
      UPDATE "CampaignParticipant"
      SET "completedUntil" = ${completionCompatibilityIndex}, "updatedAt" = NOW()
      WHERE "id" = ${participant.id}
    `;
  }

  try {
    const assessmentConfig = await getCampaignAssessmentConfig(campaignId, auth.user.userId);
    if (!assessmentConfig.quizCompleted) {
      return NextResponse.json(
        { error: "Complete the quiz assessment before finishing this campaign" },
        { status: 400 },
      );
    }
    if (!assessmentConfig.liveAssessmentCompleted) {
      return NextResponse.json(
        { error: "Complete the live AI assessment before finishing this campaign" },
        { status: 400 },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Campaign assessment is not configured correctly";
    return NextResponse.json({ error: message }, { status: 409 });
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
        campaign.partnerContractAddress,
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
  // completedAt already set by the atomic lock above; now assign score
  const [updated] = await prisma.$transaction([
    prisma.campaignParticipant.update({
      where: { id: participant.id },
      data: {
        score: { increment: pointsToAward }
      },
      select: {
        score: true,
        rank: true,
        completedAt: true,
        videoScore: true,
        quizScore: true,
        onchainScore: true,
        agentScore: true,
        compositeScore: true,
      },
    }),
    ...(pointsToAward > 0 ? [
      prisma.user.update({
        where: { id: auth.user.userId },
        data: { totalPoints: { increment: pointsToAward } },
      })
    ] : [])
  ]);

  // Sync points on-chain for partner campaigns (non-blocking)
  const walletAddress = auth.user.walletAddress;
  if (
    campaign.contractType === "PARTNER_CAMPAIGNS" &&
    campaign.onChainCampaignId !== null &&
    updated.score > 0
  ) {
    const onChainCampaignId = campaign.onChainCampaignId;
    if (getCampaignRelayer().isConfigured("PARTNER_CAMPAIGNS")) {
      (async () => {
        try {
          const result = await syncPartnerCampaignParticipantScoresToChain({
            onChainCampaignId,
            contractAddress: campaign.partnerContractAddress,
            participants: [
              {
                participantId: participant.id,
                walletAddress,
                score: updated.score,
                onChainSyncedScore: participant.onChainSyncedScore,
              },
            ],
          });
          if (result.error) {
            console.error("[OnChain] addPoints after completion failed:", result.error);
          }
        } catch (err) {
          console.error("[OnChain] addPoints after completion error:", err);
        }
      })();
    }
  }

  // Evaluate badges asynchronously (don't block the response)
  evaluateBadges(auth.user.userId).catch((err) =>
    console.error("[BadgeEngine] post-completion evaluation failed:", err),
  );

  const scorecard = await ensureCampaignParticipantScorecard(campaignId, auth.user.userId);

  return NextResponse.json({
    completed: true,
    participant: {
      score: scorecard.score,
      rank: scorecard.rank,
      completedAt: scorecard.completedAt,
      videoScore: scorecard.videoScore,
      quizScore: scorecard.quizScore,
      onchainScore: scorecard.onchainScore,
      agentScore: scorecard.agentScore,
      compositeScore: scorecard.compositeScore,
    },
    multiplier: {
      total: multiplier.total,
      basePoints,
      finalPoints: pointsToAward,
    },
    onChainTxHash,
  });
}
