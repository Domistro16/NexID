import { NextResponse } from "next/server";
import { jsonError, nativeResolutionApproveSchema } from "@/lib/server/validation";
import { finalizeProofFlowMarket } from "@/lib/services/proofFlowService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = nativeResolutionApproveSchema.parse(await request.json());
    const proofFlow = await finalizeProofFlowMarket({
      marketId: body.marketId,
      walletAddress: body.proposerWallet,
      outcome: body.outcome,
      evidenceText: body.evidenceText,
      sourceUrl: body.sourceUrl,
      force: true
    });
    return NextResponse.json({
      ok: true,
      proofFlow
    });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
