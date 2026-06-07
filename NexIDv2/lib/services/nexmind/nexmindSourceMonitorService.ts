import { withDatabase } from "@/lib/server/db";
import { bankrFeatureEnabled, booleanFromEnv } from "@/lib/services/bankr/bankrConfig";
import { bankrAiReady, callBankrJson } from "@/lib/services/bankr/bankrAiService";
import { createCreatorNotification } from "@/lib/services/nexmind/nexmindNotificationService";
import { sendTelegramBotMessage } from "@/lib/services/nexmind/telegramAlertService";

type SourceHealthStatus = "healthy" | "warning" | "broken";
type SourceHealthAlertTarget = "creator_prelaunch" | "creator_action_window" | "ops_locked_live" | "ops_settlement" | "none";

type MarketSourceRow = {
  id: string;
  title: string;
  status: string;
  sourceUrl: string | null;
  creatorUserId: string | null;
  creatorWallet: string | null;
  sourceHealthStatus: string;
  rulesHash?: string | null;
  metadataHash?: string | null;
  resolutionCard?: unknown;
  challengeWindowEndsAt?: Date | null;
  routeDecision: unknown;
};

const PRE_LAUNCH_STATUSES = new Set(["draft", "route_check", "ready_to_launch"]);
const LIVE_STATUSES = new Set(["live_pending_open", "trading_live"]);

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringFromRecord(value: Record<string, unknown>, key: string) {
  const direct = value[key];
  return typeof direct === "string" ? direct : null;
}

function parseFutureDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.getTime() > Date.now() ? date : null;
}

function fallbackSourceUrl(value: unknown) {
  const route = asRecord(value);
  const fallback = asRecord(route.fallback);
  const direct = typeof route.fallbackSourceUrl === "string" ? route.fallbackSourceUrl : null;
  const nested = typeof fallback.sourceUrl === "string" ? fallback.sourceUrl : null;
  return direct ?? nested;
}

function sourceAlertTitle(input: { result: Awaited<ReturnType<typeof checkMarketSourceHealth>> }) {
  const { result } = input;
  if (result.staleReason === "missing_source_url" || result.staleReason === "invalid_source_url") return "Market source URL needs setup";
  if (result.status === "broken") return "Market source is broken";
  return "Market source needs review";
}

function sourceHealthCreatorActionWindow(market: MarketSourceRow) {
  const card = asRecord(market.resolutionCard);
  const route = asRecord(market.routeDecision);
  const candidates = [
    stringFromRecord(card, "creatorActionWindowEndsAt"),
    stringFromRecord(card, "sourceActionWindowEndsAt"),
    stringFromRecord(route, "creatorActionWindowEndsAt"),
    stringFromRecord(route, "sourceActionWindowEndsAt")
  ];
  for (const candidate of candidates) {
    const date = parseFutureDate(candidate);
    if (date) return date;
  }
  return null;
}

function sourceRulesLocked(market: MarketSourceRow) {
  return Boolean(market.rulesHash || market.metadataHash || market.resolutionCard);
}

export function routeSourceHealthAlert(market: MarketSourceRow): {
  target: SourceHealthAlertTarget;
  creatorActionWindowEndsAt: Date | null;
  reason: string;
} {
  if (PRE_LAUNCH_STATUSES.has(market.status)) {
    return {
      target: "creator_prelaunch",
      creatorActionWindowEndsAt: null,
      reason: "pre_launch_source_can_still_be_repaired"
    };
  }
  const actionWindow = sourceHealthCreatorActionWindow(market);
  if (LIVE_STATUSES.has(market.status) && actionWindow) {
    return {
      target: "creator_action_window",
      creatorActionWindowEndsAt: actionWindow,
      reason: "live_market_has_defined_creator_action_window"
    };
  }
  if (LIVE_STATUSES.has(market.status) && sourceRulesLocked(market)) {
    return {
      target: "ops_locked_live",
      creatorActionWindowEndsAt: null,
      reason: "live_market_rules_are_locked"
    };
  }
  if (sourceRulesLocked(market)) {
    return {
      target: "ops_settlement",
      creatorActionWindowEndsAt: null,
      reason: "launched_or_settlement_market_rules_are_locked"
    };
  }
  return {
    target: "none",
    creatorActionWindowEndsAt: null,
    reason: "no_source_health_alert_target"
  };
}

