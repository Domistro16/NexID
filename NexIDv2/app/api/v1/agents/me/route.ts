import { NextResponse } from "next/server";
import { agentApiError } from "@/lib/server/agent-api-error";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { getAgentMe } from "@/lib/services/agentLaunchService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "agents:read");
    return NextResponse.json(await getAgentMe(agent));
  } catch (error) {
    const response = agentApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
