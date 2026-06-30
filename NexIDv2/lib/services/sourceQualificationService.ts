import { createHash } from "crypto";
import type {
  SettlementExtractor,
  ShapedMarketDraft,
  SourceQualificationDecision,
  SourceQualificationReport,
  SourceQualificationStatus
} from "@/lib/types/nexmarkets";

export type {
  SettlementExtractor,
  SourceQualificationDecision,
  SourceQualificationReport,
  SourceQualificationStatus
} from "@/lib/types/nexmarkets";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type ExtractorValidationResult =
  | { valid: true; reason: string; extractedValue: unknown }
  | { valid: false; reason: string };

type QualificationInput = {
  draft: ShapedMarketDraft;
  fetcher?: FetchLike;
};

const SCORE_LIMITS = {
  reject: 40,
  accept: 70
};

const knownCoinGeckoIds: Record<string, string> = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  sol: "solana",
  solana: "solana",
  bnb: "binancecoin",
  xrp: "ripple",
  doge: "dogecoin",
  ada: "cardano",
  avax: "avalanche-2",
  link: "chainlink",
  hype: "hyperliquid",
  hyperliquid: "hyperliquid"
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeSourceUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function currentLaunchMissingFields(draft: ShapedMarketDraft) {
  return [
    draft.timeframe?.closeAt ? null : "timeframe",
    (draft.settlementSource?.trim() || draft.resolution.sourceName?.trim()) ? null : "settlement source"
  ].filter((field): field is string => Boolean(field));
}

export function normalizeDraftLaunchReadiness(draft: ShapedMarketDraft): ShapedMarketDraft {
  const missingFields = currentLaunchMissingFields(draft);
  const blocked = draft.riskStatus === "blocked" || draft.risk.status === "blocked" || Boolean(draft.blockedReason);
  const riskStatus = blocked ? "blocked" : missingFields.length ? "ambiguous_refine" : "allowed";

  return {
    ...draft,
    riskStatus,
    missingFields,
    risk: {
      ...draft.risk,
      status: riskStatus,
      requiredUserEdits: missingFields
    }
  };
}

function isAutoVerifiableDraft(draft: ShapedMarketDraft) {
  return ["api", "oracle", "official_score", "official_chart"].includes(draft.resolution.sourceType);
}

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

function coinIdFromText(value?: string | null) {
  if (!value) return null;
  const ids = { ...knownCoinGeckoIds, ...configuredCoinGeckoIds() };
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (ids[normalized]) return ids[normalized];
  for (const [key, coinId] of Object.entries(ids)) {
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized)) return coinId;
  }
  return null;
}

