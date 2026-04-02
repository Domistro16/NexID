import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { getCampaignAssessmentConfig } from "@/lib/services/campaign-assessment-config.service";
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
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  try {
    const assessmentConfig = await getCampaignAssessmentConfig(campaignId, auth.user.userId);
    const nextStage = !assessmentConfig.quizCompleted
      ? "QUIZ_ASSESSMENT"
      : !assessmentConfig.liveAssessmentCompleted
      ? "LIVE_AI_ASSESSMENT"
      : "COMPLETE";

    return NextResponse.json({
      ...assessmentConfig,
      nextStage,
      type: nextStage === "LIVE_AI_ASSESSMENT" ? "LIVE_AI" : "NORMAL_MCQ",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resolve campaign assessment config";
    const status = message === "Campaign not found" ? 404 : message === "Not enrolled in this campaign" ? 403 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
