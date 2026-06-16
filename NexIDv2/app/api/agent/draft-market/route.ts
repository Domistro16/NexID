import { NextResponse } from "next/server";
import { agentMarketDraftSchema, jsonError } from "@/lib/server/validation";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { draftMarketForAgent } from "@/lib/services/nexmind/nexmindAgentMarketService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "markets:draft");
    const body = agentMarketDraftSchema.parse(await request.json());
    const result = await draftMarketForAgent({ agent, rawThesis: body.rawThesis, arenaHint: body.arenaHint });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
