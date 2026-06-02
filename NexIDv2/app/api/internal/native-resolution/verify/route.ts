import { NextResponse } from "next/server";
import { jsonError, nativeResolutionVerifySchema } from "@/lib/server/validation";
import { verifyNativeMarketResult } from "@/lib/services/nativeResultVerificationService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = nativeResolutionVerifySchema.parse(await request.json());
    const result = await verifyNativeMarketResult(body.marketId, body);
    return NextResponse.json(result, { status: result.ok ? 200 : 424 });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
