import { withDatabase } from "@/lib/server/db";
import { marketQualityScore, noTradeReason } from "@/lib/services/marketQuality";
import type { Narrative } from "@/lib/types/nexid";

function quality(value: string): Narrative["quality"] {
  return value === "Hot" || value === "Clean" || value === "Mixed" ? value : "Strong";
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function listNarratives() {
  return withDatabase(
    async (db) => {
      const rows = await db.narrative.findMany({ orderBy: { heat: "desc" } });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        tag: row.tag,
        summary: row.summary,
        heat: row.heat,
        move7d: row.move7d,
        quality: quality(row.quality),
        liquidity: row.liquidity,
        spread: row.spread,
        volume: row.volume,
        riders: row.riders,
        faders: row.faders,
        expiry: row.expiry,
        top: row.top,
        ridePrice: row.ridePrice,
        fadePrice: row.fadePrice,
        chart: numberArray(row.chart),
        comments: stringArray(row.comments),
        rules: stringArray(row.rules),
        qualityScore: marketQualityScore(row as unknown as Narrative),
        tradable: row.tradable,
        fallbackReason: row.fallbackReason
      }));
    },
    async () => []
  );
}

export async function getNarrativeById(id: string) {
  const all = await listNarratives();
  return all.find((narrative) => narrative.id === id);
}

export async function upsertNarrative(input: Narrative & { tradable?: boolean; fallbackReason?: string | null; bestMarketId?: string | null }) {
  return withDatabase(
    async (db) => {
      const row = await db.narrative.upsert({
        where: { id: input.id },
        update: {
          name: input.name,
          tag: input.tag,
          summary: input.summary,
          heat: input.heat,
          move7d: input.move7d,
          quality: input.quality,
          liquidity: input.liquidity,
          spread: input.spread,
          volume: input.volume,
          riders: input.riders,
          faders: input.faders,
          expiry: input.expiry,
          top: input.top,
          ridePrice: input.ridePrice,
          fadePrice: input.fadePrice,
          chart: input.chart,
          comments: input.comments,
          rules: input.rules,
          bestMarketId: input.bestMarketId,
          tradable: input.tradable ?? true,
          fallbackReason: input.fallbackReason
        },
        create: {
          id: input.id,
          name: input.name,
          tag: input.tag,
          summary: input.summary,
          heat: input.heat,
          move7d: input.move7d,
          quality: input.quality,
          liquidity: input.liquidity,
          spread: input.spread,
          volume: input.volume,
          riders: input.riders,
          faders: input.faders,
          expiry: input.expiry,
          top: input.top,
          ridePrice: input.ridePrice,
          fadePrice: input.fadePrice,
          chart: input.chart,
          comments: input.comments,
          rules: input.rules,
          bestMarketId: input.bestMarketId,
          tradable: input.tradable ?? true,
          fallbackReason: input.fallbackReason
        }
      });
      await db.adminAuditLog.create({ data: { action: "upsert_narrative", target: row.id, metadata: { name: row.name } } });
      return row;
    },
    async () => {
      throw new Error("Database is required to create launch narratives");
    }
  );
}
