import { NextResponse } from "next/server";
import { agentMarketRouteSchema, jsonError } from "@/lib/server/validation";
import { assertX402Access, paidEndpointMetadata } from "@/lib/services/bankr/x402AccessService";
import { routeCheckNexMindMarket } from "@/lib/services/nexmind/nexmindRoutingService";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(paidEndpointMetadata("market-routing", 0.003));
}

export async function POST(request: Request) {
  try {
    assertX402Access(request);
    const body = agentMarketRouteSchema.parse(await request.json());
    const decision = await routeCheckNexMindMarket({ draft: body.draft });
    return NextResponse.json({ decision });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
