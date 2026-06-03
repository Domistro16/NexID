import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { requireDatabase } from "@/lib/server/db";
import type { ShapedMarketDraft } from "@/lib/types/nexmarkets";

type ResolutionOutcome = "ride" | "fade" | "invalid";
type VerificationOutcome = ResolutionOutcome | "needs_review";

type VerificationEvidence = Record<string, unknown>;

type MarketForVerification = {
  id: string;
  title: string;
  question: string;
  template: string | null;
  sourceUrl: string | null;
  closeTime: Date | null;
  createdAt: Date;
};

type RulesRow = {
  marketId: string;
  template: string;
  settlementSource: string;
  closeTime: Date;
  rawRules: unknown;
};

export type NativeVerificationResult = {
  marketId: string;
  outcome: VerificationOutcome;
  confidence: number;
  sourceUrl: string | null;
  claim: string;
  evidence: VerificationEvidence;
  adapter: string;
  lastError?: string;
};

export type NativeVerificationBotResult = {
  action: "verify_result";
  marketId: string;
  ok: boolean;
  outcome?: VerificationOutcome;
  status?: string;
  confidence?: number;
  detail?: string;
};

const VERIFIED_STATUS = "verified_result";
const REVIEW_STATUS = "pending_review";
const READY_STATUS = "ready_to_assert";
const DEFAULT_MIN_CONFIDENCE = 0.96;

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as never;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Verification failed.";
}

function isRateLimitError(error: unknown) {
  return /\b429\b|rate.?limit|too many requests|quota/i.test(errorMessage(error));
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function configuredAutoQueue() {
  return process.env.NEXMARKETS_AUTO_QUEUE_VERIFIED_ASSERTIONS === "true";
}

function minConfidence() {
  const configured = Number(process.env.NEXMARKETS_AUTO_QUEUE_MIN_CONFIDENCE);
  return Number.isFinite(configured) && configured > 0 && configured <= 1 ? configured : DEFAULT_MIN_CONFIDENCE;
}

function draftFromRules(rules: RulesRow): ShapedMarketDraft | null {
  const raw = asRecord(rules.rawRules);
  if (!raw.question || !raw.resolution || !raw.timeframe) return null;
  return raw as ShapedMarketDraft;
}

function sourceUrlFor(market: MarketForVerification, draft: ShapedMarketDraft | null) {
  return draft?.resolution.sourceUrl ?? market.sourceUrl;
}

function closeTimeFor(market: MarketForVerification, draft: ShapedMarketDraft | null, rules: RulesRow) {
  const value = draft?.timeframe?.closeAt ? new Date(draft.timeframe.closeAt) : market.closeTime ?? rules.closeTime;
  return Number.isNaN(value.getTime()) ? market.closeTime ?? rules.closeTime : value;
}

function startTimeFor(market: MarketForVerification, draft: ShapedMarketDraft | null) {
  const value = draft?.timeframe?.startAt ? new Date(draft.timeframe.startAt) : market.createdAt;
  return Number.isNaN(value.getTime()) ? market.createdAt : value;
}

function claimFor(input: {
  market: MarketForVerification;
  outcome: VerificationOutcome;
  sourceUrl: string | null;
  adapter: string;
  evidenceHash: string;
  summary: string;
}) {
  const outcomeLabel = input.outcome === "needs_review" ? "requires manual review" : `resolves ${input.outcome.toUpperCase()}`;
  return normalizeText([
    `NexMarkets market ${input.market.id} (${input.market.title}) ${outcomeLabel}.`,
    `Question: ${input.market.question}.`,
    input.sourceUrl ? `Locked source: ${input.sourceUrl}.` : "Locked source: unavailable.",
    `Verifier: ${input.adapter}.`,
    `Evidence hash: ${input.evidenceHash}.`,
    input.summary
  ].join(" "));
}

function parseThreshold(text: string) {
  const match = text.match(/(?:\$|usd\s*)\s*([0-9]+(?:\.[0-9]+)?)/i) ?? text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:usd|dollars)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseThresholdDirection(text: string) {
  return /\b(below|under|less than|drop|falls?|lower than)\b/i.test(text) ? "below" : "above";
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

function configuredCoinIds() {
  const raw = process.env.NEXMARKETS_COINGECKO_IDS_JSON;
  if (!raw) return {};
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(Object.entries(map).map(([key, value]) => [key.toLowerCase(), value]));
  } catch {
    return {};
  }
}

function coinIdFromLabel(value?: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const ids = { ...knownCoinGeckoIds, ...configuredCoinIds() };
  if (ids[normalized]) return ids[normalized];
  for (const [key, coinId] of Object.entries(ids)) {
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized)) return coinId;
  }
  return null;
}

