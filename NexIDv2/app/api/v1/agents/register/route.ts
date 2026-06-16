import { NextResponse } from "next/server";
import { agentApiError } from "@/lib/server/agent-api-error";
import { agentIdRegisterSchema } from "@/lib/server/validation";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { registerAgentId } from "@/lib/services/agentLaunchService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "agents:write");
    const body = agentIdRegisterSchema.parse(await request.json());
    const profile = await registerAgentId({ agent, name: body.name });
    return NextResponse.json({ profile, message: "Agent .id registered. Continue the launch with the same draft." });
  } catch (error) {
    const response = agentApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
