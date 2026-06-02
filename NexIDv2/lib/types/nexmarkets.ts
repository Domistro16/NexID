export type NexMarketOrigin = "polymarket" | "native" | "draft";
export type NexMarketStatus =
  | "draft"
  | "route_check"
  | "ready_to_launch"
  | "live_pending_open"
  | "trading_live"
  | "closed"
  | "result_proposed"
  | "disputed"
  | "settled"
  | "invalid_refund"
  | "cancelled_before_trading";

export type MarketRiskStatus = "allowed" | "ambiguous_refine" | "blocked";
export type MarketRouteStatus = "exact" | "related" | "weak" | "none" | "blocked" | "ambiguous";
export type MarketArena = "crypto" | "football" | "culture";
export type MarketTemplateId =
  | "token_price_threshold"
  | "token_basket_race"
  | "official_announcement"
  | "sports_result"
  | "sports_transfer"
  | "chart_rank"
  | "award_outcome"
  | "public_release"
  | "custom_objective";

export type MarketTimeframe = {
  startAt: string;
  closeAt: string;
  timezone: string;
  label: string;
};

export type ShapedMarketDraft = {
  rawThesis: string;
  title: string;
  question: string;
  arena: MarketArena;
  template: MarketTemplateId;
  entities: string[];
  timeframe: MarketTimeframe | null;
  settlementSource: string | null;
  resolution: {
    sourceType: "oracle" | "api" | "official_announcement" | "official_score" | "official_chart" | "manual_optimistic";
    sourceName: string;
    sourceUrl: string | null;
    method: string;
    fallback: string;
  };
  sides: {
    ride: string;
    fade: string;
  };
  launch: {
    stakeUsdc: 20;
    nonRefundableFeeUsdc: 10;
    refundableQualityBondUsdc: 10;
  };
  risk: {
    status: MarketRiskStatus;
    reasons: string[];
    requiredUserEdits: string[];
  };
  riskStatus: MarketRiskStatus;
  missingFields: string[];
  blockedReason: string | null;
  duplicateCheck?: {
    status: "pending" | "no_match" | "exact_polymarket" | "exact_native" | "related_polymarket" | "related_native";
    matches: Array<{
      source: "polymarket" | "nex_native";
      id: string;
      title: string;
      similarity: number;
      action: "trade_existing" | "join_existing" | "launch_variant" | "block_duplicate";
    }>;
  };
};

export type RouteCandidate = {
  origin: NexMarketOrigin;
  matchType: Exclude<MarketRouteStatus, "blocked" | "ambiguous">;
  id: string;
  title: string;
  question?: string;
  confidence: number;
  reason: string;
  raw?: Record<string, unknown>;
};

export type RouteDecision = {
  status: MarketRouteStatus;
  recommendedAction: "trade_polymarket" | "join_native" | "save_draft" | "refine" | "blocked" | "launch_native";
  reason: string;
  polymarketCandidates: RouteCandidate[];
  nativeCandidates: RouteCandidate[];
};

export type NexMarket = {
  id: string;
  origin: NexMarketOrigin;
  status: NexMarketStatus;
  title: string;
  question: string;
  arena: string;
  template?: string | null;
  sourceUrl?: string | null;
  closeTime?: string | null;
  polymarketMarketId?: string | null;
  polymarketConditionId?: string | null;
  polymarketClobTokenIds?: unknown;
  creatorIdentity?: string | null;
  creatorWallet?: string | null;
  chainId?: number | null;
  contractAddress?: string | null;
  resolutionManagerAddress?: string | null;
  rulesHash?: string | null;
  metadataHash?: string | null;
  launchStakeStatus?: string | null;
  resolutionState?: string | null;
  resolutionStatus?: string | null;
  proposedOutcome?: "ride" | "fade" | "invalid" | null;
  finalOutcome?: "ride" | "fade" | "invalid" | null;
  routeDecision?: unknown;
  createdAt: string;
  updatedAt: string;
};
