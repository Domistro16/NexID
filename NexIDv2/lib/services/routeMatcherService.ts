import { searchPolymarketMarkets } from "@/lib/services/polymarketClient";
import { withDatabase } from "@/lib/server/db";
import { publicMarketWhereClause } from "@/lib/services/marketVisibility";
import type { RouteCandidate, RouteDecision, ShapedMarketDraft } from "@/lib/types/nexmarkets";

const stopWords = new Set(["a", "an", "and", "are", "by", "for", "in", "is", "of", "on", "or", "the", "to", "will"]);

function normalizeToken(value: string) {
  const token = value.toLowerCase();
  if (token === "iranian") return "iran";
  if (token.endsWith("ian") && token.length > 6) return token.slice(0, -3);
  if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
  return token;
}

function words(value: string) {
  return new Set(value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(normalizeToken)
    .filter((word) => word.length > 1 && !stopWords.has(word)));
}

function similarity(a: string, b: string) {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((word) => {
    if (right.has(word)) overlap += 1;
  });
  return overlap / Math.max(left.size, right.size);
}

function matchType(score: number): "exact" | "related" | "weak" | "none" {
  if (score >= 0.78) return "exact";
  if (score >= 0.42) return "related";
  if (score >= 0.24) return "weak";
  return "none";
}

function decide(polymarketCandidates: RouteCandidate[], nativeCandidates: RouteCandidate[], draft: ShapedMarketDraft): RouteDecision {
  if (draft.riskStatus === "blocked") {
    return {
      status: "blocked",
      recommendedAction: "blocked",
      reason: draft.blockedReason ?? "This thesis is blocked by market safety rules.",
      polymarketCandidates,
      nativeCandidates
    };
  }

  const exactNative = nativeCandidates.find((candidate) => candidate.matchType === "exact");
  if (exactNative) {
    return {
      status: "exact",
      recommendedAction: "join_native",
      reason: "An equivalent NexMarkets native market already exists.",
      polymarketCandidates,
      nativeCandidates
    };
  }

  const exactPolymarket = polymarketCandidates.find((candidate) => candidate.matchType === "exact");
  if (exactPolymarket) {
    return {
      status: "exact",
      recommendedAction: "trade_polymarket",
      reason: "An equivalent live Polymarket route exists.",
      polymarketCandidates,
      nativeCandidates
    };
  }

  const related = [...polymarketCandidates, ...nativeCandidates].find((candidate) => candidate.matchType === "related");
  if (related) {
    return {
      status: "related",
      recommendedAction: draft.riskStatus === "allowed" && process.env.NATIVE_MARKETS_ENABLED === "true" ? "launch_native" : "save_draft",
      reason: draft.riskStatus === "allowed" && process.env.NATIVE_MARKETS_ENABLED === "true"
        ? "A related market exists, but no equivalent route was found. You can launch this as a distinct native market if the rules differ."
        : "A related market exists. Confirm the timeframe, metric, or source differs before launch.",
      polymarketCandidates,
      nativeCandidates
    };
  }

  if (draft.riskStatus === "ambiguous_refine") {
    return {
      status: "ambiguous",
      recommendedAction: "refine",
      reason: `Missing ${draft.missingFields.join(", ")} before a market can launch.`,
      polymarketCandidates,
      nativeCandidates
    };
  }

  return {
    status: "none",
    recommendedAction: process.env.NATIVE_MARKETS_ENABLED === "true" ? "launch_native" : "save_draft",
    reason: process.env.NATIVE_MARKETS_ENABLED === "true"
      ? "No clean existing route was found and native markets are enabled."
      : "No clean existing route was found. Save this as a draft until native markets are enabled.",
    polymarketCandidates,
    nativeCandidates
  };
}

function routeSearchQueries(draft: ShapedMarketDraft) {
  const variants = [
    draft.rawThesis,
    draft.question,
    draft.title,
    draft.rawThesis.replace(/^will\s+/i, ""),
    draft.question.replace(/^will\s+/i, "").replace(/\?$/, ""),
    draft.entities.join(" ")
  ];
  return Array.from(new Set(variants.map((item) => item.trim()).filter((item) => item.length > 3))).slice(0, 6);
}

async function nativeCandidatesFor(draft: ShapedMarketDraft): Promise<RouteCandidate[]> {
  return withDatabase(
    async (db) => {
      const rows = await db.market.findMany({
        where: {
          ...publicMarketWhereClause(),
          OR: [
            { arena: draft.arena },
            { template: draft.template }
          ],
          status: { notIn: ["settled", "invalid_refund", "cancelled_before_trading"] }
        },
        orderBy: { updatedAt: "desc" },
        take: 25
      });
      return rows
        .map((market) => {
          const score = Math.max(similarity(draft.question, market.question), similarity(draft.title, market.title));
          return {
            origin: market.origin,
            matchType: matchType(score),
            id: market.id,
            title: market.title,
            question: market.question,
            confidence: Number(score.toFixed(3)),
            reason: `${Math.round(score * 100)}% text overlap with an existing NexMarkets market`
          } satisfies RouteCandidate;
        })
        .filter((candidate) => candidate.matchType !== "none")
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);
    },
    async () => []
  );
}

async function polymarketCandidatesFor(draft: ShapedMarketDraft): Promise<RouteCandidate[]> {
  try {
    const searchResults = await Promise.all(routeSearchQueries(draft).map((query) => searchPolymarketMarkets(query).catch(() => [])));
    const seen = new Set<string>();
    const markets = searchResults.flat().filter((market) => {
      const key = market.id || market.question;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return markets
      .map((market) => {
        const score = Math.max(
          similarity(draft.rawThesis, market.question),
          similarity(draft.question, market.question),
          similarity(draft.title, market.question)
        );
        return {
          origin: "polymarket" as const,
          matchType: matchType(score),
          id: market.id,
          title: market.question,
          question: market.question,
          confidence: Number(score.toFixed(3)),
          reason: `${Math.round(score * 100)}% text overlap with a live Polymarket market`,
          raw: {
            slug: market.slug,
            outcomes: market.outcomes,
            outcomePrices: market.outcomePrices,
            clobTokenIds: market.clobTokenIds,
            tokens: market.tokens,
            yesPrice: market.yesPrice,
            noPrice: market.noPrice,
            lastTradePrice: market.lastTradePrice,
            price: market.price,
            bestBid: market.bestBid,
            bestAsk: market.bestAsk,
            liquidity: market.liquidity,
            volume24h: market.volume24h,
            expiry: market.expiry?.toISOString() ?? null,
            enableOrderBook: market.enableOrderBook
          }
        } satisfies RouteCandidate;
      })
      .filter((candidate) => candidate.matchType !== "none")
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function routeCheckMarket(draft: ShapedMarketDraft): Promise<RouteDecision> {
  const [polymarketCandidates, nativeCandidates] = await Promise.all([
    polymarketCandidatesFor(draft),
    nativeCandidatesFor(draft)
  ]);
  return decide(polymarketCandidates, nativeCandidates, draft);
}
