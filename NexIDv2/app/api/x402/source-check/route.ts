import { NextResponse } from "next/server";
import { jsonError, nexmindSourceCheckSchema } from "@/lib/server/validation";
import { assertX402Access, paidEndpointMetadata } from "@/lib/services/bankr/x402AccessService";
import { checkMarketSourceHealth } from "@/lib/services/nexmind/nexmindSourceMonitorService";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(paidEndpointMetadata("source-check", 0.005));
}

export async function POST(request: Request) {
  try {
    assertX402Access(request);
    const body = nexmindSourceCheckSchema.parse(await request.json());
    const check = await checkMarketSourceHealth({
      id: body.marketId ?? "x402_source_check",
      title: body.title,
      status: "draft",
      sourceUrl: body.sourceUrl,
      creatorUserId: null,
      creatorWallet: null,
      sourceHealthStatus: "unknown",
      routeDecision: { fallbackSourceUrl: body.fallbackSourceUrl ?? null }
    });
    return NextResponse.json({ check });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