function creatorSourceIssueBody(input: {
  market: MarketSourceRow;
  result: Awaited<ReturnType<typeof checkMarketSourceHealth>>;
  routing: ReturnType<typeof routeSourceHealthAlert>;
}) {
  const base = `${input.market.title}: ${input.result.detail}`;
  if (input.routing.target === "creator_prelaunch") {
    return `${base} Before launch, update the source to a public machine-readable URL or let NexMind repair/downgrade the draft to evidence-based settlement.`;
  }
  if (input.routing.target === "creator_action_window") {
    return `${base} Limited action window ends ${input.routing.creatorActionWindowEndsAt?.toISOString()}. Open the market and add supporting evidence; locked rules cannot be changed.`;
  }
  return base;
}

async function sendOpsSourceHealthAlert(input: {
  market: MarketSourceRow;
  result: Awaited<ReturnType<typeof checkMarketSourceHealth>>;
  routing: ReturnType<typeof routeSourceHealthAlert>;
}) {
  const payload = {
    type: "source_health_ops_alert",
    target: input.routing.target,
    reason: input.routing.reason,
    marketId: input.market.id,
    marketTitle: input.market.title,
    status: input.market.status,
    sourceHealthStatus: input.result.status,
    sourceUrl: input.result.sourceUrl,
    httpStatus: input.result.httpStatus,
    detail: input.result.detail,
    staleReason: input.result.staleReason
  };
  const deliveries: Record<string, unknown> = {};
  const webhook = process.env.INTERNAL_ALERT_WEBHOOK_URL?.trim();
  if (webhook) {
    deliveries.webhook = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store"
    })
      .then((response) => ({ sent: response.ok, status: response.status }))
      .catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "webhook_failed" }));
  }
  const chatId = process.env.TELEGRAM_ALERT_DEFAULT_CHAT_ID?.trim();
  if (chatId) {
    deliveries.telegram = await sendTelegramBotMessage({
      chatId,
      text: [
        sourceAlertTitle({ result: input.result }),
        "",
        `${input.market.title}: ${input.result.detail}`,
        `Target: ${input.routing.target}`,
        `Reason: ${input.routing.reason}`
      ].join("\n")
    }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "telegram_failed" }));
  }
  await withDatabase(
    async (db) => {
      await db.analyticsEvent.create({
        data: {
          name: "source_health_ops_alert",
          metadata: jsonInput({ ...payload, deliveries })
        }
      });
      return true;
    },
    async () => false
  );
  return deliveries;
}

function normalizeHttpUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeBody(text: string) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const started = Date.now();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.SOURCE_MONITOR_TIMEOUT_MS || 15000));
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": "NexMarketsSourceMonitor/1.0"
      }
    });
    const body = await response.text();
    return {
      ok: response.ok,
      httpStatus: response.status,
      latencyMs: Date.now() - started,
      excerpt: normalizeBody(body).slice(0, 3000)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function statusFromFetch(input: { ok: boolean; httpStatus?: number | null; excerpt?: string | null }): SourceHealthStatus {
  if (!input.ok) {
    if (input.httpStatus === 404 || input.httpStatus === 410) return "broken";
    return "warning";
  }
  if (!input.excerpt || input.excerpt.length < 40) return "warning";
  return "healthy";
}

function detailFromFetch(input: { status: SourceHealthStatus; httpStatus?: number | null; excerpt?: string | null }) {
  if (input.status === "healthy") return "Source is reachable.";
  if (!input.httpStatus) return "Source fetch failed temporarily; the monitor will retry.";
  if (input.httpStatus === 401 || input.httpStatus === 403) {
    return `Source blocks automated access with HTTP ${input.httpStatus}. Use a public page or API endpoint that the monitor can read.`;
  }
  if (input.httpStatus === 451) {
    return "Source returned HTTP 451, so the provider is blocking this request for legal or regional reasons. Use a monitorable public source or API endpoint.";
  }
  if (input.httpStatus === 404 || input.httpStatus === 410) {
    return `Source returned HTTP ${input.httpStatus}; the locked URL appears unavailable.`;
  }
  if (input.httpStatus === 408 || input.httpStatus === 425 || input.httpStatus === 429) {
    return `Source returned HTTP ${input.httpStatus}; this looks temporary, so the monitor will retry.`;
  }
  if (input.httpStatus >= 500) {
    return `Source returned HTTP ${input.httpStatus}; the provider may be temporarily unavailable.`;
  }
  if (!input.excerpt || input.excerpt.length < 40) {
    return "Source responded with limited content; use a more specific public source URL if this warning persists.";
  }
  return `Source returned HTTP ${input.httpStatus}; review the locked URL.`;
}

function staleReasonFromFetch(input: { status: SourceHealthStatus; httpStatus?: number | null; excerpt?: string | null }) {
  if (input.status === "healthy") return null;
  if (input.httpStatus === 404 || input.httpStatus === 410) return "source_url_not_found";
  if (input.httpStatus === 401 || input.httpStatus === 403 || input.httpStatus === 451) return "source_blocks_monitor";
  if (input.httpStatus === 408 || input.httpStatus === 425 || input.httpStatus === 429 || (input.httpStatus ?? 0) >= 500) {
    return "temporary_source_fetch_issue";
  }
  if (!input.excerpt || input.excerpt.length < 40) return "limited_source_content";
  return "source_fetch_warning";
}

async function aiReview(input: {
  market: MarketSourceRow;
  sourceUrl: string;
  httpStatus: number | null;
  excerpt: string;
  status: SourceHealthStatus;
}) {
  if (!bankrAiReady() || !booleanFromEnv("BANKR_SOURCE_HEALTH_AI_REVIEW", true)) {
    return {
      status: input.status,
      detail: input.status === "healthy" ? "Source is reachable." : "Source monitor could not fully verify this source.",
      staleReason: null
    };
  }
  const response = await callBankrJson({
    feature: "nexmind_source_health",
    metadata: { marketId: input.market.id, sourceUrl: input.sourceUrl },
    messages: [
      {
        role: "system",
        content: "You review whether a market settlement source is healthy. Return JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({
          marketTitle: input.market.title,
          sourceUrl: input.sourceUrl,
          httpStatus: input.httpStatus,
          reachableStatus: input.status,
          sourceExcerpt: input.excerpt.slice(0, 1800),
          output: {
            status: "healthy | warning | broken",
            detail: "short detail",
            staleReason: "null or why the source appears stale/irrelevant"
          }
        })
      }
    ]
  });
  const value = asRecord(response.json);
  const status = value.status === "healthy" || value.status === "warning" || value.status === "broken"
    ? value.status
    : input.status;
  return {
    status,
    detail: typeof value.detail === "string" ? value.detail.slice(0, 500) : "Bankr reviewed the source.",
    staleReason: typeof value.staleReason === "string" ? value.staleReason.slice(0, 500) : null
  };
}

