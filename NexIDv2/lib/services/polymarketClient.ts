import { normalizeMarket, type RawPolymarketMarket } from "@/lib/services/normalizeMarket";

const gammaBaseUrl = process.env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com";
const clobBaseUrl = process.env.POLYMARKET_CLOB_URL ?? "https://clob.polymarket.com";

type RawPolymarketSearchResponse = {
  events?: Array<{
    id?: string;
    title?: string;
    active?: boolean;
    closed?: boolean;
    markets?: RawPolymarketMarket[];
  }>;
  markets?: RawPolymarketMarket[];
};

function marketKey(market: RawPolymarketMarket) {
  return market.id ?? market.conditionId ?? market.question ?? "";
}

function hasClobTokens(market: RawPolymarketMarket) {
  if (Array.isArray(market.clobTokenIds)) return market.clobTokenIds.length > 0;
  if (typeof market.clobTokenIds === "string") return market.clobTokenIds.length > 4 && market.clobTokenIds !== "[]";
  return Boolean(market.tokens?.length);
}

function usableMarket(market: RawPolymarketMarket) {
  return market.active !== false && market.closed !== true && (market.enableOrderBook === true || hasClobTokens(market));
}

function dedupeMarkets(markets: RawPolymarketMarket[]) {
  const seen = new Set<string>();
  return markets.filter((market) => {
    if (!usableMarket(market)) return false;
    const key = marketKey(market);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchPublicMarkets(query: string) {
  const url = new URL("/public-search", gammaBaseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("events_status", "active");
  url.searchParams.set("limit_per_type", "10");
  const response = await fetch(url, { next: { revalidate: 60 } });
  if (!response.ok) throw new Error(`Polymarket public search failed: ${response.status}`);
  const data = (await response.json()) as RawPolymarketSearchResponse;
  return dedupeMarkets([
    ...(data.markets ?? []),
    ...((data.events ?? []).flatMap((event) => event.active !== false && event.closed !== true ? event.markets ?? [] : []))
  ]);
}

async function searchGammaMarkets(query: string) {
  const url = new URL("/markets", gammaBaseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  const response = await fetch(url, { next: { revalidate: 60 } });
  if (!response.ok) throw new Error(`Polymarket Gamma request failed: ${response.status}`);
  const data = (await response.json()) as RawPolymarketMarket[];
  return dedupeMarkets(data);
}

export async function searchPolymarketMarkets(query: string) {
  const [publicMarkets, gammaMarkets] = await Promise.allSettled([
    searchPublicMarkets(query),
    searchGammaMarkets(query)
  ]);
  const markets = dedupeMarkets([
    ...(publicMarkets.status === "fulfilled" ? publicMarkets.value : []),
    ...(gammaMarkets.status === "fulfilled" ? gammaMarkets.value : [])
  ]);
  if (!markets.length && publicMarkets.status === "rejected" && gammaMarkets.status === "rejected") {
    throw publicMarkets.reason instanceof Error ? publicMarkets.reason : new Error("Polymarket search failed.");
  }
  return markets.map(normalizeMarket);
}

export async function getOrderBook(tokenId: string) {
  const url = new URL("/book", clobBaseUrl);
  url.searchParams.set("token_id", tokenId);
  const response = await fetch(url, { next: { revalidate: 15 } });
  if (!response.ok) throw new Error(`Polymarket CLOB request failed: ${response.status}`);
  return response.json();
}
