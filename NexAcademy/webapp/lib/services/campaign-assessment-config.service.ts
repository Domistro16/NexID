import prisma from "@/lib/prisma";

export type QuizMode = "MCQ" | "FREE_TEXT";

type AssessmentConfig = {
  quizMode: QuizMode;
  quizCompleted: boolean;
  liveAssessmentCompleted: boolean;
  liveAssessmentRequired: true;
  quizScore: number | null;
  liveAssessmentScore: number | null;
  mcqQuestionCount: number;
  freeTextQuestionCount: number;
  liveAssessmentQuestionCount: number;
};

export type CampaignAssessmentSummary = {
  quizMode: QuizMode | null;
  mcqQuestionCount: number;
  freeTextQuestionCount: number;
  liveAssessmentQuestionCount: number;
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
}): QuizMode | null {
  if (input.explicitQuizMode) {
    return input.explicitQuizMode;
  }

  if (input.mcqQuestionCount >= 5) {
    return "MCQ";
  }

  if (input.freeTextQuestionCount >= 5) {
    return "FREE_TEXT";
  }

  return null;
}

export async function getCampaignAssessmentSummary(
  campaignId: number,
): Promise<CampaignAssessmentSummary> {
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
  });

  return {
    quizMode,
    mcqQuestionCount,
    freeTextQuestionCount,
    liveAssessmentQuestionCount,
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
        select: { modules: true },
      }),
      prisma.campaignParticipant.findUnique({
        where: { campaignId_userId: { campaignId, userId } },
        select: { quizScore: true, agentScore: true },
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

  const { quizMode, mcqQuestionCount, freeTextQuestionCount, liveAssessmentQuestionCount } =
    assessmentSummary;

  if (!quizMode) {
    throw new Error("Campaign quiz assessment is not configured with at least 5 MCQ or 5 free-text questions");
  }

  if (quizMode === "FREE_TEXT" && freeTextQuestionCount < 5) {
    throw new Error("Free-text quiz assessment requires at least 5 active free-text questions");
  }

  if (quizMode === "MCQ" && mcqQuestionCount < 5) {
    throw new Error("MCQ quiz assessment requires at least 5 active MCQ questions");
  }

  if (liveAssessmentQuestionCount < 2) {
    throw new Error("Live AI assessment requires at least 2 active free-text questions with grading rubrics");
  }

  return {
    quizMode,
    quizCompleted: Boolean(quizAttempt?.completedAt),
    liveAssessmentCompleted: Boolean(liveAssessmentSession?.completedAt),
    liveAssessmentRequired: true,
    quizScore: participant.quizScore ?? quizAttempt?.totalScore ?? null,
    liveAssessmentScore: participant.agentScore ?? liveAssessmentSession?.overallScore ?? null,
    mcqQuestionCount,
    freeTextQuestionCount,
    liveAssessmentQuestionCount,
  };
}
