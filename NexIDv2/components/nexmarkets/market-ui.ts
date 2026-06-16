import { marketOriginDetail, marketOriginLabel, marketStatusLabel, marketTemplateLabel, toTitleLabel } from "@/components/nexmarkets/copy";
import type { NexMarket } from "@/lib/types/nexmarkets";

type RouteRaw = {
  outcomes?: unknown;
  outcomePrices?: unknown;
  clobTokenIds?: unknown;
  tokens?: unknown;
  yesPrice?: unknown;
  noPrice?: unknown;
  lastTradePrice?: unknown;
  price?: unknown;
  bestBid?: unknown;
  bestAsk?: unknown;
  liquidity?: unknown;
  volume24h?: unknown;
  expiry?: unknown;
};

export type NativeMarketDisplayStats = {
  rideShares?: number;
  fadeShares?: number;
  collateralUsdc?: number;
  launchStakeUsdc?: number | null;
};

const NATIVE_VIRTUAL_SHARES = 100;
const DEFAULT_NATIVE_LAUNCH_STAKE_USDC = 20;

export function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function stringArray(value: unknown) {
  return asArray(value).map(String).filter(Boolean);
}

export function numberArray(value: unknown) {
  return asArray(value).map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

export function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedPriceValue(value: unknown) {
  const parsed = numberValue(value);
  if (parsed === null) return null;
  if (parsed > 1 && parsed <= 100) return parsed / 100;
  if (parsed < 0 || parsed > 1) return null;
  return parsed;
}

export function polymarketRouteRaw(market: NexMarket): RouteRaw {
  const route = asRecord(market.routeDecision);
  const candidates = asArray(route.polymarketCandidates);
  const first = asRecord(candidates[0]);
  return asRecord(first.raw) as RouteRaw;
}

export function compactUsd(value: unknown) {
  const amount = numberValue(value);
  if (amount === null) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(amount);
}

export function dateLabel(value?: string | null) {
  if (!value) return "Open";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Open";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function marketCategoryLabel(market: NexMarket) {
  if (market.arena === "football") return "Sports";
  return toTitleLabel(market.arena || "Market");
}

export function marketStateLabel(market: NexMarket) {
  if (market.origin === "polymarket") return "Routed";
  if (market.origin === "native") return "Native";
  return "No route";
}

export function marketStateClass(market: NexMarket) {
  return marketStateLabel(market).toLowerCase().replace(/\s+/g, "_");
}

function nativeResolvedPrice(market: NexMarket) {
  if (market.finalOutcome === "ride") return 1;
  if (market.finalOutcome === "fade") return 0;
  return null;
}

function nativeMarketPrice(market: NexMarket, stats?: NativeMarketDisplayStats) {
  if (market.origin !== "native") return null;
  if (market.status === "settled") return nativeResolvedPrice(market);
  if (market.status === "invalid_refund") return null;
  if (!hasNativePrice(market)) return null;
  return nativeRidePrice(stats ?? market.nativeStats ?? undefined);
}

function tokenOutcomePrice(raw: RouteRaw, index: number): number | null {
  const expectedOutcome = index === 0 ? /^(yes|ride)$/i : /^(no|fade)$/i;
  const tokens = asArray(raw.tokens);
  const indexed = tokens[index];
  const indexedToken = indexed && typeof indexed === "object" && !Array.isArray(indexed) ? asRecord(indexed) : null;
  const token = indexedToken ?? tokens.map(asRecord).find((item) => expectedOutcome.test(String(item.outcome ?? item.name ?? "")));
  if (!token) return null;
  for (const key of ["price", "lastPrice", "lastTradePrice", "midpoint", "bestBid", "bestAsk"]) {
    const price = normalizedPriceValue(token[key]);
    if (price !== null) return price;
  }
  return null;
}

function routedOutcomePrice(raw: RouteRaw, index: number): number | null {
  const prices = numberArray(raw.outcomePrices).map(normalizedPriceValue);
  const price = prices[index] ?? null;
  if (price !== null) return price;
  const keyedPrice = normalizedPriceValue(index === 0 ? raw.yesPrice : raw.noPrice);
  if (keyedPrice !== null) return keyedPrice;
  const tokenPrice = tokenOutcomePrice(raw, index);
  if (tokenPrice !== null) return tokenPrice;
  if (index === 0) {
    const last = normalizedPriceValue(raw.lastTradePrice ?? raw.price);
    if (last !== null) return last;
    const bid = normalizedPriceValue(raw.bestBid);
    const ask = normalizedPriceValue(raw.bestAsk);
    if (bid !== null && ask !== null) return (bid + ask) / 2;
    return bid ?? ask;
  }
  const ridePrice = routedOutcomePrice(raw, 0);
  return ridePrice === null ? null : 1 - ridePrice;
}

export function primaryOutcomePrice(market: NexMarket) {
  const raw = polymarketRouteRaw(market);
  if (market.origin === "native") return nativeMarketPrice(market);
  return routedOutcomePrice(raw, 0);
}

function hasNativePrice(market: NexMarket) {
  return !["draft", "route_check", "ready_to_launch", "cancelled_before_trading", "invalid_refund"].includes(market.status);
}

export function nativeRidePrice(stats?: NativeMarketDisplayStats) {
  const rideShares = Math.max(0, stats?.rideShares ?? 0);
  const fadeShares = Math.max(0, stats?.fadeShares ?? 0);
  const price = (rideShares + NATIVE_VIRTUAL_SHARES) / (rideShares + fadeShares + (2 * NATIVE_VIRTUAL_SHARES));
  return Math.max(0.01, Math.min(0.99, price));
}

function nativeStakeValue(market: NexMarket, stats?: NativeMarketDisplayStats) {
  if (stats?.collateralUsdc && stats.collateralUsdc > 0) return stats.collateralUsdc;
  if (stats?.launchStakeUsdc && stats.launchStakeUsdc > 0) return stats.launchStakeUsdc;
  if (
    market.origin === "native" &&
    (market.launchStakeStatus === "paid" || ["live_pending_open", "trading_live", "closed", "result_proposed", "disputed", "settled"].includes(market.status))
  ) {
    return DEFAULT_NATIVE_LAUNCH_STAKE_USDC;
  }
  return 0;
}

export function priceCents(value: number | null) {
  if (value === null) return "-";
  return `${Math.round(value * 100)}¢`;
}

export function marketPriceLabel(market: NexMarket, value: number | null) {
  if (market.origin === "native") {
    if (market.status === "invalid_refund" || market.finalOutcome === "invalid") return "Refund";
    if (market.status === "settled" && market.finalOutcome === "ride") return "100¢";
    if (market.status === "settled" && market.finalOutcome === "fade") return "0¢";
  }
  return priceCents(value);
}

export function marketUiSummary(market: NexMarket, activityVolume = 0, nativeStats?: NativeMarketDisplayStats) {
  const raw = polymarketRouteRaw(market);
  const routeVolume = numberValue(raw.volume24h) ?? 0;
  const routeLiquidity = numberValue(raw.liquidity) ?? 0;
  const resolvedNativeStats = nativeStats ?? market.nativeStats ?? undefined;
  const volume = activityVolume || (market.origin === "native" ? resolvedNativeStats?.collateralUsdc ?? 0 : routeVolume);
  const price = market.origin === "native" ? nativeMarketPrice(market, resolvedNativeStats) : primaryOutcomePrice(market);
  const liquidity = market.origin === "native" ? nativeStakeValue(market, resolvedNativeStats) : routeLiquidity;
  let source = market.origin === "polymarket" ? "Routed market" : "Source pending";
  if (market.sourceUrl) {
    try {
      source = new URL(market.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      source = "Source linked";
    }
  }
  return {
    category: marketCategoryLabel(market),
    state: marketStateLabel(market),
    stateClass: marketStateClass(market),
    status: marketStatusLabel(market.status),
    origin: marketOriginLabel(market.origin),
    originDetail: marketOriginDetail(market.origin),
    creator: market.creatorIdentity ?? (market.origin === "polymarket" ? "Market route" : "NexMarkets"),
    close: dateLabel(market.closeTime ?? (typeof raw.expiry === "string" ? raw.expiry : null)),
    volumeLabel: compactUsd(volume),
    liquidityLabel: compactUsd(liquidity),
    source,
    template: marketTemplateLabel(market.template),
    price
  };
}
