import { withDatabase } from "@/lib/server/db";
import { mappedMarketQuality, noTradeMarketReason } from "@/lib/services/marketQuality";
import { scoreMarketForNarrative } from "@/lib/services/narrativeMatcher";
import { searchPolymarketMarkets } from "@/lib/services/polymarketClient";
import type { Narrative } from "@/lib/types/nexid";

function sideMapFor(market: { outcomes: string[]; clobTokenIds?: string[] }) {
  const yesIndex = market.outcomes.findIndex((outcome) => outcome.toLowerCase() === "yes");
  const noIndex = market.outcomes.findIndex((outcome) => outcome.toLowerCase() === "no");
  return {
    ride: market.outcomes[yesIndex >= 0 ? yesIndex : 0] ?? "Yes",
    fade: market.outcomes[noIndex >= 0 ? noIndex : 1] ?? "No",
    rideToken: market.clobTokenIds?.[yesIndex >= 0 ? yesIndex : 0] ?? null,
    fadeToken: market.clobTokenIds?.[noIndex >= 0 ? noIndex : 1] ?? null
  };
}

export async function refreshMappedMarketsForNarrative(narrative: Narrative) {
  const markets = await searchPolymarketMarkets(narrative.name);
  const scored = markets
    .map((market) => ({
      market,
      matchScore: scoreMarketForNarrative(narrative, market),
      qualityScore: mappedMarketQuality(market),
      noTradeReason: noTradeMarketReason(market)
    }))
    .filter((item) => item.matchScore > 0)
    .sort((a, b) => b.qualityScore + b.matchScore * 5 - (a.qualityScore + a.matchScore * 5));

  const best = scored.find((item) => !item.noTradeReason) ?? scored[0];
  await withDatabase(
    async (db) => {
      for (const item of scored.slice(0, 10)) {
        await db.mappedMarket.upsert({
          where: { id: item.market.id },
          update: {
            narrativeId: narrative.id,
            question: item.market.question,
            slug: item.market.slug,
            outcomes: item.market.outcomes,
            outcomePrices: item.market.outcomePrices,
            liquidity: item.market.liquidity,
            volume24h: item.market.volume24h,
            spread: item.market.spread,
            expiry: item.market.expiry,
            enableOrderBook: item.market.enableOrderBook,
            qualityScore: item.qualityScore,
            sideMap: sideMapFor(item.market)
          },
          create: {
            id: item.market.id,
            narrativeId: narrative.id,
            question: item.market.question,
            slug: item.market.slug,
            outcomes: item.market.outcomes,
            outcomePrices: item.market.outcomePrices,
            liquidity: item.market.liquidity,
            volume24h: item.market.volume24h,
            spread: item.market.spread,
            expiry: item.market.expiry,
            enableOrderBook: item.market.enableOrderBook,
            qualityScore: item.qualityScore,
            sideMap: sideMapFor(item.market)
          }
        });
      }
      await db.narrative.update({
        where: { id: narrative.id },
        data: {
          bestMarketId: best?.noTradeReason ? null : best?.market.id ?? null,
          tradable: Boolean(best && !best.noTradeReason),
          fallbackReason: best?.noTradeReason ?? (best ? null : "No matching market found")
        }
      });
      await db.adminAuditLog.create({
        data: {
          action: "refresh_market_mapping",
          target: narrative.id,
          metadata: { matched: scored.length, bestMarketId: best?.market.id ?? null, fallbackReason: best?.noTradeReason ?? null }
        }
      });
      return true;
    },
    async () => true
  );

  return {
    narrativeId: narrative.id,
    matched: scored.length,
    bestMarketId: best?.noTradeReason ? null : best?.market.id ?? null,
    fallbackReason: best?.noTradeReason ?? (best ? null : "No matching market found")
  };
}