function coinIdFromSourceUrl(value?: string | null) {
  const sourceUrl = normalizeSourceUrl(value);
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    const coinPage = url.pathname.match(/\/en\/coins\/([^/?#]+)/i);
    if (coinPage?.[1]) return decodeURIComponent(coinPage[1]).toLowerCase();
    const coinApi = url.pathname.match(/\/api\/v3\/coins\/([^/?#]+)/i);
    if (coinApi?.[1]) return decodeURIComponent(coinApi[1]).toLowerCase();
    const symbol = url.searchParams.get("symbol")?.replace(/(?:usdt|usdc|usd)$/i, "");
    return coinIdFromText(symbol);
  } catch {
    return null;
  }
}

function coinIdForDraft(draft: ShapedMarketDraft) {
  const candidates = [
    coinIdFromSourceUrl(draft.resolution.sourceUrl),
    ...draft.entities.map(coinIdFromText),
    coinIdFromText(draft.title),
    coinIdFromText(draft.question),
    coinIdFromText(draft.rawThesis)
  ];
  return candidates.find(Boolean) ?? null;
}

function coinGeckoApiUrl(coinId: string) {
  return `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}`;
}

function parseThreshold(text: string) {
  const match = text.match(/(?:\$|usd\s*)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i) ?? text.match(/\b([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:usd|dollars)\b/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function parseThresholdDirection(text: string) {
  return /\b(below|under|less than|drop|falls?|lower than)\b/i.test(text) ? "below" : "above";
}

function extractorForDraft(draft: ShapedMarketDraft): SettlementExtractor | null {
  if (draft.template === "token_price_threshold") {
    const threshold = parseThreshold(`${draft.title} ${draft.question} ${draft.resolution.method}`);
    if (!threshold) return null;
    return {
      field: "market_data.current_price.usd",
      operator: parseThresholdDirection(`${draft.title} ${draft.question} ${draft.resolution.method}`) === "below" ? "<=" : ">=",
      target: threshold,
      valueType: "number"
    };
  }
  if (draft.template === "token_basket_race") {
    return {
      field: "market_data.current_price.usd",
      operator: "exists",
      target: null,
      valueType: "number"
    };
  }
  return null;
}

function getPathValue(value: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
    return asRecord(current)[key];
  }, value);
}

function valueMatchesType(value: unknown, type: SettlementExtractor["valueType"]) {
  if (type === "unknown") return value !== undefined;
  if (type === "array") return Array.isArray(value);
  return typeof value === type;
}

function extractedValuesCompatible(left: unknown, right: unknown) {
  if (typeof left !== typeof right) return false;
  if (typeof left === "number" && typeof right === "number") return Number.isFinite(left) && Number.isFinite(right);
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateSettlementExtractor(input: {
  extractor: SettlementExtractor | null;
  sourceData: unknown;
}): ExtractorValidationResult {
  if (!input.extractor) {
    return { valid: false, reason: "No extractor is configured for this auto-verifiable market." };
  }
  const value = getPathValue(input.sourceData, input.extractor.field);
  if (value === undefined || value === null) {
    return { valid: false, reason: `Extractor field ${input.extractor.field} was not found.` };
  }
  if (!valueMatchesType(value, input.extractor.valueType)) {
    return { valid: false, reason: `Extractor field ${input.extractor.field} returned ${typeof value}, expected ${input.extractor.valueType}.` };
  }
  if (!["<", "<=", ">", ">=", "==", "!=", "exists"].includes(input.extractor.operator)) {
    return { valid: false, reason: `Unsupported extractor operator ${input.extractor.operator}.` };
  }
  if (input.extractor.operator !== "exists" && input.extractor.target === undefined) {
    return { valid: false, reason: "Extractor target is required for comparison operators." };
  }
  return { valid: true, reason: "Extractor field exists and comparison is executable.", extractedValue: value };
}

function compareValue(value: unknown, extractor: SettlementExtractor) {
  if (extractor.operator === "exists") return true;
  if (typeof value === "number" && typeof extractor.target === "number") {
    if (extractor.operator === ">") return value > extractor.target;
    if (extractor.operator === ">=") return value >= extractor.target;
    if (extractor.operator === "<") return value < extractor.target;
    if (extractor.operator === "<=") return value <= extractor.target;
  }
  if (extractor.operator === "==") return value === extractor.target;
  if (extractor.operator === "!=") return value !== extractor.target;
  throw new Error("Extractor comparison could not be executed.");
}

export function simulateSettlement(input: {
  extractor: SettlementExtractor | null;
  sourceData: unknown;
}) {
  const validation = validateSettlementExtractor(input);
  if (!validation.valid || !input.extractor) {
    return { ok: false, reason: validation.reason, result: null };
  }
  try {
    const extractedValue = validation.extractedValue;
    const rideWins = compareValue(extractedValue, input.extractor);
    return {
      ok: true,
      reason: "Dry run settlement executed successfully.",
      result: {
        provisionalOutcome: rideWins ? "ride" : "fade",
        field: input.extractor.field,
        operator: input.extractor.operator,
        target: input.extractor.target ?? null,
        extractedValue
      }
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Dry run settlement failed.",
      result: null
    };
  }
}

function hostLabel(sourceUrl: string | null) {
  if (!sourceUrl) return "";
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function sourceLooksStructured(sourceUrl: string | null, contentType: string, body: unknown) {
  const host = hostLabel(sourceUrl);
  if (contentType.includes("json")) return true;
  if (body && typeof body === "object" && !Array.isArray(body)) return true;
  return /api\.coingecko\.com|api\.coinbase\.com|api\.baseball|api\.football|api\.sports/i.test(host);
}

function sourceLooksStable(sourceUrl: string | null) {
  const host = hostLabel(sourceUrl);
  if (/api\.coingecko\.com|api\.coinbase\.com|coinbase\.com|coingecko\.com|sec\.gov|data\.gov|gov|fifa\.com|uefa\.com|premierleague\.com/i.test(host)) return true;
  return false;
}

function hasTimestampSupport(sourceUrl: string | null, body: unknown) {
  const record = JSON.stringify(body ?? {}).toLowerCase();
  return /last_updated|timestamp|time|updated_at|date/.test(record) || /api\.coingecko\.com|api\.coinbase\.com/i.test(sourceUrl ?? "");
}

export function sourceDecisionForScore(score: number): SourceQualificationDecision {
  if (score >= SCORE_LIMITS.accept) return "ACCEPT";
  if (score >= SCORE_LIMITS.reject) return "REPAIR";
  return "REJECT";
}

export function scoreSourceQuality(input: {
  sourceUrl: string | null;
  reachable: boolean;
  statusCode?: number | null;
  contentType?: string | null;
  body?: unknown;
  extractorValid?: boolean;
  deterministic?: boolean;
}) {
  const structured = input.reachable && sourceLooksStructured(input.sourceUrl, input.contentType ?? "", input.body);
  const stable = sourceLooksStable(input.sourceUrl);
  const timestamp = hasTimestampSupport(input.sourceUrl, input.body);
  const deterministic = input.deterministic !== false;
  const componentScores = {
    reachability: input.reachable && input.statusCode === 200 ? 20 : 0,
    structuredData: structured ? 25 : 0,
    stability: stable ? 20 : 5,
    determinism: structured && input.extractorValid && deterministic ? 25 : 0,
    timestampSupport: timestamp ? 10 : 0
  };
  const score = Object.values(componentScores).reduce((sum, value) => sum + value, 0);
  return {
    score,
    componentScores,
    decision: sourceDecisionForScore(score)
  };
}

function responseLooksBlocked(text: string) {
  const lower = text.toLowerCase();
  return /captcha|sign in|log in|login required|unauthorized|forbidden|paywall|subscribe to continue|cloudflare|access denied/.test(lower);
}

async function fetchSource(input: { sourceUrl: string | null; fetcher: FetchLike }) {
  if (!input.sourceUrl) return { ok: false, status: 0, contentType: "", body: null, reason: "No source URL was provided." };
  try {
    const response = await input.fetcher(input.sourceUrl, {
      cache: "no-store",
      headers: { "user-agent": "NexMarketsSourceQualifier/1.0" }
    });
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    let body: unknown = text;
    if (contentType.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
      body = JSON.parse(text);
    }
    if (response.ok && responseLooksBlocked(text)) {
      return { ok: false, status: response.status, contentType, body, reason: "Source appears blocked by login, captcha, paywall or access control." };
    }
    return { ok: response.ok, status: response.status, contentType, body, reason: response.ok ? "Source is reachable." : `Source returned HTTP ${response.status}.` };
  } catch (error) {
    return { ok: false, status: 0, contentType: "", body: null, reason: error instanceof Error ? error.message : "Source fetch failed." };
  }
}

export function repairAutoVerifiableSource(draft: ShapedMarketDraft) {
  const attempts: SourceQualificationReport["repairAttempts"] = [];
  const configured = configuredRepairSourceForDraft(draft);
  if (configured) {
    attempts.push({ sourceUrl: configured, reason: "Configured deterministic replacement source for this arena or market style.", status: "attempted" });
    return { sourceUrl: configured, attempts };
  }
  if (draft.arena === "crypto" || draft.template === "token_price_threshold" || draft.template === "token_basket_race") {
    const coinId = coinIdForDraft(draft);
    if (coinId) {
      const sourceUrl = coinGeckoApiUrl(coinId);
      attempts.push({ sourceUrl, reason: "Crypto auto-verifiable markets prefer CoinGecko's machine-readable coin API.", status: "attempted" });
      return { sourceUrl, attempts };
    }
  }
  attempts.push({ sourceUrl: null, reason: "No deterministic replacement source could be inferred for this market.", status: "rejected" });
  return { sourceUrl: null, attempts };
}

function configuredRepairSourceForDraft(draft: ShapedMarketDraft) {
  const raw = process.env.NEXMARKETS_SOURCE_REPAIR_SOURCES_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const candidates = [
      `${draft.arena}:${draft.template}`,
      draft.template,
      draft.arena
    ];
    for (const key of candidates) {
      const sourceUrl = normalizeSourceUrl(parsed[key]);
      if (sourceUrl) return sourceUrl;
    }
  } catch {
    return null;
  }
  return null;
}

function reportHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function qualifyCandidate(input: {
  draft: ShapedMarketDraft;
  sourceUrl: string | null;
  fetcher: FetchLike;
}) {
  const extractor = extractorForDraft(input.draft);
  const fetched = await fetchSource({ sourceUrl: input.sourceUrl, fetcher: input.fetcher });
  const extractorValidation: ExtractorValidationResult = fetched.ok
    ? validateSettlementExtractor({ extractor, sourceData: fetched.body })
    : { valid: false, reason: fetched.reason };
  const dryRun = fetched.ok
    ? simulateSettlement({ extractor, sourceData: fetched.body })
    : { ok: false, reason: fetched.reason, result: null };
  let deterministic = false;
  let determinismReason = "Determinism could not be checked because the first extraction failed.";
  if (fetched.ok && extractorValidation.valid && extractor) {
    const secondFetch = await fetchSource({ sourceUrl: input.sourceUrl, fetcher: input.fetcher });
    const secondValidation: ExtractorValidationResult = secondFetch.ok
      ? validateSettlementExtractor({ extractor, sourceData: secondFetch.body })
      : { valid: false, reason: secondFetch.reason };
    deterministic = secondFetch.ok &&
      secondValidation.valid &&
      extractedValuesCompatible(extractorValidation.extractedValue, secondValidation.extractedValue);
    determinismReason = deterministic
      ? "Extractor produced a compatible result across two independent executions."
      : `Second extraction failed or changed shape. ${secondValidation.reason}`;
  }
  const score = scoreSourceQuality({
    sourceUrl: input.sourceUrl,
    reachable: fetched.ok,
    statusCode: fetched.status,
    contentType: fetched.contentType,
    body: fetched.body,
    extractorValid: extractorValidation.valid && dryRun.ok,
    deterministic
  });
  const reasoning = [
    fetched.reason,
    extractorValidation.reason,
    dryRun.reason,
    determinismReason,
    `Source score ${score.score}/100.`
  ];
  return {
    sourceUrl: input.sourceUrl,
    extractor,
    fetched,
    extractorValidation,
    dryRun,
    score,
    reasoning
  };
}

function buildEvidenceBasedReport(input: {
  draft: ShapedMarketDraft;
  status?: SourceQualificationStatus;
  reason: string;
  repairAttempts?: SourceQualificationReport["repairAttempts"];
  launchBlocked?: boolean;
}): SourceQualificationReport {
  const now = new Date().toISOString();
  return {
    status: input.status ?? "EVIDENCE_BASED",
    decision: input.launchBlocked ? "REJECT" : "ACCEPT",
    settlementMode: "evidence_based",
    sourceUrl: normalizeSourceUrl(input.draft.resolution.sourceUrl),
    score: 0,
    componentScores: { reachability: 0, structuredData: 0, stability: 0, determinism: 0, timestampSupport: 0 },
    reasoning: [input.reason],
    repairAttempts: input.repairAttempts ?? [],
    extractor: null,
    extractorValidationStatus: "not_required",
    extractorValidationReason: "Evidence-based settlement does not require an automated extractor.",
    dryRunStatus: "not_required",
    dryRunResult: null,
    sourceValidationTimestamp: now,
    launchBlocked: Boolean(input.launchBlocked),
    launchBlockReason: input.launchBlocked ? input.reason : null
  };
}

function withQualification(draft: ShapedMarketDraft, report: SourceQualificationReport): ShapedMarketDraft {
  return {
    ...draft,
    settlementMode: report.settlementMode,
    settlementExtractor: report.extractor,
    sourceQualification: report
  };
}

function downgradeDraftToEvidenceBased(draft: ShapedMarketDraft, report: SourceQualificationReport): ShapedMarketDraft {
  return {
    ...withQualification(draft, report),
    resolution: {
      ...draft.resolution,
      sourceType: "manual_optimistic",
      method: `${draft.resolution.method} Evidence-based ProofFlow review is required because no machine-resolvable source passed pre-launch qualification.`,
      fallback: draft.resolution.fallback || "If the locked source and public evidence cannot prove YES or NO, resolve INVALID / REFUND."
    }
  };
}

export async function qualifyMarketDraftForLaunch(input: QualificationInput): Promise<ShapedMarketDraft> {
  const fetcher = input.fetcher ?? fetch;
  const draft = normalizeDraftLaunchReadiness(input.draft);
  if (!isAutoVerifiableDraft(draft)) {
    return withQualification(draft, buildEvidenceBasedReport({
      draft,
      reason: "This market is evidence-based; automated source qualification is not required."
    }));
  }

  const primarySourceUrl = normalizeSourceUrl(draft.resolution.sourceUrl);
  const primary = await qualifyCandidate({ draft, sourceUrl: primarySourceUrl, fetcher });
  let selected = primary;
  const repairAttempts: SourceQualificationReport["repairAttempts"] = [];

  if (primary.score.decision !== "ACCEPT" || !primary.extractorValidation.valid || !primary.dryRun.ok) {
    const repair = repairAutoVerifiableSource(draft);
    repairAttempts.push(...repair.attempts);
    if (repair.sourceUrl && repair.sourceUrl !== primarySourceUrl) {
      const repaired = await qualifyCandidate({ draft, sourceUrl: repair.sourceUrl, fetcher });
      repairAttempts[repairAttempts.length - 1] = {
        ...repairAttempts[repairAttempts.length - 1],
        status: repaired.score.decision === "ACCEPT" && repaired.extractorValidation.valid && repaired.dryRun.ok ? "accepted" : "rejected",
        score: repaired.score.score
      };
      if (repaired.score.score > primary.score.score || (repaired.extractorValidation.valid && repaired.dryRun.ok)) selected = repaired;
    }
  }

  const accepted = selected.score.decision === "ACCEPT" && selected.extractorValidation.valid && selected.dryRun.ok;
  const now = new Date().toISOString();
  const report: SourceQualificationReport = {
    status: accepted ? "ACCEPT" : selected.score.decision,
    decision: accepted ? "ACCEPT" : selected.score.decision,
    settlementMode: accepted ? "auto_verifiable" : "evidence_based",
    sourceUrl: selected.sourceUrl,
    repairedSourceUrl: selected.sourceUrl !== primarySourceUrl ? selected.sourceUrl : null,
    score: selected.score.score,
    componentScores: selected.score.componentScores,
    reasoning: selected.reasoning,
    repairAttempts,
    extractor: selected.extractor,
    extractorValidationStatus: selected.extractorValidation.valid ? "valid" : "invalid",
    extractorValidationReason: selected.extractorValidation.reason,
    dryRunStatus: selected.dryRun.ok ? "passed" : "failed",
    dryRunResult: selected.dryRun.result ? { ...selected.dryRun.result, reportHash: reportHash(selected.dryRun.result) } : null,
    sourceValidationTimestamp: now,
    launchBlocked: false,
    launchBlockReason: null
  };

  if (accepted) {
    return withQualification(normalizeDraftLaunchReadiness({
      ...draft,
      settlementSource: selected.sourceUrl ?? draft.settlementSource,
      resolution: {
        ...draft.resolution,
        sourceUrl: selected.sourceUrl,
        sourceName: hostLabel(selected.sourceUrl) || draft.resolution.sourceName
      }
    }), report);
  }

  return downgradeDraftToEvidenceBased(normalizeDraftLaunchReadiness({
    ...draft,
    settlementSource: selected.sourceUrl ?? draft.settlementSource,
    resolution: {
      ...draft.resolution,
      sourceUrl: selected.sourceUrl ?? primarySourceUrl,
      sourceName: hostLabel(selected.sourceUrl ?? primarySourceUrl) || draft.resolution.sourceName
    }
  }), {
    ...report,
    status: "DOWNGRADED",
    settlementMode: "evidence_based",
    reasoning: [
      ...report.reasoning,
      "Auto-verifiable source qualification failed; market was downgraded to evidence-based ProofFlow settlement."
    ]
  });
}

export function sourceQualificationBlocksLaunch(draft: ShapedMarketDraft) {
  return Boolean(draft.sourceQualification?.launchBlocked);
}

export const SourceQualificationService = {
  validateSettlementExtractor,
  simulateSettlement,
  scoreSourceQuality,
  repairAutoVerifiableSource,
  normalizeDraftLaunchReadiness,
  qualifyMarketDraftForLaunch,
  sourceQualificationBlocksLaunch
};
