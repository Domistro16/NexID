import prisma from "@/lib/prisma";
import { hasStructuredFreeTextGradingProvider } from "@/lib/services/quiz-grading.service";

export type QuizMode = "MCQ" | "FREE_TEXT";

type AssessmentConfig = {
  quizMode: QuizMode | null;
  quizRequired: boolean;
  quizCompleted: boolean;
  onchainRequired: boolean;
  onchainCompleted: boolean;
  advocacyCompleted: boolean;
  liveAssessmentCompleted: boolean;
  liveAssessmentRequired: true;
  quizScore: number | null;
  onchainScore: number | null;
  liveAssessmentScore: number | null;
  mcqQuestionCount: number;
  freeTextQuestionCount: number;
  liveAssessmentQuestionCount: number;
  freeTextQuizAvailable: boolean;
};

export type CampaignAssessmentSummary = {
  quizMode: QuizMode | null;
  mcqQuestionCount: number;
  freeTextQuestionCount: number;
  liveAssessmentQuestionCount: number;
  freeTextQuizAvailable: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readQuizModeFromModules(rawModules: unknown): QuizMode | null {
  if (!Array.isArray(rawModules) || rawModules.length === 0) {
    return null;
  }

  const firstGroup = rawModules[0];
  if (!isRecord(firstGroup)) {
    return null;
  }

  const directQuizMode = typeof firstGroup.quizMode === "string" ? firstGroup.quizMode : null;
  if (directQuizMode === "MCQ" || directQuizMode === "FREE_TEXT") {
    return directQuizMode;
  }

  const assessmentConfig = firstGroup.assessmentConfig;
  if (!isRecord(assessmentConfig)) {
    return null;
  }

  const nestedQuizMode =
    typeof assessmentConfig.quizMode === "string" ? assessmentConfig.quizMode : null;
  return nestedQuizMode === "MCQ" || nestedQuizMode === "FREE_TEXT" ? nestedQuizMode : null;
}

export function resolveFallbackQuizMode(input: {
  explicitQuizMode: QuizMode | null;
  mcqQuestionCount: number;
  freeTextQuestionCount: number;
  freeTextQuizAvailable: boolean;
}): QuizMode | null {
  if (input.explicitQuizMode === "MCQ") {
    return input.mcqQuestionCount >= 5 ? "MCQ" : null;
  }

  if (input.explicitQuizMode === "FREE_TEXT") {
    if (input.freeTextQuizAvailable && input.freeTextQuestionCount >= 5) {
      return "FREE_TEXT";
    }

    if (input.mcqQuestionCount >= 5) {
      return "MCQ";
    }

    return null;
  }

  if (input.mcqQuestionCount >= 5) {
    return "MCQ";
  }

  if (input.freeTextQuizAvailable && input.freeTextQuestionCount >= 5) {
    return "FREE_TEXT";
  }

  return null;
}

export async function getCampaignAssessmentSummary(
  campaignId: number,
): Promise<CampaignAssessmentSummary> {
  const freeTextQuizAvailable = hasStructuredFreeTextGradingProvider();
  const [campaign, mcqQuestionCount, freeTextQuestionCount, liveAssessmentQuestionCount] =
    await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { modules: true },
      }),
      prisma.question.count({
        where: { campaignId, type: "MCQ", isActive: true, isSpeedTrap: false },
      }),
      prisma.question.count({
        where: { campaignId, type: "FREE_TEXT", isActive: true, isSpeedTrap: false },
      }),
      prisma.question.count({
        where: {
          campaignId,
          type: "FREE_TEXT",
          isActive: true,
          isSpeedTrap: false,
          gradingRubric: { not: null },
        },
      }),
    ]);

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const explicitQuizMode = readQuizModeFromModules(campaign.modules);
  const quizMode = resolveFallbackQuizMode({
    explicitQuizMode,
    mcqQuestionCount,
    freeTextQuestionCount,
    freeTextQuizAvailable,
  });

  return {
    quizMode,
    mcqQuestionCount,
    freeTextQuestionCount,
    liveAssessmentQuestionCount,
    freeTextQuizAvailable,
  };
}

export async function getCampaignAssessmentConfig(
  campaignId: number,
  userId: string,
): Promise<AssessmentConfig> {
  const [campaign, participant, quizAttempt, liveAssessmentSession, assessmentSummary] =
    await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { modules: true, onchainConfig: true },
      }),
      prisma.campaignParticipant.findUnique({
        where: { campaignId_userId: { campaignId, userId } },
        select: { quizScore: true, agentScore: true, onchainScore: true, advocacyCompletedAt: true },
      }),
      prisma.quizAttempt.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
        select: { completedAt: true, totalScore: true },
      }),
      prisma.agentSession.findFirst({
        where: {
          userId,
          campaignId,
          sessionType: "CAMPAIGN_ASSESSMENT",
          status: "COMPLETED",
        },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true, overallScore: true },
      }),
      getCampaignAssessmentSummary(campaignId),
    ]);

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  if (!participant) {
    throw new Error("Not enrolled in this campaign");
  }

  const {
    quizMode,
    mcqQuestionCount,
    freeTextQuestionCount,
    liveAssessmentQuestionCount,
    freeTextQuizAvailable,
  } =
    assessmentSummary;

  if (quizMode === "FREE_TEXT" && freeTextQuestionCount < 5) {
    throw new Error("Free-text quiz assessment requires at least 5 active free-text questions");
  }

  if (quizMode === "MCQ" && mcqQuestionCount < 5) {
    throw new Error("MCQ quiz assessment requires at least 5 active MCQ questions");
  }

  if (liveAssessmentQuestionCount < 2) {
    throw new Error("Live AI assessment requires at least 2 active free-text questions with grading rubrics");
  }

  const onchainRequired = Boolean(campaign.onchainConfig);

  return {
    quizMode,
    quizRequired: Boolean(quizMode),
    quizCompleted: quizMode ? Boolean(quizAttempt?.completedAt) : true,
    onchainRequired,
    onchainCompleted: onchainRequired ? participant.onchainScore !== null : true,
    advocacyCompleted: Boolean(participant.advocacyCompletedAt),
    liveAssessmentCompleted: Boolean(liveAssessmentSession?.completedAt),
    liveAssessmentRequired: true,
    quizScore: participant.quizScore ?? quizAttempt?.totalScore ?? null,
    onchainScore: participant.onchainScore ?? null,
    liveAssessmentScore: participant.agentScore ?? liveAssessmentSession?.overallScore ?? null,
    mcqQuestionCount,
    freeTextQuestionCount,
    liveAssessmentQuestionCount,
    freeTextQuizAvailable,
  };
}
