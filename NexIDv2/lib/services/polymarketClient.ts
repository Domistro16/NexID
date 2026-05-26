import { normalizeMarket, type RawPolymarketMarket } from "@/lib/services/normalizeMarket";

const gammaBaseUrl = process.env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com";
const clobBaseUrl = process.env.POLYMARKET_CLOB_URL ?? "https://clob.polymarket.com";

export async function searchPolymarketMarkets(query: string) {
  const url = new URL("/markets", gammaBaseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  const response = await fetch(url, { next: { revalidate: 60 } });
  if (!response.ok) throw new Error(`Polymarket Gamma request failed: ${response.status}`);
  const data = (await response.json()) as RawPolymarketMarket[];
  return data.map(normalizeMarket);
}

export async function getOrderBook(tokenId: string) {
  const url = new URL("/book", clobBaseUrl);
  url.searchParams.set("token_id", tokenId);
  const response = await fetch(url, { next: { revalidate: 15 } });
  if (!response.ok) throw new Error(`Polymarket CLOB request failed: ${response.status}`);
  return response.json();
}