export async function checkMarketSourceHealth(market: MarketSourceRow) {
  const rawSourceUrl = market.sourceUrl?.trim() ?? null;
  const sourceUrl = normalizeHttpUrl(rawSourceUrl);
  const fallbackUrl = fallbackSourceUrl(market.routeDecision);
  if (!rawSourceUrl) {
    return {
      marketId: market.id,
      sourceUrl: rawSourceUrl,
      fallbackSourceUrl: fallbackUrl,
      status: "warning" as SourceHealthStatus,
      httpStatus: null,
      latencyMs: null,
      detail: "Market has no locked source URL. Add an exact public source URL for automated monitoring.",
      staleReason: "missing_source_url",
      metadata: {}
    };
  }
  if (!sourceUrl) {
    return {
      marketId: market.id,
      sourceUrl: rawSourceUrl,
      fallbackSourceUrl: fallbackUrl,
      status: "warning" as SourceHealthStatus,
      httpStatus: null,
      latencyMs: null,
      detail: `Locked source is not a URL: "${rawSourceUrl}". Replace it with the exact public source URL.`,
      staleReason: "invalid_source_url",
      metadata: {
        rawSourceUrl
      }
    };
  }

  try {
    const fetched = await fetchWithTimeout(sourceUrl);
    const firstStatus = statusFromFetch(fetched);
    const fallbackReview = {
      status: firstStatus,
      detail: detailFromFetch({ status: firstStatus, httpStatus: fetched.httpStatus, excerpt: fetched.excerpt }),
      staleReason: staleReasonFromFetch({ status: firstStatus, httpStatus: fetched.httpStatus, excerpt: fetched.excerpt })
    };
    const reviewed = firstStatus === "healthy"
      ? await aiReview({
        market,
        sourceUrl,
        httpStatus: fetched.httpStatus,
        excerpt: fetched.excerpt,
        status: firstStatus
      }).catch(() => ({
        ...fallbackReview,
        metadataWarning: "bankr_source_review_unavailable"
      }))
      : fallbackReview;
    return {
      marketId: market.id,
      sourceUrl,
      fallbackSourceUrl: fallbackUrl,
      status: reviewed.status,
      httpStatus: fetched.httpStatus,
      latencyMs: fetched.latencyMs,
      detail: reviewed.detail,
      staleReason: reviewed.staleReason,
      metadata: {
        excerptLength: fetched.excerpt.length,
        ...("metadataWarning" in reviewed ? { warning: reviewed.metadataWarning } : {})
      }
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Source fetch failed.";
    return {
      marketId: market.id,
      sourceUrl,
      fallbackSourceUrl: fallbackUrl,
      status: "warning" as SourceHealthStatus,
      httpStatus: null,
      latencyMs: null,
      detail: `Source fetch failed temporarily; the monitor will retry. ${detail}`,
      staleReason: "fetch_failed",
      metadata: {}
    };
  }
}

async function persistSourceHealth(input: Awaited<ReturnType<typeof checkMarketSourceHealth>>, previousStatus?: string | null) {
  await withDatabase(
    async (db) => {
      await db.sourceHealthCheck.create({
        data: {
          marketId: input.marketId,
          sourceUrl: input.sourceUrl ?? undefined,
          fallbackSourceUrl: input.fallbackSourceUrl ?? undefined,
          status: input.status,
          httpStatus: input.httpStatus ?? undefined,
          latencyMs: input.latencyMs ?? undefined,
          staleReason: input.staleReason ?? undefined,
          detail: input.detail.slice(0, 1000),
          metadata: jsonInput(input.metadata)
        }
      });
      await db.market.update({
        where: { id: input.marketId },
        data: {
          sourceHealthStatus: input.status,
          lastSourceCheckAt: new Date()
        }
      });
      return true;
    },
    async () => false
  );
  return previousStatus !== input.status;
}

export async function runSourceHealthJob(input: { limit?: number; force?: boolean } = {}) {
  if (!bankrFeatureEnabled("source_monitor") && !input.force) {
    return { ok: true, skipped: true, reason: "Bankr source monitor is disabled.", checked: [] };
  }
  const markets = await withDatabase(
    async (db) => db.market.findMany({
      where: {
        status: { in: ["draft", "route_check", "ready_to_launch", "live_pending_open", "trading_live", "closed", "result_proposed"] }
      },
      orderBy: [{ lastSourceCheckAt: "asc" }, { updatedAt: "desc" }],
      take: input.limit ?? 20,
      select: {
        id: true,
        title: true,
        status: true,
        sourceUrl: true,
        creatorUserId: true,
        creatorWallet: true,
        sourceHealthStatus: true,
        rulesHash: true,
        metadataHash: true,
        resolutionCard: true,
        challengeWindowEndsAt: true,
        routeDecision: true
      }
    }),
    async () => []
  );

  const checked = [];
  for (const market of markets) {
    const result = await checkMarketSourceHealth(market);
    const changed = await persistSourceHealth(result, market.sourceHealthStatus);
    if (changed && (result.status === "warning" || result.status === "broken")) {
      const routing = routeSourceHealthAlert(market);
      if (routing.target === "creator_prelaunch" || routing.target === "creator_action_window") {
        await createCreatorNotification({
          userId: market.creatorUserId,
          walletAddress: market.creatorWallet,
          marketId: market.id,
          type: "source_issue",
          title: sourceAlertTitle({ result }),
          body: creatorSourceIssueBody({ market, result, routing }),
          metadata: {
            ...result,
            alertTarget: routing.target,
            alertReason: routing.reason,
            creatorActionWindowEndsAt: routing.creatorActionWindowEndsAt?.toISOString() ?? null
          }
        });
      } else if (routing.target === "ops_locked_live" || routing.target === "ops_settlement") {
        await sendOpsSourceHealthAlert({ market, result, routing });
      }
    }
    checked.push(result);
  }

  return { ok: true, skipped: false, checked };
}

export async function listSourceHealth(marketId: string, limit = 10) {
  return withDatabase(
    async (db) => {
      const rows = await db.sourceHealthCheck.findMany({
        where: { marketId },
        orderBy: { createdAt: "desc" },
        take: limit
      });
      return rows.map((row) => ({
        id: row.id,
        marketId: row.marketId,
        sourceUrl: row.sourceUrl,
        fallbackSourceUrl: row.fallbackSourceUrl,
        status: row.status,
        httpStatus: row.httpStatus,
        latencyMs: row.latencyMs,
        staleReason: row.staleReason,
        detail: row.detail,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString()
      }));
    },
    async () => []
  );
}
