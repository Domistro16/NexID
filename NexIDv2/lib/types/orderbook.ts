export type MarketOrderbookOutcome = "ride" | "fade";
export type MarketOrderbookSource = "nexmarkets_orderbook" | "polymarket_clob" | "empty";

export type MarketOrderbookLevel = {
  price: number;
  priceCents: number;
  sizeUsdc: number;
  shareEstimate: number;
  cumulativeUsdc: number;
  depthPct: number;
  orderCount: number;
};

export type MarketOrderbookSide = {
  outcome: MarketOrderbookOutcome;
  label: string;
  bids: MarketOrderbookLevel[];
  asks: MarketOrderbookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  midpoint: number | null;
};

export type PublicMarketOrderbook = {
  marketId: string;
  marketTitle: string;
  marketOrigin: string;
  source: MarketOrderbookSource;
  status: string;
  updatedAt: string;
  generated: boolean;
  ride: MarketOrderbookSide;
  fade: MarketOrderbookSide;
  stats: {
    liquidityUsdc: number;
    visibleDepthUsdc: number;
    openInterestUsdc: number;
    imbalancePct: number;
    levelCount: number;
  };
  errors?: string[];
};
