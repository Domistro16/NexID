import type { Narrative } from "@/lib/types/nexid";

export function marketQualityScore(narrative: Narrative) {
  const liquidityScore = Math.min(40, Math.round(narrative.liquidity / 30000));
  const spreadScore = Math.max(0, 25 - Math.round(narrative.spread * 3));
  const activityScore = Math.min(25, Math.round((narrative.riders + narrative.faders) / 250));
  const clarityScore = narrative.quality === "Strong" || narrative.quality === "Clean" ? 10 : 5;
  return Math.min(100, liquidityScore + spreadScore + activityScore + clarityScore);
}

export function noTradeReason(narrative: Narrative) {
  if (narrative.liquidity < 150000) return "Liquidity below V1 threshold";
  if (narrative.spread > 6) return "Spread too wide";
  if (marketQualityScore(narrative) < 55) return "Market quality score too low";
  return null;
}

export function mappedMarketQuality(market: {
  liquidity: number;
  volume24h: number;
  spread: number;
  expiry: Date | null;
  enableOrderBook: boolean;
  active?: boolean;
  closed?: boolean;
}) {
  const liquidityScore = Math.min(35, Math.round(market.liquidity / 12000));
  const volumeScore = Math.min(25, Math.round(market.volume24h / 8000));
  const spreadScore = Math.max(0, 25 - Math.round(market.spread * 300));
  const expiryScore = market.expiry && market.expiry.getTime() > Date.now() ? 8 : 0;
  const orderbookScore = market.enableOrderBook ? 7 : 0;
  return Math.max(0, Math.min(100, liquidityScore + volumeScore + spreadScore + expiryScore + orderbookScore));
}

export function noTradeMarketReason(market: {
  liquidity: number;
  volume24h: number;
  spread: number;
  expiry: Date | null;
  enableOrderBook: boolean;
  active?: boolean;
  closed?: boolean;
}) {
  if (market.closed || market.active === false) return "Market is closed";
  if (!market.enableOrderBook) return "Orderbook not enabled";
  if (market.liquidity < 150000) return "Liquidity below V1 threshold";
  if (market.volume24h < 25000) return "Volume below V1 threshold";
  if (market.spread > 0.06) return "Spread too wide";
  if (!market.expiry || market.expiry.getTime() <= Date.now()) return "Market expiry unavailable or passed";
  if (mappedMarketQuality(market) < 55) return "Market quality score too low";
  return null;
}
