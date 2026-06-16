import { NextResponse } from "next/server";
import { agentApiError } from "@/lib/server/agent-api-error";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { searchMarketsForAgent } from "@/lib/services/agentLaunchService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "markets:search");
    const url = new URL(request.url);
    const markets = await searchMarketsForAgent({
      agent,
      query: url.searchParams.get("q"),
      limit: Number(url.searchParams.get("limit") ?? 20)
    });
    return NextResponse.json({ markets });
  } catch (error) {
    const response = agentApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
