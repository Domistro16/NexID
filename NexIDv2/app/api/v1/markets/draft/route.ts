import { NextResponse } from "next/server";
import { agentApiError } from "@/lib/server/agent-api-error";
import { v1MarketDraftSchema } from "@/lib/server/validation";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { draftMarketForLaunchAgent } from "@/lib/services/agentLaunchService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "markets:draft");
    const body = v1MarketDraftSchema.parse(await request.json());
    const result = await draftMarketForLaunchAgent({ agent, rawThesis: body.rawThesis, arenaHint: body.arenaHint });
    return NextResponse.json(result);
  } catch (error) {
    const response = agentApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
