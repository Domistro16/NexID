import { shapedMarketDraftSchema } from "@/lib/server/validation";
import { shapeMarket } from "@/lib/services/marketComposerService";
import type { MarketArena, ShapedMarketDraft } from "@/lib/types/nexmarkets";

type GeminiTextPart = { text?: string };
type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiTextPart[];
    };
  }>;
  error?: {
    message?: string;
    status?: string;
  };
};

class GeminiComposerError extends Error {
  statusCode?: number;
  providerStatus?: string;

  constructor(message: string, input?: { statusCode?: number; providerStatus?: string }) {
    super(message);
    this.name = "GeminiComposerError";
    this.statusCode = input?.statusCode;
    this.providerStatus = input?.providerStatus;
  }
}

const geminiDraftSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "rawThesis",
    "title",
    "question",
    "arena",
    "template",
    "entities",
    "timeframe",
    "settlementSource",
    "resolution",
    "sides",
    "launch",
    "risk",
    "riskStatus",
    "missingFields",
    "blockedReason",
    "duplicateCheck"
  ],
  properties: {
    rawThesis: { type: "string", description: "The exact cleaned thesis supplied by the user." },
    title: { type: "string", maxLength: 80, description: "Short market title." },
    question: { type: "string", maxLength: 220, description: "Precise Ride/Fade settlement question." },
    arena: { type: "string", enum: ["crypto", "football", "culture"] },
    template: {
      type: "string",
      enum: [
        "token_price_threshold",
        "token_basket_race",
        "official_announcement",
        "sports_result",
        "sports_transfer",
        "chart_rank",
        "award_outcome",
        "public_release",
        "custom_objective"
      ]
    },
    entities: {
      type: "array",
      items: { type: "string" },
      maxItems: 8,
      description: "Named tokens, teams, people, products, chart bodies, or other settlement entities."
    },
    timeframe: {
      type: ["object", "null"],
      required: ["startAt", "closeAt", "timezone", "label"],
      additionalProperties: false,
      properties: {
        startAt: { type: "string", format: "date-time" },
        closeAt: { type: "string", format: "date-time" },
        timezone: { type: "string" },
        label: { type: "string" }
      }
    },
    settlementSource: { type: ["string", "null"], description: "Named objective source used to settle the market." },
    resolution: {
      type: "object",
      required: ["sourceType", "sourceName", "sourceUrl", "method", "fallback"],
      additionalProperties: false,
      properties: {
        sourceType: {
          type: "string",
          enum: ["oracle", "api", "official_announcement", "official_score", "official_chart", "manual_optimistic"]
        },
        sourceName: { type: "string" },
        sourceUrl: { type: ["string", "null"], maxLength: 500 },
        method: { type: "string" },
        fallback: { type: "string" }
      }
    },
    sides: {
      type: "object",
      required: ["ride", "fade"],
      additionalProperties: false,
      properties: {
        ride: { type: "string" },
        fade: { type: "string" }
      }
    },
    launch: {
      type: "object",
      required: ["stakeUsdc", "nonRefundableFeeUsdc", "refundableQualityBondUsdc"],
      additionalProperties: false,
      properties: {
        stakeUsdc: { type: "number", enum: [20] },
        nonRefundableFeeUsdc: { type: "number", enum: [10] },
        refundableQualityBondUsdc: { type: "number", enum: [10] }
      }
    },
    risk: {
      type: "object",
      required: ["status", "reasons", "requiredUserEdits"],
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["allowed", "ambiguous_refine", "blocked"] },
        reasons: { type: "array", items: { type: "string" } },
        requiredUserEdits: { type: "array", items: { type: "string" } }
      }
    },
    riskStatus: { type: "string", enum: ["allowed", "ambiguous_refine", "blocked"] },
    missingFields: { type: "array", items: { type: "string" } },
    blockedReason: { type: ["string", "null"] },
    duplicateCheck: {
      type: "object",
      required: ["status", "matches"],
      additionalProperties: false,
      properties: {
        status: {
          type: "string",
          enum: ["pending", "no_match", "exact_polymarket", "exact_native", "related_polymarket", "related_native"]
        },
        matches: {
          type: "array",
          items: {
            type: "object",
            required: ["source", "id", "title", "similarity", "action"],
            additionalProperties: false,
            properties: {
              source: { type: "string", enum: ["polymarket", "nex_native"] },
              id: { type: "string" },
              title: { type: "string" },
              similarity: { type: "number", minimum: 0, maximum: 1 },
              action: { type: "string", enum: ["trade_existing", "join_existing", "launch_variant", "block_duplicate"] }
            }
          }
        }
      }
    }
  }
};

function providerMode() {
  return process.env.MARKET_COMPOSER_PROVIDER?.trim().toLowerCase();
}

function composerEnabled() {
  return process.env.MARKET_COMPOSER_ENABLED !== "false";
}

