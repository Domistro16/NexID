import { NextResponse } from "next/server";
import { jsonError, proofFlowProverNoteSchema } from "@/lib/server/validation";
import { submitProofFlowReviewerNote } from "@/lib/services/proofFlowService";
import { requireReviewerAuthUser } from "@/lib/services/reviewerAccessService";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireReviewerAuthUser();
    const body = proofFlowProverNoteSchema.parse(await request.json());
    const proofFlow = await submitProofFlowReviewerNote({ ...body, marketId: id, walletAddress: user.walletAddress });
    return NextResponse.json({ ok: true, proofFlow });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error.includes("authentication") ? 401 : 400 });
  }
}
