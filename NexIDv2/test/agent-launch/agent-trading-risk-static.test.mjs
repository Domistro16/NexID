import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("lib/services/agentTradingRiskService.ts", "utf8");
const tradeRoute = readFileSync("app/api/native-markets/[id]/trade/route.ts", "utf8");
const targetOrderService = readFileSync("lib/services/nativeTargetOrderService.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const validation = readFileSync("lib/server/validation.ts", "utf8");
const publicRoute = readFileSync("app/api/v1/agents/[id]/trading-risk/route.ts", "utf8");
const fundingRoute = readFileSync("app/api/internal/agent-trading/funding-edge/route.ts", "utf8");
const policyRoute = readFileSync("app/api/internal/agent-trading/policy/route.ts", "utf8");
const profileService = readFileSync("lib/services/agentProfileService.ts", "utf8");
const docs = readFileSync("docs/agent-trading-risk.md", "utf8");

test("agent trading risk models expose policy, exposure, flags, and funding graph state", () => {
  assert.match(schema, /model AgentTradingPolicy/);
  assert.match(schema, /selfTradeEver\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /model AgentTradingExposureLedger/);
  assert.match(schema, /model AgentTradingRiskFlag/);
  assert.match(schema, /model WalletFundingEdge/);
  assert.match(schema, /@@index\(\[walletAddress, flagType, createdAt\]\)/);
});

test("agents still use the standard native trade path with policy checks around it", () => {
  assert.match(tradeRoute, /verifiedTradeEvent/);
  assert.match(tradeRoute, /TradeExecuted/);
  assert.match(tradeRoute, /assertAgentTradeWithinLimit/);
  assert.match(tradeRoute, /recordAgentNativeTradeRisk/);
  assert.match(targetOrderService, /assertAgentTradeWithinLimit/);
  assert.match(targetOrderService, /recordAgentNativeTradeRisk/);
  assert.doesNotMatch(tradeRoute, /agentTrade|tradeForAgent|buyForAgent/);
});

test("self-trade disclosure is public and not a blocker", () => {
  assert.match(service, /SELF_TRADE_CREATED_MARKET/);
  assert.match(service, /selfTradeEver:\s*true/);
  assert.match(service, /self_trade_disclosure/);
  assert.match(service, /weight:\s*0/);
  assert.match(profileService, /tradingRisk/);
  assert.match(publicRoute, /getAgentTradingRisk/);
  assert.match(docs, /does not block the trade/);
});

test("early trust-period rate limits are configurable and relaxable", () => {
  assert.match(service, /NEXMARKETS_AGENT_TRADING_DAILY_EXPOSURE_USDC/);
  assert.match(service, /NEXMARKETS_AGENT_TRADING_RELAXED_DAILY_EXPOSURE_USDC/);
  assert.match(service, /NEXMARKETS_AGENT_TRADING_RELAXATION_TRADES/);
  assert.match(service, /NEXMARKETS_AGENT_TRADING_RELAXATION_DAYS/);
  assert.match(service, /Agent daily trading exposure limit exceeded/);
  assert.match(policyRoute, /agentTradingPolicyUpdateSchema/);
  assert.match(validation, /agentTradingPolicyUpdateSchema/);
  assert.match(docs, /Per-wallet policy can also be updated/);
});

test("wash-trading heuristic uses funding edges plus opposite-side same-market trades", () => {
  assert.match(service, /WASH_TRADE_HEURISTIC/);
  assert.match(service, /funding_edge_then_opposite_side_same_market/);
  assert.match(service, /oppositeSide/);
  assert.match(service, /walletFundingEdge\.findMany/);
  assert.match(service, /nativeTrade\.findFirst/);
  assert.match(fundingRoute, /recordWalletFundingEdge/);
  assert.match(validation, /agentTradingFundingEdgeSchema/);
  assert.match(docs, /manual-review signal/);
});
