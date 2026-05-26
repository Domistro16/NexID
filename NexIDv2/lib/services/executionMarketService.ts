import { withDatabase } from "@/lib/server/db";
import { getNarrativeById } from "@/lib/services/narrativeService";
import type { Side } from "@/lib/types/nexid";

type SideMap = {
  ride?: string;
  fade?: string;
  rideToken?: string | null;
  fadeToken?: string | null;
};

type ExecutionMarket = {
  marketId: string | null;
  tokenId: string | null;
  outcome: string;
  qualityScore: number;
  enableOrderBook: boolean;
};

function parseSideMap(value: unknown): SideMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SideMap : {};
}

export async function getExecutionMarket(narrativeId: string, side: Side) {
  return withDatabase<ExecutionMarket | null>(
    async (db) => {
      const narrative = await db.narrative.findUnique({
        where: { id: narrativeId },
        include: { markets: true }
      });
      if (!narrative) return null;
      const market = narrative.bestMarketId
        ? narrative.markets.find((item) => item.id === narrative.bestMarketId)
        : narrative.markets.sort((a, b) => b.qualityScore - a.qualityScore)[0];
      if (!market) return null;
      const sideMap = parseSideMap(market.sideMap);
      return {
        marketId: market.id,
        tokenId: side === "ride" ? sideMap.rideToken ?? null : sideMap.fadeToken ?? null,
        outcome: side === "ride" ? sideMap.ride ?? "Yes" : sideMap.fade ?? "No",
        qualityScore: market.qualityScore,
        enableOrderBook: market.enableOrderBook
      };
    },
    async () => {
      const narrative = await getNarrativeById(narrativeId);
      if (!narrative) return null;
      const apiNarrative = narrative as { bestMarketId?: string | null; qualityScore?: number };
      return {
        marketId: apiNarrative.bestMarketId ?? null,
        tokenId: null,
        outcome: side === "ride" ? "Yes" : "No",
        qualityScore: apiNarrative.qualityScore ?? 0,
        enableOrderBook: false
      };
    }
  );
}
