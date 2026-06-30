import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const marketRoom = () => readFileSync("components/nexmarkets/market-room.tsx", "utf8");
const nativeTicket = () => readFileSync("components/nexmarkets/native-trade-ticket.tsx", "utf8");
const tradeRoute = () => readFileSync("app/api/native-markets/[id]/trade/route.ts", "utf8");
const targetOrderService = () => readFileSync("lib/services/nativeTargetOrderService.ts", "utf8");

function matchCount(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

test("direct native market orders use buy and record only after tx hash", () => {
  const room = marketRoom();
  const ticket = nativeTicket();

  assert.doesNotMatch(room, /buyFor/);
  assert.doesNotMatch(ticket, /buyFor/);
  assert.match(room, /functionName:\s*"buy"/);
  assert.match(ticket, /functionName:\s*"buy"/);
  assert.equal(matchCount(room, /recordNativeMarketTradeApi\(market\.id/g), 1);
  assert.equal(matchCount(ticket, /recordNativeMarketTradeApi\(marketId/g), 1);
  assert.match(room, /txHash:\s*hash as Hex/);
  assert.match(ticket, /txHash:\s*hash as Hex/);
});

test("native trade amounts are normalized before contract calls and target verification", () => {
  const room = marketRoom();
  const ticket = nativeTicket();
  const targetService = targetOrderService();

  assert.match(room, /numberToUsdcUnits\(amount\)/);
  assert.match(room, /normalizeUsdcAmount/);
  assert.match(ticket, /numberToUsdcUnits\(amount\)/);
  assert.match(ticket, /normalizeUsdcAmount/);
  assert.match(targetService, /numberToUsdcUnits\(input\.amount\)/);
  assert.doesNotMatch(room, /parseUnits\(String\(Math\.max\(0,\s*amount/);
  assert.doesNotMatch(ticket, /parseUnits\(String\(amount/);
  assert.doesNotMatch(targetService, /parseUnits\(String\(input\.amount/);
});

test("native trade API verifies event notional and exposes current fee split", () => {
  const route = tradeRoute();

  assert.match(route, /event\.notional !== expectedNotional/);
  assert.match(route, /Trade amount does not match the onchain transaction/);
  assert.match(route, /nativeCreatorFeeRate/);
  assert.match(route, /nativePlatformFeeRate/);
  assert.match(route, /nativeProversPoolFeeRate/);
  assert.match(route, /nativeBuybackBurnFeeRate/);
  assert.match(route, /proversPoolBps/);
  assert.match(route, /payload:\s*\{\s*path:\s*\["txHash"\],\s*equals:\s*body\.txHash\s*\}/);
  assert.doesNotMatch(route, /protocolBps:\s*60/);
  assert.doesNotMatch(route, /securityBps:\s*20/);
});

test("native curve markets open on immediate market order by default", () => {
  const room = marketRoom();

  assert.match(room, /useState<OrderType>\(\(\) => engine === "curve" \? "market" : "limit"\)/);
  assert.match(room, /setOrderType\(engine === "curve" \? "market" : "limit"\)/);
});
