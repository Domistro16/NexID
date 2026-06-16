export type RawPolymarketMarket = {
  id?: string;
  conditionId?: string;
  question?: string;
  slug?: string;
  outcomes?: unknown;
  outcomePrices?: unknown;
  clobTokenIds?: unknown;
  tokens?: Array<{
    token_id?: string;
    outcome?: string;
    price?: string | number;
    lastPrice?: string | number;
    lastTradePrice?: string | number;
    midpoint?: string | number;
    bestBid?: string | number;
    bestAsk?: string | number;
  }>;
  yesPrice?: string | number;
  noPrice?: string | number;
  lastTradePrice?: string | number;
  price?: string | number;
  bestBid?: string | number;
  bestAsk?: string | number;
  liquidity?: string | number;
  volume24hr?: string | number;
  spread?: string | number;
  endDate?: string;
  enableOrderBook?: boolean;
  active?: boolean;
  closed?: boolean;
};

function parseArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeMarket(raw: RawPolymarketMarket) {
  const outcomes = parseArray(raw.outcomes).map(String);
  const outcomePrices = parseArray(raw.outcomePrices).map((item) => Number(item));
  const clobTokenIds = parseArray(raw.clobTokenIds).map(String);
  const tokens = Array.isArray(raw.tokens) ? raw.tokens : [];
  return {
    id: raw.id ?? raw.conditionId ?? "",
    question: raw.question ?? "",
    slug: raw.slug ?? "",
    outcomes,
    outcomePrices,
    clobTokenIds,
    tokens,
    yesPrice: raw.yesPrice,
    noPrice: raw.noPrice,
    lastTradePrice: raw.lastTradePrice,
    price: raw.price,
    bestBid: raw.bestBid,
    bestAsk: raw.bestAsk,
    liquidity: Number(raw.liquidity ?? 0),
    volume24h: Number(raw.volume24hr ?? 0),
    spread: Number(raw.spread ?? 0),
    expiry: raw.endDate ? new Date(raw.endDate) : null,
    enableOrderBook: Boolean(raw.enableOrderBook || clobTokenIds.length),
    active: raw.active !== false,
    closed: Boolean(raw.closed)
  };
}
