import { NextResponse } from "next/server";
import { agentApiError } from "@/lib/server/agent-api-error";
import { v1MarketLaunchSchema } from "@/lib/server/validation";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { launchMarketForAgent } from "@/lib/services/agentLaunchService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "markets:launch");
    const body = v1MarketLaunchSchema.parse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key") ?? body.idempotencyKey ?? undefined;
    const result = await launchMarketForAgent({
      agent,
      draft: body.draft,
      draftId: body.draftId,
      chainId: body.chainId,
      forceCreate: body.forceCreate,
      idempotencyKey,
      launchMethod: "agent_api"
    });
    return NextResponse.json(result);
  } catch (error) {
    const response = agentApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
