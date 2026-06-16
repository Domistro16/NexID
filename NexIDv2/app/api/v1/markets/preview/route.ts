import { NextResponse } from "next/server";
import { agentApiError } from "@/lib/server/agent-api-error";
import { v1MarketPreviewSchema } from "@/lib/server/validation";
import { authenticateAgentRequest } from "@/lib/services/bankr/agentAuthService";
import { previewMarketForAgent } from "@/lib/services/agentLaunchService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgentRequest(request, "markets:preview");
    const body = v1MarketPreviewSchema.parse(await request.json());
    const preview = await previewMarketForAgent({
      agent,
      draft: body.draft,
      draftId: body.draftId,
      forceCreate: body.forceCreate,
      publicLaunchMode: body.publicLaunchMode
    });
    return NextResponse.json(preview);
  } catch (error) {
    const response = agentApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
