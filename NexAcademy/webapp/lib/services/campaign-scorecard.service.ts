import prisma from "@/lib/prisma";
import { getCampaignModuleCount, normalizeCompletedUntil } from "@/lib/campaign-modules";
import { getCampaignAssessmentSummary } from "@/lib/services/campaign-assessment-config.service";
import { getCampaignFlowState } from "@/lib/services/campaign-flow-state.service";
import { getSpeedTrapResults } from "@/lib/services/speed-trap.service";
import {
  calculateOnchainScore,
  calculateVideoScore,
} from "@/lib/services/scoring-composition.service";

type NullableScore = number | null;

export interface CampaignParticipantScorecard {
  score: number;
  rank: number | null;
  completedAt: Date | null;
  videoScore: NullableScore;
  quizScore: NullableScore;
  onchainScore: NullableScore;
  agentScore: NullableScore;
  compositeScore: NullableScore;
  hasStructuredQuiz: boolean;
  hasOnchainVerification: boolean;
}

function roundScore(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMinAmountUsd(raw: unknown) {
  if (!isObjectRecord(raw)) {
    return null;
  }

  const rawValue = raw.minAmountUsd;
  if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue > 0) {
    return rawValue;
  }

  if (typeof rawValue === "string") {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function calculateCompositeScoreForCampaign(input: {
  videoScore: NullableScore;
  quizScore: NullableScore;
  onchainScore: NullableScore;
  agentScore: NullableScore;
  hasStructuredQuiz: boolean;
  hasOnchainVerification: boolean;
}) {
  const weightedComponents = [
    { active: input.videoScore !== null, required: true, weight: 0.2, value: input.videoScore },
    {
      active: input.hasStructuredQuiz && input.quizScore !== null,
      required: input.hasStructuredQuiz,
      weight: 0.3,
      value: input.quizScore,
    },
    {
      active: input.hasOnchainVerification && input.onchainScore !== null,
      required: input.hasOnchainVerification,
      weight: 0.1,
      value: input.onchainScore,
    },
    { active: input.agentScore !== null, required: true, weight: 0.4, value: input.agentScore },
  ];

  if (weightedComponents.some((component) => component.required && component.value === null)) {
    return null;
  }

  const activeComponents = weightedComponents.filter((component) => component.active);
  if (activeComponents.length === 0) {
    return null;
  }

  const totalWeight = activeComponents.reduce((sum, component) => sum + component.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  const weightedTotal = activeComponents.reduce(
    (sum, component) => sum + ((component.value ?? 0) * component.weight) / totalWeight,
    0,
  );

  return roundScore(weightedTotal);
}

export async function ensureCampaignParticipantScorecard(
  campaignId: number,
  userId: string,
): Promise<CampaignParticipantScorecard> {
  const [campaign, participant, quizAttempt, liveAssessmentSession, onchainVerification, assessmentSummary] =
    await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { modules: true, onchainConfig: true },
      }),
      prisma.campaignParticipant.findUnique({
        where: { campaignId_userId: { campaignId, userId } },
        select: {
          id: true,
          score: true,
          rank: true,
          completedAt: true,
          completedUntil: true,
          videoScore: true,
          quizScore: true,
          onchainScore: true,
          agentScore: true,
          compositeScore: true,
        },
      }),
      prisma.quizAttempt.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
        select: { totalScore: true, completedAt: true },
      }),
      prisma.agentSession.findFirst({
        where: {
          userId,
          campaignId,
          sessionType: "CAMPAIGN_ASSESSMENT",
          status: "COMPLETED",
        },
        orderBy: { completedAt: "desc" },
        select: { overallScore: true, completedAt: true },
      }),
      prisma.onchainVerification.findUnique({
        where: { campaignId_userId: { campaignId, userId } },
        select: { verified: true, amountUsd: true },
      }),
      getCampaignAssessmentSummary(campaignId),
    ]);

  if (!campaign || !participant) {
    throw new Error("Campaign participant not found");
  }

  const moduleCount = getCampaignModuleCount(campaign.modules);
  const hasOnchainVerification = Boolean(campaign.onchainConfig);
  const hasStructuredQuiz =
    assessmentSummary.quizMode !== null || participant.quizScore !== null || quizAttempt?.totalScore != null;

  let completedGroupCount = 0;
  try {
    const flowState = await getCampaignFlowState(campaignId, userId);
    completedGroupCount = new Set(
      flowState.completedGroupIndexes.filter((index) => index >= 0 && index < moduleCount),
    ).size;
  } catch {
    completedGroupCount = 0;
  }

  const normalizedCompletedUntil = normalizeCompletedUntil(
    campaign.modules,
    participant.completedUntil ?? -1,
  );

  if (participant.completedAt) {
    completedGroupCount = moduleCount;
  } else {
    completedGroupCount = Math.max(completedGroupCount, normalizedCompletedUntil + 1);
  }

  const [speedTrapResults, engagementFlags] = await Promise.all([
    participant.videoScore === null && moduleCount > 0
      ? getSpeedTrapResults(campaignId, userId)
      : Promise.resolve({ correct: 0, total: 0 }),
    participant.videoScore === null && moduleCount > 0
      ? prisma.engagementFlag.findMany({
          where: {
            userId,
            campaignId,
            flagType: {
              in: ["HEARTBEAT_ANOMALY", "TAB_FOCUS_LOSS", "LOW_MOUSE_ENTROPY"],
            },
          },
          select: { flagType: true },
        })
      : Promise.resolve([]),
  ]);

  const resolvedVideoScore =
    roundScore(participant.videoScore) ??
    (moduleCount > 0
      ? calculateVideoScore({
          modulesCompleted: completedGroupCount,
          totalModules: moduleCount,
          speedTrapsCorrect: speedTrapResults.correct,
          speedTrapsTotal: speedTrapResults.total,
          hasHeartbeatAnomaly: engagementFlags.some((flag) => flag.flagType === "HEARTBEAT_ANOMALY"),
          hasTabFocusIssue: engagementFlags.some((flag) => flag.flagType === "TAB_FOCUS_LOSS"),
          hasLowMouseEntropy: engagementFlags.some((flag) => flag.flagType === "LOW_MOUSE_ENTROPY"),
        })
      : null);

  const resolvedQuizScore = roundScore(participant.quizScore ?? quizAttempt?.totalScore ?? null);
  const resolvedAgentScore = roundScore(participant.agentScore ?? liveAssessmentSession?.overallScore ?? null);

  let resolvedOnchainScore = roundScore(participant.onchainScore);
  if (resolvedOnchainScore === null && hasOnchainVerification && onchainVerification?.verified) {
    const minAmountUsd = readMinAmountUsd(campaign.onchainConfig);
    const amountUsd = onchainVerification.amountUsd ? Number(onchainVerification.amountUsd) : null;
    const amountRatio =
      minAmountUsd && amountUsd && Number.isFinite(amountUsd) && minAmountUsd > 0
        ? amountUsd / minAmountUsd
        : undefined;

    resolvedOnchainScore = calculateOnchainScore({
      actionCompleted: true,
      amountRatio,
    });
  }

  const resolvedCompositeScore =
    roundScore(participant.compositeScore) ??
    calculateCompositeScoreForCampaign({
      videoScore: resolvedVideoScore,
      quizScore: resolvedQuizScore,
      onchainScore: resolvedOnchainScore,
      agentScore: resolvedAgentScore,
      hasStructuredQuiz,
      hasOnchainVerification,
    });

  const updates: Record<string, number | null> = {};
  if (participant.videoScore === null && resolvedVideoScore !== null) {
    updates.videoScore = resolvedVideoScore;
  }
  if (participant.quizScore === null && resolvedQuizScore !== null) {
    updates.quizScore = resolvedQuizScore;
  }
  if (participant.onchainScore === null && resolvedOnchainScore !== null) {
    updates.onchainScore = resolvedOnchainScore;
  }
  if (participant.agentScore === null && resolvedAgentScore !== null) {
    updates.agentScore = resolvedAgentScore;
  }
  if (participant.compositeScore === null && resolvedCompositeScore !== null) {
    updates.compositeScore = resolvedCompositeScore;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.campaignParticipant.update({
      where: { id: participant.id },
      data: updates,
    });
  }

  return {
    score: participant.score,
    rank: participant.rank,
    completedAt: participant.completedAt,
    videoScore: resolvedVideoScore,
    quizScore: resolvedQuizScore,
    onchainScore: resolvedOnchainScore,
    agentScore: resolvedAgentScore,
    compositeScore: resolvedCompositeScore,
    hasStructuredQuiz,
    hasOnchainVerification,
  };
}
