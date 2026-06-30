import { shapedMarketDraftSchema } from "@/lib/server/validation";
import { callBankrJson, bankrAiReady } from "@/lib/services/bankr/bankrAiService";
import { assertBankrRateLimit } from "@/lib/services/bankr/bankrRateLimitService";
import { composeMarketDraft as composeLegacyMarketDraft } from "@/lib/services/geminiMarketComposerService";
import { shapeMarket } from "@/lib/services/marketComposerService";
import { qualifyMarketDraftForLaunch } from "@/lib/services/sourceQualificationService";
import type { AuthUser } from "@/lib/types/nexid";
import type { MarketArena, ShapedMarketDraft } from "@/lib/types/nexmarkets";

function providerMode() {
  return process.env.MARKET_COMPOSER_PROVIDER?.trim().toLowerCase();
}

function normalizeSourceUrl(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function missingFieldIsSatisfied(field: string, input: {
  timeframe: ShapedMarketDraft["timeframe"];
  settlementSource: string | null;
  sourceUrl: string | null;
}) {
  const normalized = field.toLowerCase().replace(/[_-]+/g, " ");
  if ((normalized.includes("deadline") || normalized.includes("timeframe") || normalized.includes("close")) && input.timeframe) return true;
  if (normalized.includes("source url") || normalized.includes("source link")) return true;
  if ((normalized.includes("settlement source") || normalized === "source") && input.settlementSource) return true;
  return false;
}

function normalizeDraft(input: { rawThesis: string; baseline: ShapedMarketDraft; draft: ShapedMarketDraft }) {
  const sourceUrl = normalizeSourceUrl(input.draft.resolution.sourceUrl) ?? normalizeSourceUrl(input.baseline.resolution.sourceUrl);
  const settlementSource = input.draft.settlementSource || input.draft.resolution.sourceName || input.baseline.settlementSource;
  const missingContext = { timeframe: input.draft.timeframe, settlementSource, sourceUrl };
  const missingFields = Array.from(new Set([
    ...input.draft.missingFields.filter((field) => !missingFieldIsSatisfied(field, missingContext)),
    ...input.baseline.missingFields.filter((field) => !missingFieldIsSatisfied(field, missingContext)),
    !input.draft.timeframe ? "timeframe" : "",
    !settlementSource ? "settlement source" : ""
  ].filter(Boolean)));
  const blockedReason = input.baseline.blockedReason || input.draft.blockedReason;
  const riskStatus = blockedReason ? "blocked" : missingFields.length ? "ambiguous_refine" : input.draft.riskStatus;

  return shapedMarketDraftSchema.parse({
    ...input.draft,
    rawThesis: input.rawThesis.trim().replace(/\s+/g, " "),
    title: input.draft.title.slice(0, 80),
    settlementSource,
    resolution: {
      ...input.draft.resolution,
      sourceUrl
    },
    launch: {
      stakeUsdc: 20,
      nonRefundableFeeUsdc: 10,
      refundableQualityBondUsdc: 10
    },
    riskStatus,
    risk: {
      status: riskStatus,
      reasons: Array.from(new Set([
        ...input.draft.risk.reasons,
        ...input.baseline.risk.reasons,
        ...(blockedReason ? [blockedReason] : []),
        ...(missingFields.length ? [`Needs ${missingFields.join(", ")}`] : [])
      ])).slice(0, 8),
      requiredUserEdits: missingFields
    },
    missingFields,
    blockedReason,
    duplicateCheck: input.draft.duplicateCheck ?? { status: "pending", matches: [] }
  });
}

function draftPrompt(input: { rawThesis: string; arenaHint?: MarketArena; baseline: ShapedMarketDraft }) {
  return [
    "Shape this NexMarkets thesis into one objective Ride/Fade market draft.",
    "Return JSON only. Match this product contract exactly:",
    "{ rawThesis, title, question, arena, template, entities, timeframe, settlementSource, resolution, sides, launch, risk, riskStatus, missingFields, blockedReason, duplicateCheck }",
    "Allowed arena values: crypto, football, culture.",
    "Allowed template values: token_price_threshold, token_basket_race, official_announcement, sports_result, sports_transfer, chart_rank, award_outcome, public_release, custom_objective.",
    "Rules:",
    "- Use objective settlement only. Do not predict outcomes.",
    "- Native launch requires a fixed close time, objective settlement source text, fallback source/rule, settlement method, and Ride/Fade sides.",
    "- For crypto price threshold or token race markets, CoinGecko public USD price data is the preferred primary automated source.",
    "- Use CoinGecko coin page URLs in the form https://www.coingecko.com/en/coins/<coin-id> when the asset can be identified. Do not use Binance as the primary automated source because serverless regions may receive HTTP 451.",
    "- Never invent a source URL. If no exact public source URL exists, set sourceUrl to null and keep the draft evidence-based instead of requiring a user edit.",
    "- Unsafe/private/death/harassment/crime-accusation markets must be blocked.",
    "- launch must be { stakeUsdc: 20, nonRefundableFeeUsdc: 10, refundableQualityBondUsdc: 10 }.",
    `Raw thesis: ${input.rawThesis}`,
    `Arena hint: ${input.arenaHint ?? "none"}`,
    `Deterministic baseline: ${JSON.stringify(input.baseline)}`
  ].join("\n");
}

async function composeWithBankr(input: {
  rawThesis: string;
  arenaHint?: MarketArena;
  user?: AuthUser | null;
  agentId?: string | null;
}) {
  const baseline = shapeMarket(input);
  const response = await callBankrJson({
    feature: "nexmind_draft_market",
    userId: input.user?.id,
    walletAddress: input.user?.walletAddress,
    agentId: input.agentId,
    metadata: {
      arenaHint: input.arenaHint ?? null,
      rawThesis: input.rawThesis
    },
    messages: [
      {
        role: "system",
        content: "You are NexMind, NexMarkets' market-drafting engine. You only produce schema-valid JSON market drafts."
      },
      {
        role: "user",
        content: draftPrompt({ rawThesis: input.rawThesis, arenaHint: input.arenaHint, baseline })
      }
    ]
  });
  const parsed = shapedMarketDraftSchema.parse({
    ...(response.json as Record<string, unknown>),
    duplicateCheck: (response.json as Record<string, unknown>).duplicateCheck ?? { status: "pending", matches: [] }
  });
  return normalizeDraft({ rawThesis: input.rawThesis, baseline, draft: parsed });
}

async function qualifyDraft(draft: ShapedMarketDraft) {
  return qualifyMarketDraftForLaunch({ draft });
}

export async function composeNexMindMarketDraft(input: {
  rawThesis: string;
  arenaHint?: MarketArena;
  user?: AuthUser | null;
  agentId?: string | null;
}) {
  const actor = input.user?.walletAddress ?? input.agentId ?? "anonymous";
  assertBankrRateLimit({ feature: "nexmind_draft_market", actor });

  const shouldUseBankr = bankrAiReady() && providerMode() !== "gemini_direct";
  if (!shouldUseBankr) {
    return qualifyDraft(await composeLegacyMarketDraft({ rawThesis: input.rawThesis, arenaHint: input.arenaHint }));
  }

  try {
    return qualifyDraft(await composeWithBankr(input));
  } catch (error) {
    if (process.env.BANKR_STRICT_MODE === "true") throw error;
    console.warn("Bankr market composer unavailable; using legacy composer fallback.", error);
    return qualifyDraft(await composeLegacyMarketDraft({ rawThesis: input.rawThesis, arenaHint: input.arenaHint }));
  }
}
