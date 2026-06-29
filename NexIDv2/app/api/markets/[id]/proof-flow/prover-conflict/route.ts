import { NextResponse } from "next/server";
import { jsonError, proofFlowProverConflictReportSchema } from "@/lib/server/validation";
import { reportProofFlowReviewerConflict } from "@/lib/services/proofFlowService";
import { requireSessionUser } from "@/lib/services/authService";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSessionUser();
    const body = proofFlowProverConflictReportSchema.parse(await request.json());
    const result = await reportProofFlowReviewerConflict({
      ...body,
      reviewerWallet: body.proverWallet ?? body.reviewerWallet,
      marketId: id,
      reporterUserId: user.id,
      reporterWallet: user.walletAddress
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
