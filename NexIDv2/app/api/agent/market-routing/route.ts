import { NextResponse } from "next/server";
import { agentMarketRouteSchema, jsonError } from "@/lib/server/validation";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { routeMarketForAgent } from "@/lib/services/nexmind/nexmindAgentMarketService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "route");
    const body = agentMarketRouteSchema.parse(await request.json());
    const decision = await routeMarketForAgent({ agent, draft: body.draft });
    return NextResponse.json({ decision });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
