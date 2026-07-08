import { NextResponse } from "next/server";
import { agentTradingFundingEdgeSchema, jsonError } from "@/lib/server/validation";
import { recordWalletFundingEdge } from "@/lib/services/agentTradingRiskService";

export const dynamic = "force-dynamic";

function assertInternal(request: Request) {
  const secret = process.env.AGENT_TRADING_MONITOR_SECRET || process.env.INTERNAL_ADMIN_TOKEN || process.env.CRON_SECRET;
  if (!secret) return;
  const url = new URL(request.url);
  const supplied = request.headers.get("x-internal-admin-token")
    || request.headers.get("x-agent-trading-secret")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || url.searchParams.get("secret");
  if (supplied !== secret) throw new Error("Unauthorized internal request.");
}

export async function POST(request: Request) {
  try {
    assertInternal(request);
    const body = agentTradingFundingEdgeSchema.parse(await request.json());
    const result = await recordWalletFundingEdge(body);
    return NextResponse.json({
      edge: {
        id: result.edge.id,
        funderWallet: result.edge.funderWallet,
        fundedWallet: result.edge.fundedWallet,
        txHash: result.edge.txHash,
        logIndex: result.edge.logIndex,
        observedAt: result.edge.observedAt.toISOString()
      },
      flagsCreated: result.flags.length
    });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
