import { z } from "zod";
import { callBankrJson, bankrAiReady } from "@/lib/services/bankr/bankrAiService";
import { assertBankrRateLimit } from "@/lib/services/bankr/bankrRateLimitService";
import { routeCheckMarket } from "@/lib/services/routeMatcherService";
import type { AuthUser } from "@/lib/types/nexid";
import type { RouteCandidate, RouteDecision, ShapedMarketDraft } from "@/lib/types/nexmarkets";

const aiRouteSchema = z.object({
  status: z.enum(["exact", "related", "weak", "none", "blocked", "ambiguous"]),
  recommendedAction: z.enum(["trade_polymarket", "join_native", "save_draft", "refine", "blocked", "launch_native"]),
  candidateId: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1).default(0),
  reason: z.string().min(1).max(500)
});

function candidateSummary(candidates: RouteCandidate[]) {
  return candidates.map((candidate) => ({
    origin: candidate.origin,
    matchType: candidate.matchType,
    id: candidate.id,
    title: candidate.title,
    question: candidate.question ?? null,
    confidence: candidate.confidence,
    reason: candidate.reason
  }));
}

function candidateById(decision: RouteDecision, id: string | null) {
  if (!id) return null;
  return [...decision.polymarketCandidates, ...decision.nativeCandidates].find((candidate) => candidate.id === id) ?? null;
}

function applyAiReview(base: RouteDecision, ai: z.infer<typeof aiRouteSchema>): RouteDecision {
  const candidate = candidateById(base, ai.candidateId);
  if (!candidate || ai.confidence < 0.8) return { ...base, reason: `${base.reason} Bankr review: ${ai.reason}` };
  if (ai.recommendedAction === "trade_polymarket" && candidate.origin === "polymarket") {
    return {
      ...base,
      status: "exact",
      recommendedAction: "trade_polymarket",
      reason: ai.reason,
      polymarketCandidates: base.polymarketCandidates.map((item) => item.id === candidate.id ? { ...item, matchType: "exact", confidence: Math.max(item.confidence, ai.confidence) } : item)
    };
  }
  if (ai.recommendedAction === "join_native" && candidate.origin === "native") {
    return {
      ...base,
      status: "exact",
      recommendedAction: "join_native",
      reason: ai.reason,
      nativeCandidates: base.nativeCandidates.map((item) => item.id === candidate.id ? { ...item, matchType: "exact", confidence: Math.max(item.confidence, ai.confidence) } : item)
    };
  }
  return { ...base, reason: `${base.reason} Bankr review: ${ai.reason}` };
}

export async function routeCheckNexMindMarket(input: {
  draft: ShapedMarketDraft;
  user?: AuthUser | null;
  agentId?: string | null;
}) {
  const actor = input.user?.walletAddress ?? input.agentId ?? "anonymous";
  assertBankrRateLimit({ feature: "nexmind_route_market", actor });
  const base = await routeCheckMarket(input.draft);
  if (!bankrAiReady() || base.status === "blocked" || base.status === "ambiguous") return base;
  const candidates = [...base.polymarketCandidates, ...base.nativeCandidates];
  if (!candidates.length) return base;

  try {
    const response = await callBankrJson({
      feature: "nexmind_route_market",
      userId: input.user?.id,
      walletAddress: input.user?.walletAddress,
      agentId: input.agentId,
      metadata: { draftTitle: input.draft.title, candidateCount: candidates.length },
      messages: [
        {
          role: "system",
          content: "You review NexMarkets route matches. Return JSON only. Choose trade_existing only for truly equivalent markets with the same condition, timeframe, and settlement meaning."
        },
        {
          role: "user",
          content: JSON.stringify({
            draft: input.draft,
            currentDecision: base,
            polymarketCandidates: candidateSummary(base.polymarketCandidates),
            nativeCandidates: candidateSummary(base.nativeCandidates),
            output: {
              status: "exact | related | weak | none | blocked | ambiguous",
              recommendedAction: "trade_polymarket | join_native | save_draft | refine | blocked | launch_native",
              candidateId: "candidate id or null",
              confidence: "0..1",
              reason: "short reason"
            }
          })
        }
      ]
    });
    return applyAiReview(base, aiRouteSchema.parse(response.json));
  } catch (error) {
    if (process.env.BANKR_STRICT_MODE === "true") throw error;
    console.warn("Bankr route review unavailable; using deterministic route decision.", error);
    return base;
  }
}