function coinIdFromExchangeSymbol(value?: string | null) {
  const symbol = value?.trim().toLowerCase();
  if (!symbol) return null;
  const match = symbol.match(/^([a-z0-9]+?)(?:usdt|usdc|usd|busd)$/i);
  return coinIdFromLabel(match?.[1] ?? symbol);
}

function coingeckoIdFromUrl(sourceUrl: string | null) {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    const coinPage = url.pathname.match(/\/en\/coins\/([^/?#]+)/i);
    if (coinPage?.[1]) return decodeURIComponent(coinPage[1]).toLowerCase();
    const apiCoin = url.pathname.match(/\/api\/v3\/coins\/([^/?#]+)/i);
    if (apiCoin?.[1]) return decodeURIComponent(apiCoin[1]).toLowerCase();
    const binanceSymbol = url.searchParams.get("symbol") ?? url.pathname.match(/\/(?:ticker|klines|trades|aggTrades)\/?([^/?#]+)?/i)?.[1] ?? null;
    const exchangeCoinId = coinIdFromExchangeSymbol(binanceSymbol);
    if (exchangeCoinId) return exchangeCoinId;
    const coinbaseProduct = url.pathname.match(/\/products\/([^/?#]+)/i)?.[1];
    const coinbaseCoinId = coinIdFromExchangeSymbol(coinbaseProduct?.replace(/-/g, ""));
    if (coinbaseCoinId) return coinbaseCoinId;
  } catch {
    return null;
  }
  return null;
}

function configuredCoinId(entity: string) {
  return coinIdFromLabel(entity);
}

function coinIdFromDraft(draft: ShapedMarketDraft | null) {
  const candidates = [
    ...(draft?.entities ?? []),
    draft?.title,
    draft?.question,
    draft?.rawThesis
  ];
  for (const candidate of candidates) {
    const coinId = coinIdFromLabel(candidate);
    if (coinId) return coinId;
  }
  return null;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "NexMarketsResultVerifier/1.0",
        ...(init.headers ?? {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url: string) {
  const response = await fetchWithTimeout(url, { cache: "no-store" });
  const body = await response.text();
  if (!response.ok) throw new Error(`Source fetch failed with HTTP ${response.status}`);
  return JSON.parse(body) as unknown;
}

async function fetchSourceSnapshot(sourceUrl: string | null) {
  if (!sourceUrl) {
    return {
      ok: false,
      sourceUrl,
      error: "No locked source URL is available for verification."
    };
  }
  try {
    const response = await fetchWithTimeout(sourceUrl, { cache: "no-store" });
    const body = await response.text();
    const normalized = normalizeText(body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
    return {
      ok: response.ok,
      sourceUrl,
      httpStatus: response.status,
      contentHash: createHash("sha256").update(body).digest("hex"),
      excerpt: normalized.slice(0, 4000),
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      sourceUrl,
      error: error instanceof Error ? error.message : "Source fetch failed."
    };
  }
}

function coingeckoRangeUrl(coinId: string, from: Date, to: Date) {
  const start = Math.floor(from.getTime() / 1000);
  const end = Math.floor(to.getTime() / 1000);
  return `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${start}&to=${end}`;
}

function pricePointsFromCoinGecko(value: unknown) {
  const prices = asRecord(value).prices;
  if (!Array.isArray(prices)) return [];
  return prices.flatMap((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) return [];
    const timestamp = Number(entry[0]);
    const price = Number(entry[1]);
    return Number.isFinite(timestamp) && Number.isFinite(price) ? [{ timestamp, price }] : [];
  });
}

async function verifyPriceThreshold(input: {
  market: MarketForVerification;
  rules: RulesRow;
  draft: ShapedMarketDraft | null;
  sourceUrl: string | null;
}) {
  const text = `${input.market.title} ${input.market.question} ${input.draft?.resolution.method ?? ""}`;
  const threshold = parseThreshold(text);
  const coinId = coingeckoIdFromUrl(input.sourceUrl) ?? coinIdFromDraft(input.draft);
  if (!threshold || !coinId) return null;

  const startAt = startTimeFor(input.market, input.draft);
  const closeAt = closeTimeFor(input.market, input.draft, input.rules);
  const direction = parseThresholdDirection(text);
  const apiUrl = coingeckoRangeUrl(coinId, startAt, closeAt);
  const payload = await fetchJson(apiUrl);
  const points = pricePointsFromCoinGecko(payload);
  if (!points.length) throw new Error("CoinGecko returned no price points for the locked verification window.");
  const maxPrice = Math.max(...points.map((point) => point.price));
  const minPrice = Math.min(...points.map((point) => point.price));
  const finalPrice = points[points.length - 1].price;
  const rideWins = direction === "below" ? minPrice <= threshold : maxPrice >= threshold;
  const outcome: ResolutionOutcome = rideWins ? "ride" : "fade";
  const evidence = {
    adapter: "coingecko_price_threshold",
    coinId,
    threshold,
    direction,
    startAt: startAt.toISOString(),
    closeAt: closeAt.toISOString(),
    pointsChecked: points.length,
    minPrice,
    maxPrice,
    finalPrice,
    sourceUrl: input.sourceUrl,
    apiUrl,
    verifiedAt: new Date().toISOString()
  };
  const evidenceHash = hashJson(evidence);
  return {
    marketId: input.market.id,
    outcome,
    confidence: 0.99,
    sourceUrl: input.sourceUrl,
    claim: claimFor({
      market: input.market,
      outcome,
      sourceUrl: input.sourceUrl,
      adapter: "coingecko_price_threshold",
      evidenceHash,
      summary: `The ${coinId} ${direction === "below" ? "minimum" : "maximum"} USD price during the locked window was ${direction === "below" ? minPrice : maxPrice}, threshold ${threshold}.`
    }),
    evidence,
    adapter: "coingecko_price_threshold"
  } satisfies NativeVerificationResult;
}

function basketCoinIds(draft: ShapedMarketDraft | null) {
  const entities = draft?.entities ?? [];
  if (entities.length < 2) return null;
  const first = configuredCoinId(entities[0]);
  const second = configuredCoinId(entities[1]);
  return first && second ? [first, second] as const : null;
}

function nearestPrice(points: Array<{ timestamp: number; price: number }>, target: Date) {
  if (!points.length) return null;
  const targetMs = target.getTime();
  return points.reduce((best, point) => (
    Math.abs(point.timestamp - targetMs) < Math.abs(best.timestamp - targetMs) ? point : best
  ), points[0]);
}

async function verifyBasketRace(input: {
  market: MarketForVerification;
  rules: RulesRow;
  draft: ShapedMarketDraft | null;
  sourceUrl: string | null;
}) {
  const ids = basketCoinIds(input.draft);
  if (!ids) return null;
  const startAt = startTimeFor(input.market, input.draft);
  const closeAt = closeTimeFor(input.market, input.draft, input.rules);
  const [firstId, secondId] = ids;
  const [firstPayload, secondPayload] = await Promise.all([
    fetchJson(coingeckoRangeUrl(firstId, startAt, closeAt)),
    fetchJson(coingeckoRangeUrl(secondId, startAt, closeAt))
  ]);
  const firstPoints = pricePointsFromCoinGecko(firstPayload);
  const secondPoints = pricePointsFromCoinGecko(secondPayload);
  const firstStart = nearestPrice(firstPoints, startAt);
  const firstClose = nearestPrice(firstPoints, closeAt);
  const secondStart = nearestPrice(secondPoints, startAt);
  const secondClose = nearestPrice(secondPoints, closeAt);
  if (!firstStart || !firstClose || !secondStart || !secondClose) {
    throw new Error("CoinGecko returned incomplete basket price windows.");
  }
  const firstReturn = ((firstClose.price - firstStart.price) / firstStart.price) * 100;
  const secondReturn = ((secondClose.price - secondStart.price) / secondStart.price) * 100;
  const outcome: ResolutionOutcome = firstReturn > secondReturn ? "ride" : "fade";
  const evidence = {
    adapter: "coingecko_basket_race",
    entities: input.draft?.entities ?? [],
    firstId,
    secondId,
    startAt: startAt.toISOString(),
    closeAt: closeAt.toISOString(),
    firstStartPrice: firstStart.price,
    firstClosePrice: firstClose.price,
    firstReturn,
    secondStartPrice: secondStart.price,
    secondClosePrice: secondClose.price,
    secondReturn,
    sourceUrl: input.sourceUrl,
    verifiedAt: new Date().toISOString()
  };
  const evidenceHash = hashJson(evidence);
  return {
    marketId: input.market.id,
    outcome,
    confidence: 0.99,
    sourceUrl: input.sourceUrl,
    claim: claimFor({
      market: input.market,
      outcome,
      sourceUrl: input.sourceUrl,
      adapter: "coingecko_basket_race",
      evidenceHash,
      summary: `${firstId} returned ${firstReturn.toFixed(4)}%; ${secondId} returned ${secondReturn.toFixed(4)}% over the locked window.`
    }),
    evidence,
    adapter: "coingecko_basket_race"
  } satisfies NativeVerificationResult;
}

async function callCustomVerifier(input: {
  market: MarketForVerification;
  rules: RulesRow;
  draft: ShapedMarketDraft | null;
  sourceUrl: string | null;
}) {
  const endpoint = process.env.NEXMARKETS_RESULT_VERIFIER_ENDPOINT?.trim();
  if (!endpoint) return null;
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(process.env.NEXMARKETS_RESULT_VERIFIER_API_KEY ? { authorization: `Bearer ${process.env.NEXMARKETS_RESULT_VERIFIER_API_KEY}` } : {})
    },
    body: JSON.stringify({
      market: input.market,
      rules: input.rules,
      draft: input.draft,
      sourceUrl: input.sourceUrl
    })
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Verifier endpoint failed with HTTP ${response.status}`);
  const outcome = body.outcome;
  if (outcome !== "ride" && outcome !== "fade" && outcome !== "invalid" && outcome !== "needs_review") {
    throw new Error("Verifier endpoint returned an invalid outcome.");
  }
  const confidence = Math.max(0, Math.min(1, Number(body.confidence ?? 0)));
  const evidence = asRecord(body.evidence);
  const evidenceWithMeta = {
    ...evidence,
    adapter: "custom_endpoint",
    endpoint,
    verifiedAt: new Date().toISOString()
  };
  const evidenceHash = hashJson(evidenceWithMeta);
  return {
    marketId: input.market.id,
    outcome,
    confidence,
    sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : input.sourceUrl,
    claim: typeof body.claim === "string" && body.claim.trim().length >= 32
      ? body.claim.trim()
      : claimFor({
        market: input.market,
        outcome,
        sourceUrl: input.sourceUrl,
        adapter: "custom_endpoint",
        evidenceHash,
        summary: "A configured verifier endpoint returned this proposed result."
      }),
    evidence: evidenceWithMeta,
    adapter: "custom_endpoint"
  } satisfies NativeVerificationResult;
}

async function needsReviewResult(input: {
  market: MarketForVerification;
  rules: RulesRow;
  draft: ShapedMarketDraft | null;
  sourceUrl: string | null;
  reason: string;
}) {
  const snapshot = await fetchSourceSnapshot(input.sourceUrl);
  const evidence = {
    adapter: "manual_review",
    reason: input.reason,
    template: input.rules.template,
    settlementSource: input.rules.settlementSource,
    method: input.draft?.resolution.method ?? null,
    fallback: input.draft?.resolution.fallback ?? null,
    snapshot,
    verifiedAt: new Date().toISOString()
  };
  const evidenceHash = hashJson(evidence);
  return {
    marketId: input.market.id,
    outcome: "needs_review",
    confidence: snapshot.ok ? 0.35 : 0.1,
    sourceUrl: input.sourceUrl,
    claim: claimFor({
      market: input.market,
      outcome: "needs_review",
      sourceUrl: input.sourceUrl,
      adapter: "manual_review",
      evidenceHash,
      summary: input.reason
    }),
    evidence,
    adapter: "manual_review",
    lastError: input.reason
  } satisfies NativeVerificationResult;
}

async function verifyWithAdapters(input: {
  market: MarketForVerification;
  rules: RulesRow;
  draft: ShapedMarketDraft | null;
}) {
  const sourceUrl = sourceUrlFor(input.market, input.draft);
  const custom = await callCustomVerifier({ ...input, sourceUrl });
  if (custom) return custom;

  try {
    if (input.rules.template === "token_price_threshold" || input.market.template === "token_price_threshold") {
      const result = await verifyPriceThreshold({ ...input, sourceUrl });
      if (result) return result;
    }
    if (input.rules.template === "token_basket_race" || input.market.template === "token_basket_race") {
      const result = await verifyBasketRace({ ...input, sourceUrl });
      if (result) return result;
    }
  } catch (error) {
    return needsReviewResult({
      ...input,
      sourceUrl,
      reason: error instanceof Error ? error.message : "Automated verification failed."
    });
  }

  return needsReviewResult({
    ...input,
    sourceUrl,
    reason: "No deterministic verifier is configured for this market template/source. Admin review is required before UMA assertion."
  });
}

async function persistVerification(input: {
  db: PrismaClient;
  market: MarketForVerification;
  result: NativeVerificationResult;
  autoQueue?: boolean;
}) {
  const evidenceHash = hashJson(input.result.evidence);
  const canQueue =
    Boolean(input.autoQueue) &&
    input.result.outcome !== "needs_review" &&
    input.result.confidence >= minConfidence();
  const status = canQueue
    ? READY_STATUS
    : input.result.outcome === "needs_review"
      ? REVIEW_STATUS
      : VERIFIED_STATUS;
  const verificationStatus = input.result.outcome === "needs_review"
    ? "needs_review"
    : canQueue
      ? "approved"
      : "verified";
  const data = {
    proposedOutcome: input.result.outcome === "needs_review" ? null : input.result.outcome,
    status,
    resolutionMode: input.result.adapter,
    assertionClaim: input.result.claim,
    evidence: jsonInput(input.result.evidence),
    evidenceHash,
    verificationStatus,
    confidence: input.result.confidence,
    verifiedAt: new Date(),
    lastError: input.result.lastError ?? null
  };
  const current = await input.db.marketResolution.findFirst({
    where: { marketId: input.market.id },
    orderBy: { updatedAt: "desc" }
  });
  const resolution = current
    ? await input.db.marketResolution.update({ where: { id: current.id }, data })
    : await input.db.marketResolution.create({ data: { marketId: input.market.id, ...data } });
  await input.db.market.update({
    where: { id: input.market.id },
    data: { resolutionState: canQueue ? "ready_to_assert" : verificationStatus }
  });
  return resolution;
}

export async function verifyNativeMarketResult(marketId: string, input: { autoQueue?: boolean; force?: boolean } = {}) {
  const db = requireDatabase();
  const market = await db.market.findUnique({
    where: { id: marketId },
    select: {
      id: true,
      origin: true,
      status: true,
      title: true,
      question: true,
      template: true,
      sourceUrl: true,
      closeTime: true,
      createdAt: true
    }
  });
  if (!market) throw new Error("Market not found.");
  if (market.origin !== "native") throw new Error("Only native markets can be verified by native result verification.");
  if (market.status !== "closed") throw new Error("Market must be closed before result verification.");
  const rules = await db.nativeMarketRules.findUnique({ where: { marketId } });
  if (!rules) throw new Error("Native market rules not found.");
  const current = await db.marketResolution.findFirst({
    where: { marketId },
    orderBy: { updatedAt: "desc" }
  });
  if (!input.force && current && ["ready_to_assert", "asserted", "disputed", "settled", "invalid_refund"].includes(current.status)) {
    return {
      action: "verify_result",
      marketId,
      ok: true,
      outcome: current.proposedOutcome ?? "needs_review",
      status: current.status,
      confidence: current.confidence ?? undefined,
      detail: "Resolution already queued or finalized."
    } satisfies NativeVerificationBotResult;
  }
  const draft = draftFromRules(rules);
  const result = await verifyWithAdapters({ market, rules, draft });
  const resolution = await persistVerification({
    db,
    market,
    result,
    autoQueue: input.autoQueue ?? configuredAutoQueue()
  });
  return {
    action: "verify_result",
    marketId,
    ok: true,
    outcome: result.outcome,
    status: resolution.status,
    confidence: result.confidence
  } satisfies NativeVerificationBotResult;
}

export async function verifyClosedNativeMarketResults(input: { limit?: number; autoQueue?: boolean; force?: boolean } = {}) {
  const db = requireDatabase();
  const limit = input.limit ?? 10;
  const markets = await db.market.findMany({
    where: {
      origin: "native",
      status: "closed",
      closeTime: { lte: new Date() }
    },
    orderBy: { closeTime: "asc" },
    take: limit,
    select: { id: true }
  });
  const results: NativeVerificationBotResult[] = [];
  for (const market of markets) {
    try {
      results.push(await verifyNativeMarketResult(market.id, {
        autoQueue: input.autoQueue,
        force: input.force
      }));
    } catch (error) {
      if (isRateLimitError(error)) {
        results.push({
          action: "verify_result",
          marketId: market.id,
          ok: true,
          outcome: "needs_review",
          status: "rate_limited",
          detail: `Rate limited; will retry on the next bot run. ${errorMessage(error)}`
        });
        continue;
      }
      results.push({
        action: "verify_result",
        marketId: market.id,
        ok: false,
        detail: errorMessage(error)
      });
    }
  }
  return results;
}

export async function approveVerifiedMarketResult(input: { marketId: string; proposerWallet?: string }) {
  const db = requireDatabase();
  const market = await db.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error("Market not found.");
  if (market.origin !== "native") throw new Error("Only native markets can be approved for native resolution.");
  if (market.status !== "closed") throw new Error("Market must be closed before approval.");
  const resolution = await db.marketResolution.findFirst({
    where: { marketId: input.marketId },
    orderBy: { updatedAt: "desc" }
  });
  if (!resolution) throw new Error("Verify the market before approving the result.");
  if (!resolution.proposedOutcome || resolution.proposedOutcome === "invalid" && !resolution.assertionClaim) {
    throw new Error("Resolution needs a proposed outcome and claim before approval.");
  }
  if (!resolution.assertionClaim || resolution.assertionClaim.trim().length < 32) {
    throw new Error("Resolution claim is missing or too short.");
  }
  return db.marketResolution.update({
    where: { id: resolution.id },
    data: {
      status: READY_STATUS,
      verificationStatus: "approved",
      proposerWallet: input.proposerWallet ?? resolution.proposerWallet,
      lastError: null
    }
  });
}
