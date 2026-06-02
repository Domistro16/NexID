import { NextResponse } from "next/server";
import { jsonError, nativeResolutionApproveSchema } from "@/lib/server/validation";
import { approveVerifiedMarketResult } from "@/lib/services/nativeResultVerificationService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = nativeResolutionApproveSchema.parse(await request.json());
    const resolution = await approveVerifiedMarketResult(body);
    return NextResponse.json({
      ok: true,
      resolution: {
        id: resolution.id,
        marketId: resolution.marketId,
        status: resolution.status,
        outcome: resolution.proposedOutcome,
        verificationStatus: resolution.verificationStatus
      }
    });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
