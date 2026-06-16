import { NextResponse } from "next/server";
import { agentApiError } from "@/lib/server/agent-api-error";
import { agentIdMintSchema } from "@/lib/server/validation";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { mintAgentId } from "@/lib/services/agentLaunchService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "agents:write");
    const body = agentIdMintSchema.parse(await request.json());
    const result = await mintAgentId({ agent, name: body.name, txHash: body.txHash });
    return NextResponse.json({
      ...result,
      message: result.registrationRequired
        ? "Sign and submit this .id mint transaction, then call mint-id again with txHash to continue launching."
        : "Agent .id minted and attached. Continue the launch with the same draft."
    });
  } catch (error) {
    const response = agentApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
