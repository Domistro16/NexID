import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { getCampaignAssessmentConfig } from "@/lib/services/campaign-assessment-config.service";
import { resolveCampaignId } from "@/lib/campaign-route";
/**
 * GET /api/campaigns/[id]/quiz-assignment
 *
 * Returns the structured quiz mode and current assessment-stage progress
 * for this campaign. Live AI assessment is always required and is tracked
 * separately from the structured quiz assessment.
 */
export async function GET(
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

  try {
    const assessmentConfig = await getCampaignAssessmentConfig(campaignId, auth.user.userId);
    const nextStage = assessmentConfig.quizRequired && !assessmentConfig.quizCompleted
      ? "QUIZ_ASSESSMENT"
      : assessmentConfig.onchainRequired && !assessmentConfig.onchainCompleted
      ? "ONCHAIN_VERIFICATION"
      : !assessmentConfig.advocacyCompleted
      ? "PROOF_OF_ADVOCACY"
      : !assessmentConfig.liveAssessmentCompleted
      ? "LIVE_AI_ASSESSMENT"
      : "COMPLETE";

    return NextResponse.json({
      ...assessmentConfig,
      nextStage,
      type:
        nextStage === "QUIZ_ASSESSMENT"
          ? "NORMAL_MCQ"
          : nextStage === "LIVE_AI_ASSESSMENT"
          ? "LIVE_AI"
          : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resolve campaign assessment config";
    const status = message === "Campaign not found" ? 404 : message === "Not enrolled in this campaign" ? 403 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
