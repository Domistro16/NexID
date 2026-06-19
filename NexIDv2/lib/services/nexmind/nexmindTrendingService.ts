import { z } from "zod";
import { withDatabase } from "@/lib/server/db";
import { bankrFeatureEnabled, bankrTrendingSeedTopics } from "@/lib/services/bankr/bankrConfig";
import { callBankrJson, bankrAiReady } from "@/lib/services/bankr/bankrAiService";
import { searchPolymarketMarkets } from "@/lib/services/polymarketClient";
import { shapeMarket } from "@/lib/services/marketComposerService";
import { routeCheckMarket } from "@/lib/services/routeMatcherService";
import type { MarketArena, ShapedMarketDraft } from "@/lib/types/nexmarkets";

const trendingOutputSchema = z.object({
  theses: z.array(z.object({
    title: z.string().min(4).max(100),
    thesis: z.string().min(4).max(280),
    arena: z.enum(["crypto", "football", "culture"]),
    sourceUrl: z.string().url().nullable().default(null),
    fallbackSourceUrl: z.string().url().nullable().default(null),
    score: z.number().min(0).max(1),
    measurabilityScore: z.number().min(0).max(1),
    sourceConfidenceScore: z.number().min(0).max(1),
    reason: z.string().max(500).nullable().default(null)
  })).max(12)
});

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function arenaFromText(value: string): MarketArena {
  const lower = value.toLowerCase();
  if (/\b(football|uefa|champions league|premier league|arsenal|sports?)\b/.test(lower)) return "football";
  if (/\b(award|chart|album|movie|box office|grammy|oscar|culture)\b/.test(lower)) return "culture";
  return "crypto";
}

async function collectTrendingSignals() {
  const seeds = bankrTrendingSeedTopics().slice(0, 8);
  const polymarketResults = await Promise.allSettled(seeds.map((seed) => searchPolymarketMarkets(seed)));
  const polymarketSignals = shuffleArray(
    polymarketResults.flatMap((result) => (
      result.status === "fulfilled"
        ? result.value.slice(0, 5).map((market) => ({
          title: market.question,
          sourceUrl: market.slug ? `https://polymarket.com/event/${market.slug}` : null,
          volume24h: market.volume24h,
          liquidity: market.liquidity,
          expiry: market.expiry?.toISOString() ?? null
        }))
        : []
    ))
  );
  const nativeSignals = await withDatabase(
    async (db) => {
      const markets = await db.market.findMany({
        where: { status: { in: ["trading_live", "live_pending_open", "ready_to_launch"] } },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: {
          title: true,
          question: true,
          arena: true,
          sourceUrl: true,
          closeTime: true,
          routeDecision: true
        }
      });
      return markets.map((market) => ({
        title: market.question || market.title,
        arena: market.arena,
        sourceUrl: market.sourceUrl,
        closeTime: market.closeTime?.toISOString() ?? null,
        routeDecision: market.routeDecision
      }));
    },
    async () => []
  );
  return {
    generatedAt: new Date().toISOString(),
    seedTopics: seeds,
    polymarketSignals: polymarketSignals.slice(0, 25),
    nativeSignals
  };
}

function fallbackTheses(signals: Awaited<ReturnType<typeof collectTrendingSignals>>) {
  return signals.polymarketSignals.slice(0, 8).map((signal) => {
    const thesis = signal.title.endsWith("?") ? signal.title : `Will ${signal.title}?`;
    return {
      title: signal.title.slice(0, 100),
      thesis,
      arena: arenaFromText(signal.title),
      sourceUrl: signal.sourceUrl,
      fallbackSourceUrl: null,
      score: 0.55,
      measurabilityScore: 0.65,
      sourceConfidenceScore: signal.sourceUrl ? 0.7 : 0.35,
      reason: "Generated from active market demand while Bankr AI was unavailable."
    };
  });
}

async function enrichThesis(input: {
  title: string;
  thesis: string;
  arena: MarketArena;
  sourceUrl: string | null;
  fallbackSourceUrl: string | null;
  score: number;
  measurabilityScore: number;
  sourceConfidenceScore: number;
  reason: string | null;
}) {
  const shaped = shapeMarket({ rawThesis: input.thesis, arenaHint: input.arena });
  const shapedWithSource: ShapedMarketDraft = {
    ...shaped,
    resolution: {
      ...shaped.resolution,
      sourceUrl: shaped.resolution.sourceUrl ?? input.sourceUrl
    }
  };
  const routeDecision = await routeCheckMarket(shapedWithSource).catch(() => null);
  return {
    ...input,
    shaped: shapedWithSource,
    routeDecision
  };
}

