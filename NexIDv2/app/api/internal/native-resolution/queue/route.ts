import { NextResponse } from "next/server";
import { jsonError, nativeResolutionQueueSchema } from "@/lib/server/validation";
import { submitProofFlowProvisional } from "@/lib/services/proofFlowService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = nativeResolutionQueueSchema.parse(await request.json());
    const proofFlow = await submitProofFlowProvisional({
      marketId: body.marketId,
      outcome: body.outcome,
      evidenceText: body.claim,
      walletAddress: body.proposerWallet,
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
