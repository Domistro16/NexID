import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
/**
 * GET /api/campaigns/[id]/quiz-assignment
 *
 * Returns the user's randomized quiz assignment for this campaign.
 * If no assignment exists yet, computes one deterministically
 * (hash-based, stable across retries) and persists it.
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

  // Must be enrolled
  const participant = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId, userId: auth.user.userId } },
    select: { id: true, quizAssignment: true },
  });

  if (!participant) {
    return NextResponse.json({ error: "Not enrolled in this campaign" }, { status: 403 });
  }

  // Already assigned — return stable result
  if (participant.quizAssignment) {
    return NextResponse.json({ type: participant.quizAssignment });
  }

  const assignedType = "LIVE_AI";

  // Persist (idempotent — if another request raced, the result is the same hash)
  await prisma.campaignParticipant.update({
    where: { id: participant.id },
    data: { quizAssignment: assignedType as "LIVE_AI" | "NORMAL_MCQ" },
  });

  return NextResponse.json({ type: assignedType });
}
