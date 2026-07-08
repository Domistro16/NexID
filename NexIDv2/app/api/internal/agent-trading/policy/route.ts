import { NextResponse } from "next/server";
import { agentTradingPolicyUpdateSchema, jsonError } from "@/lib/server/validation";
import { getAgentTradingRisk, updateAgentTradingPolicy } from "@/lib/services/agentTradingRiskService";

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

export async function GET(request: Request) {
  try {
    assertInternal(request);
    const walletAddress = new URL(request.url).searchParams.get("walletAddress");
    if (!walletAddress) throw new Error("walletAddress is required.");
    const tradingRisk = await getAgentTradingRisk(walletAddress);
    return NextResponse.json({ tradingRisk });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertInternal(request);
    const body = agentTradingPolicyUpdateSchema.parse(await request.json());
    const policy = await updateAgentTradingPolicy(body);
    return NextResponse.json({
      policy: {
        id: policy.id,
        walletAddress: policy.walletAddress,
        agentProfileId: policy.agentProfileId,
        publicId: policy.publicId,
        status: policy.status,
        dailyExposureLimitUsdc: policy.dailyExposureLimitUsdc,
        relaxedDailyLimitUsdc: policy.relaxedDailyLimitUsdc,
        relaxationTradeThreshold: policy.relaxationTradeThreshold,
        relaxationDurationDays: policy.relaxationDurationDays,
        tradingDisabled: policy.tradingDisabled,
        updatedAt: policy.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