async function persistTrendingTheses(theses: Array<Awaited<ReturnType<typeof enrichThesis>>>, generatedBy: string) {
  return withDatabase(
    async (db) => {
      const created = [];
      for (const thesis of theses) {
        created.push(await db.trendingThesis.create({
          data: {
            title: thesis.title,
            thesis: thesis.thesis,
            arena: thesis.arena,
            sourceUrl: thesis.sourceUrl ?? undefined,
            fallbackSourceUrl: thesis.fallbackSourceUrl ?? undefined,
            score: thesis.score,
            measurabilityScore: thesis.measurabilityScore,
            sourceConfidenceScore: thesis.sourceConfidenceScore,
            shaped: jsonInput(thesis.shaped),
            routeDecision: thesis.routeDecision ? jsonInput(thesis.routeDecision) : undefined,
            generatedBy,
            metadata: jsonInput({ reason: thesis.reason })
          }
        }));
      }
      return created.map((row) => ({
        id: row.id,
        title: row.title,
        thesis: row.thesis,
        arena: row.arena,
        score: row.score,
        measurabilityScore: row.measurabilityScore,
        sourceConfidenceScore: row.sourceConfidenceScore,
        sourceUrl: row.sourceUrl,
        createdAt: row.createdAt.toISOString()
      }));
    },
    async () => theses.map((thesis, index) => ({
      id: `trend_${Date.now()}_${index}`,
      title: thesis.title,
      thesis: thesis.thesis,
      arena: thesis.arena,
      score: thesis.score,
      measurabilityScore: thesis.measurabilityScore,
      sourceConfidenceScore: thesis.sourceConfidenceScore,
      sourceUrl: thesis.sourceUrl,
      createdAt: new Date().toISOString()
    }))
  );
}

export async function runTrendingThesisJob(input: { limit?: number; force?: boolean } = {}) {
  if (!bankrFeatureEnabled("trending") && !input.force) {
    return { ok: true, skipped: true, reason: "Bankr trending thesis generation is disabled.", theses: [] };
  }
  const signals = await collectTrendingSignals();
  let rawTheses: z.infer<typeof trendingOutputSchema>["theses"];
  let generatedBy = "fallback";

  if (bankrAiReady()) {
    try {
      const response = await callBankrJson({
        feature: "nexmind_trending_thesis",
        metadata: { seedTopics: signals.seedTopics },
        messages: [
          {
            role: "system",
            content: "You generate measurable NexMarkets thesis ideas from live signals. Return JSON only."
          },
          {
            role: "user",
            content: JSON.stringify({
              instruction: "Create high-quality market thesis ideas. Each must be objectively measurable and include a source URL when possible.",
              signals,
              output: {
                theses: [{
                  title: "short display title",
                  thesis: "full market thesis/question",
                  arena: "crypto | football | culture",
                  sourceUrl: "primary source URL or null",
                  fallbackSourceUrl: "fallback source URL or null",
                  score: "0..1 trend strength",
                  measurabilityScore: "0..1",
                  sourceConfidenceScore: "0..1",
                  reason: "why this belongs in the feed"
                }]
              }
            })
          }
        ]
      });
      rawTheses = trendingOutputSchema.parse(response.json).theses;
      generatedBy = "bankr";
    } catch (error) {
      if (process.env.BANKR_STRICT_MODE === "true") throw error;
      console.warn("Bankr trending generation unavailable; using fallback signals.", error);
      rawTheses = fallbackTheses(signals);
    }
  } else {
    rawTheses = fallbackTheses(signals);
  }

  const enriched = [];
  for (const thesis of rawTheses.slice(0, input.limit ?? 8)) {
    enriched.push(await enrichThesis(thesis));
  }
  const theses = await persistTrendingTheses(enriched, generatedBy);
  return { ok: true, skipped: false, generatedBy, theses };
}

export async function listTrendingTheses(limit = 12) {
  return withDatabase(
    async (db) => {
      const rows = await db.trendingThesis.findMany({
        where: { status: "active" },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: Math.max(limit * 3, 36)
      });
      const shuffled = shuffleArray(rows);
      return shuffled.slice(0, limit).map((row) => ({
        id: row.id,
        title: row.title,
        thesis: row.thesis,
        arena: row.arena,
        sourceUrl: row.sourceUrl,
        fallbackSourceUrl: row.fallbackSourceUrl,
        score: row.score,
        measurabilityScore: row.measurabilityScore,
        sourceConfidenceScore: row.sourceConfidenceScore,
        shaped: row.shaped,
        routeDecision: row.routeDecision,
        createdAt: row.createdAt.toISOString()
      }));
    },
    async () => []
  );
}
