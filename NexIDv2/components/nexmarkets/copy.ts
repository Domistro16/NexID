import type { MarketRiskStatus, MarketRouteStatus, NexMarketOrigin, NexMarketStatus } from "@/lib/types/nexmarkets";

const statusLabels: Record<NexMarketStatus, string> = {
  draft: "Draft",
  route_check: "Checking fit",
  ready_to_launch: "Ready to launch",
  live_pending_open: "Opening soon",
  trading_live: "Live",
  closed: "Closed",
  result_proposed: "Result pending",
  disputed: "Under review",
  settled: "Settled",
  invalid_refund: "Refunding",
  cancelled_before_trading: "Canceled"
};

const originLabels: Record<NexMarketOrigin, string> = {
  polymarket: "Live market",
  native: "NexMarkets market",
  draft: "Draft idea"
};

const templateLabels: Record<string, string> = {
  token_price_threshold: "Price target",
  token_basket_race: "Basket race",
  official_announcement: "Official announcement",
  sports_result: "Sports result",
  sports_transfer: "Transfer call",
  chart_rank: "Chart race",
  award_outcome: "Award outcome",
  public_release: "Release outcome",
  custom_objective: "Custom market"
};

const riskLabels: Record<MarketRiskStatus, string> = {
  allowed: "Ready",
  ambiguous_refine: "Needs clarity",
  blocked: "Blocked"
};

const routeLabels: Record<MarketRouteStatus, string> = {
  exact: "Matching market found",
  related: "Similar market found",
  weak: "Weak match",
  none: "No close match",
  blocked: "Blocked",
  ambiguous: "Needs clarity"
};

export function toTitleLabel(value: string | null | undefined) {
  if (!value) return "-";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function marketStatusLabel(value: string | null | undefined) {
  return value && value in statusLabels ? statusLabels[value as NexMarketStatus] : toTitleLabel(value);
}

export function marketOriginLabel(value: string | null | undefined) {
  return value && value in originLabels ? originLabels[value as NexMarketOrigin] : "Market";
}

export function marketTemplateLabel(value: string | null | undefined) {
  return value && value in templateLabels ? templateLabels[value] : toTitleLabel(value ?? "market");
}

export function marketRiskLabel(value: MarketRiskStatus) {
  return riskLabels[value] ?? toTitleLabel(value);
}

export function routeStatusLabel(value: MarketRouteStatus) {
  return routeLabels[value] ?? toTitleLabel(value);
}

export function marketOriginDetail(value: string | null | undefined) {
  if (value === "polymarket") return "Partner market";
  if (value === "native") return "NexMarkets";
  return "Draft";
}