function shouldLogComposerResults() {
  const value = process.env.MARKET_COMPOSER_LOG_RESULTS?.trim().toLowerCase();
  if (value) return ["1", "true", "yes", "on"].includes(value);
  return process.env.NODE_ENV !== "production";
}

function shouldUseGemini() {
  return composerEnabled() && (providerMode() === "gemini" || Boolean(process.env.GEMINI_API_KEY?.trim()));
}

function geminiModel() {
  return process.env.GEMINI_MARKET_COMPOSER_MODEL?.trim() || "gemini-2.5-flash";
}

function geminiFallbackModels() {
  return (process.env.GEMINI_MARKET_COMPOSER_FALLBACK_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function geminiModelCandidates() {
  const candidates = Array.from(new Set([geminiModel(), ...geminiFallbackModels()]));
  if (candidates.length <= 1) {
    candidates.push("gemini-2.0-flash", "gemini-1.5-flash");
  }
  return candidates;
}

function normalizeRawThesis(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

const knownCoinGeckoIds: Record<string, string> = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  sol: "solana",
  solana: "solana",
  bnb: "binancecoin",
  binance: "binancecoin",
  xrp: "ripple",
  ripple: "ripple",
  doge: "dogecoin",
  dogecoin: "dogecoin",
  ada: "cardano",
  cardano: "cardano",
  avax: "avalanche-2",
  avalanche: "avalanche-2",
  link: "chainlink",
  chainlink: "chainlink",
  hype: "hyperliquid",
  hyperliquid: "hyperliquid"
};

function configuredCoinGeckoIds() {
  const raw = process.env.NEXMARKETS_COINGECKO_IDS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key.toLowerCase(), value]));
  } catch {
    return {};
  }
}

function normalizeSourceUrl(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function coinGeckoIdForDraft(draft: ShapedMarketDraft, rawThesis: string) {
  const configured = configuredCoinGeckoIds();
  const candidates = [
    ...draft.entities,
    draft.title,
    draft.question,
    rawThesis
  ];
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    for (const [key, coinId] of Object.entries({ ...knownCoinGeckoIds, ...configured })) {
      if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized)) {
        return coinId;
      }
    }
  }
  return null;
}

function inferredSourceUrl(input: { rawThesis: string; draft: ShapedMarketDraft }) {
  const isCoinGeckoPriceSource = input.draft.template === "token_price_threshold" || input.draft.template === "token_basket_race";
  if (!isCoinGeckoPriceSource) return null;
  const coinId = coinGeckoIdForDraft(input.draft, input.rawThesis);
  return coinId ? `https://www.coingecko.com/en/coins/${coinId}` : null;
}

function missingFieldIsSatisfied(field: string, input: {
  timeframe: ShapedMarketDraft["timeframe"];
  settlementSource: string | null;
  sourceUrl: string | null;
}) {
  const normalized = field.toLowerCase().replace(/[_-]+/g, " ");
  if ((normalized.includes("deadline") || normalized.includes("timeframe") || normalized.includes("close at") || normalized.includes("close time")) && input.timeframe) return true;
  if (normalized.includes("source url") || normalized.includes("source link")) return true;
  if (normalized.includes("settlement source") && input.settlementSource) return true;
  if (normalized === "source" && input.settlementSource) return true;
  return false;
}

function parseGeminiJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Gemini returned non-JSON composer output.");
  }
}

function responseText(response: GeminiResponse) {
  if (response.error?.message) {
    throw new GeminiComposerError(`Gemini composer failed: ${response.error.message}`, { providerStatus: response.error.status });
  }
  const text = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini composer returned an empty response.");
  return text;
}

function shouldFallbackToDeterministic(error: unknown) {
  if (!(error instanceof Error)) return false;
  const maybeGeminiError = error as GeminiComposerError;
  const message = error.message.toLowerCase();
  const providerStatus = maybeGeminiError.providerStatus?.toLowerCase() ?? "";
  const statusCode = maybeGeminiError.statusCode;

  return (
    statusCode === 400 ||
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    providerStatus === "resource_exhausted" ||
    providerStatus === "unavailable" ||
    providerStatus === "internal" ||
    message.includes("high demand") ||
    message.includes("overload") ||
    message.includes("overloaded") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("resource exhausted") ||
    message.includes("unavailable") ||
    message.includes("invalid") ||
    message.includes("safety") ||
    message.includes("block")
  );
}

