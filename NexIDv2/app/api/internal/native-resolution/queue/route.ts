import { NextResponse } from "next/server";
import { jsonError, nativeResolutionQueueSchema } from "@/lib/server/validation";
import { queueNativeMarketUmaAssertion } from "@/lib/services/nativeResolutionBotService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = nativeResolutionQueueSchema.parse(await request.json());
    const resolution = await queueNativeMarketUmaAssertion(body);
    return NextResponse.json({
      ok: true,
      resolution: {
        id: resolution.id,
        marketId: resolution.marketId,
        status: resolution.status,
        outcome: resolution.proposedOutcome,
        assertionDeadline: resolution.assertionDeadline?.toISOString() ?? null
      }
    });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
