import { NextResponse } from "next/server";
import { jsonError, proofFlowFinalizeSchema } from "@/lib/server/validation";
import { refundProofFlowMarket } from "@/lib/services/proofFlowService";
import { requireSessionUser } from "@/lib/services/authService";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSessionUser();
    const body = proofFlowFinalizeSchema.parse(await request.json().catch(() => ({})));
    const proofFlow = await refundProofFlowMarket({
      marketId: id,
      walletAddress: user.walletAddress,
      evidenceText: body.evidenceText,
      evidenceUrl: body.evidenceUrl,
      sourceUrl: body.sourceUrl,
      force: false
    });
    return NextResponse.json({ ok: true, proofFlow });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
