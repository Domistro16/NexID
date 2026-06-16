import { NextResponse } from "next/server";
import { agentApiError } from "@/lib/server/agent-api-error";
import { v1MarketValidationSchema } from "@/lib/server/validation";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { validateMarketForAgent } from "@/lib/services/agentLaunchService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "markets:validate");
    const body = v1MarketValidationSchema.parse(await request.json());
    const validation = await validateMarketForAgent({
      agent,
      draft: body.draft,
      draftId: body.draftId,
      forceCreate: body.forceCreate,
      publicLaunchMode: body.publicLaunchMode
    });
    return NextResponse.json({
      draft: validation.draft,
      decision: validation.decision,
      validation: {
        valid: validation.valid,
        failures: validation.failures,
        sourceQualification: validation.sourceQualification
      },
      launchBond: validation.launchBond
    });
  } catch (error) {
    const response = agentApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
