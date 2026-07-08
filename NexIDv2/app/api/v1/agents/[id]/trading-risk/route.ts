import { NextResponse } from "next/server";
import { agentApiError } from "@/lib/server/agent-api-error";
import { getAgentTradingRisk } from "@/lib/services/agentTradingRiskService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tradingRisk = await getAgentTradingRisk(id);
    return NextResponse.json({ tradingRisk });
  } catch (error) {
    const response = agentApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
