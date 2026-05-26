import { getNarrativeById } from "@/lib/services/narrativeService";
import { assertNarrativeTradable } from "@/lib/services/eligibilityService";
import { executionPolicy } from "@/lib/services/executionAdapter";
import { getExecutionMarket } from "@/lib/services/executionMarketService";
import type { OrderType, Side } from "@/lib/types/nexid";

export async function previewOrder(input: {
  narrativeId: string;
  side: Side;
  orderType: OrderType;
  amount: number;
  limitPrice?: number;
}) {
  const narrative = await getNarrativeById(input.narrativeId);
  if (!narrative) throw new Error("Narrative not found");
  assertNarrativeTradable(narrative);
  const executionMarket = await getExecutionMarket(input.narrativeId, input.side);
  const execution = executionPolicy();
  const price = input.orderType === "limit" ? input.limitPrice ?? narrative.fadePrice : input.side === "ride" ? narrative.ridePrice : narrative.fadePrice;
  const shares = input.amount / Math.max(price, 0.01);
  const polymarketFee = input.amount * 0.0025;
  const nexidFee = input.amount * 0.005;
  const spreadWarning = narrative.spread > 4.5 ? "Spread is wide. Limit order may be safer." : null;
  const executionAvailable = Boolean(executionMarket?.tokenId) && (execution.operatorExecutable || execution.userSignedAvailable);
  const executionWarning =
    !executionMarket?.tokenId
      ? "No executable Polymarket token is mapped for this side."
      : execution.blockingReason ??
        execution.warning ??
        (execution.userSignedAvailable ? "Your wallet will sign and submit this order directly to Polymarket." : null);
  return {
    narrative,
    price,
    shares,
    maxReturn: shares,
    maxLoss: input.amount,
    fee: polymarketFee + nexidFee,
    polymarketFee,
    nexidFee,
    rewardContribution: nexidFee * 0.9,
    expiry: narrative.expiry,
    spreadWarning,
    executionWarning,
    executionMode: execution.mode,
    executionCustody: execution.controlledLaunch ? "operator_controlled" : execution.userSafe ? "user_signed" : "disabled",
    executionAvailable,
    marketQualityScore: executionMarket?.qualityScore ?? narrative.qualityScore ?? null,
    marketId: executionMarket?.marketId ?? ("bestMarketId" in narrative ? narrative.bestMarketId ?? null : null),
    outcomeToken: executionMarket?.tokenId ?? null
  };
}
