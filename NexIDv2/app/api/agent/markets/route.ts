import { NextResponse } from "next/server";
import { agentMarketCreateSchema, jsonError } from "@/lib/server/validation";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { launchMarketForAgent } from "@/lib/services/agentLaunchService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "markets:launch");
    const body = agentMarketCreateSchema.parse(await request.json());
    const result = await launchMarketForAgent({
      agent,
      draft: body.draft,
      chainId: body.chainId,
      forceCreate: body.forceCreate,
      idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
      launchMethod: "legacy_agent_api"
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
