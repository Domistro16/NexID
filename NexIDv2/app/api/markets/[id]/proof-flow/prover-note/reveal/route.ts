import { NextResponse } from "next/server";
import { jsonError, proofFlowProverRevealSchema } from "@/lib/server/validation";
import { revealProofFlowReviewerNote } from "@/lib/services/proofFlowService";
import { requireReviewerAuthUser } from "@/lib/services/reviewerAccessService";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireReviewerAuthUser();
    const body = proofFlowProverRevealSchema.parse(await request.json());
    const proofFlow = await revealProofFlowReviewerNote({ ...body, marketId: id, walletAddress: user.walletAddress });
    return NextResponse.json({ ok: true, proofFlow });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error.includes("authentication") ? 401 : 400 });
  }
}