function logComposerResult(input: {
  source: "deterministic" | "gemini" | "gemini_model_fallback" | "deterministic_fallback";
  draft: ShapedMarketDraft;
  model?: string;
  error?: unknown;
}) {
  if (!shouldLogComposerResults()) return;
  const error = input.error instanceof Error
    ? {
      name: input.error.name,
      message: input.error.message,
      statusCode: (input.error as GeminiComposerError).statusCode,
      providerStatus: (input.error as GeminiComposerError).providerStatus
    }
    : undefined;

  console.info("market_composer_result", JSON.stringify({
    source: input.source,
    provider: providerMode() || (shouldUseGemini() ? "gemini" : "deterministic"),
    model: input.model ?? null,
    rawThesis: input.draft.rawThesis,
    title: input.draft.title,
    question: input.draft.question,
    arena: input.draft.arena,
    template: input.draft.template,
    riskStatus: input.draft.riskStatus,
    missingFields: input.draft.missingFields,
    blockedReason: input.draft.blockedReason,
    settlementSource: input.draft.settlementSource,
    sourceUrl: input.draft.resolution.sourceUrl,
    timeframe: input.draft.timeframe,
    duplicateCheck: input.draft.duplicateCheck?.status ?? "pending",
    error
  }));
}

function composerPrompt(input: { rawThesis: string; arenaHint?: MarketArena; baseline: ShapedMarketDraft }) {
  return [
    "You are NexMarkets Thesis Studio. Shape the user's thesis into one objective Ride/Fade market draft.",
    "Return only schema-valid JSON. Do not include markdown.",
    "Product rules:",
    "- AI shapes markets; AI does not predict outcomes or decide settlements.",
    "- Use Ride/Fade language only. Avoid betting language and guaranteed-profit language.",
    "- Block unsafe/private/death/harassment/crime-accusation markets.",
    "- If the thesis is vague, set riskStatus to ambiguous_refine and list the exact missing fields.",
    "- Native markets need a fixed timeframe, objective settlement source text, Ride/Fade sides, fallback logic, and launch stake economics.",
    "- For crypto price threshold or token race markets, prefer CoinGecko public USD price data as the primary automated source whenever the asset can be identified.",
    "- Use CoinGecko coin page URLs in the form https://www.coingecko.com/en/coins/<coin-id>. Do not use Binance as the primary automated source because serverless regions may receive HTTP 451.",
    "- Use exact official/public source URLs only when available. Never invent a URL and never rely on a global fallback source.",
    "- If no exact source URL is available, set sourceUrl to null and keep the draft evidence-based instead of requiring a user edit.",
    `Raw thesis: ${input.rawThesis}`,
    `Arena hint: ${input.arenaHint ?? "none"}`,
    `Deterministic baseline: ${JSON.stringify(input.baseline)}`
  ].join("\n");
}

async function callGeminiComposer(input: { rawThesis: string; arenaHint?: MarketArena; baseline: ShapedMarketDraft; model: string }) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is required when Gemini market composer is enabled.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: composerPrompt(input) }]
      }],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: "application/json",
        responseJsonSchema: geminiDraftSchema
      }
    })
  });
  const json = await response.json() as GeminiResponse;
  if (!response.ok) {
    throw new GeminiComposerError(
      json.error?.message ? `Gemini composer failed: ${json.error.message}` : `Gemini composer failed with HTTP ${response.status}`,
      { statusCode: response.status, providerStatus: json.error?.status }
    );
  }
  return parseGeminiJson(responseText(json));
}

function deterministicPostCheck(input: { rawThesis: string; baseline: ShapedMarketDraft; draft: ShapedMarketDraft }) {
  const candidateSourceUrl = input.draft.resolution.sourceUrl || input.baseline.resolution.sourceUrl;
  const sourceUrl = normalizeSourceUrl(candidateSourceUrl) ?? inferredSourceUrl({ rawThesis: input.rawThesis, draft: input.draft });
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
    rawThesis: normalizeRawThesis(input.rawThesis),
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

export async function composeMarketDraft(input: { rawThesis: string; arenaHint?: MarketArena }) {
  const baseline = shapeMarket(input);
  if (!shouldUseGemini()) {
    logComposerResult({ source: "deterministic", draft: baseline });
    return baseline;
  }
  const models = geminiModelCandidates();
  let lastError: unknown;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const output = await callGeminiComposer({ ...input, baseline, model });
      if (!output || typeof output !== "object" || Array.isArray(output)) {
        throw new Error("Gemini returned invalid composer output.");
      }
      const candidate = output as Record<string, unknown>;
      const parsed = shapedMarketDraftSchema.parse({
        ...candidate,
        duplicateCheck: candidate.duplicateCheck ?? { status: "pending", matches: [] }
      });
      const draft = deterministicPostCheck({ rawThesis: input.rawThesis, baseline, draft: parsed });
      logComposerResult({ source: index === 0 ? "gemini" : "gemini_model_fallback", draft, model });
      return draft;
    } catch (error) {
      lastError = error;
      if (index < models.length - 1) {
        console.warn(`Gemini market composer model ${model} unavailable; trying fallback model ${models[index + 1]}.`, error);
        continue;
      }
      if (shouldFallbackToDeterministic(error)) {
        console.warn("Gemini market composer unavailable; using deterministic fallback.", error);
        logComposerResult({ source: "deterministic_fallback", draft: baseline, model, error });
        return baseline;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini market composer failed.");
}
