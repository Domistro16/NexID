import { NextResponse } from "next/server";
import { agentMarketCreateSchema, jsonError } from "@/lib/server/validation";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { createMarketForAgent } from "@/lib/services/nexmind/nexmindAgentMarketService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "launch");
    const body = agentMarketCreateSchema.parse(await request.json());
    const result = await createMarketForAgent({
      agent,
      draft: body.draft,
      chainId: body.chainId,
      forceCreate: body.forceCreate
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
