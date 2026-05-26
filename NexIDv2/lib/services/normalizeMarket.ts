export type RawPolymarketMarket = {
  id?: string;
  conditionId?: string;
  question?: string;
  slug?: string;
  outcomes?: unknown;
  outcomePrices?: unknown;
  clobTokenIds?: unknown;
  tokens?: Array<{ token_id?: string; outcome?: string }>;
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
  return {
    id: raw.id ?? raw.conditionId ?? "",
    question: raw.question ?? "",
    slug: raw.slug ?? "",
    outcomes,
    outcomePrices,
    clobTokenIds,
    liquidity: Number(raw.liquidity ?? 0),
    volume24h: Number(raw.volume24hr ?? 0),
    spread: Number(raw.spread ?? 0),
    expiry: raw.endDate ? new Date(raw.endDate) : null,
    enableOrderBook: Boolean(raw.enableOrderBook || clobTokenIds.length),
    active: raw.active !== false,
    closed: Boolean(raw.closed)
  };
}
