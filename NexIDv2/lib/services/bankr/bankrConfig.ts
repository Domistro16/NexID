export type BankrAiFeature =
  | "nexmind_draft_market"
  | "nexmind_route_market"
  | "nexmind_trending_thesis"
  | "nexmind_source_health"
  | "nexmind_notification"
  | "agent_market";

function cleanUrl(value: string | undefined, fallback: string) {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed || fallback;
}

function csv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function booleanFromEnv(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

export function bankrLlmConfig() {
  const apiKey = process.env.BANKR_LLM_API_KEY?.trim() || process.env.BANKR_API_KEY?.trim() || "";
  const primaryModel =
    process.env.BANKR_NEXMIND_MODEL?.trim() ||
    process.env.GEMINI_MARKET_COMPOSER_MODEL?.trim().replace(/^"|"$/g, "") ||
    "gemini-2.5-flash";
  return {
    enabled: Boolean(apiKey) && process.env.MARKET_COMPOSER_ENABLED !== "false",
    baseUrl: cleanUrl(process.env.BANKR_LLM_BASE_URL, "https://llm.bankr.bot"),
    apiKey,
    primaryModel,
    fallbackModels: csv(process.env.BANKR_NEXMIND_FALLBACK_MODELS),
    timeoutMs: numberFromEnv("BANKR_REQUEST_TIMEOUT_MS", 45000),
    maxTokens: numberFromEnv("BANKR_NEXMIND_MAX_TOKENS", 1600),
    temperature: Number.isFinite(Number(process.env.BANKR_NEXMIND_TEMPERATURE))
      ? Number(process.env.BANKR_NEXMIND_TEMPERATURE)
      : 0.2
  };
}

export function bankrAgentConfig() {
  return {
    enabled: booleanFromEnv("BANKR_ENABLE_AGENT_MARKETS", false),
    baseUrl: cleanUrl(process.env.BANKR_AGENT_API_BASE_URL, "https://api.bankr.bot"),
    apiKey: process.env.BANKR_AGENT_API_KEY?.trim() || process.env.BANKR_API_KEY?.trim() || "",
    defaultThreadId: process.env.BANKR_AGENT_DEFAULT_THREAD_ID?.trim() || null,
    pollIntervalMs: numberFromEnv("BANKR_AGENT_POLL_INTERVAL_MS", 1500),
    pollTimeoutMs: numberFromEnv("BANKR_AGENT_POLL_TIMEOUT_MS", 30000)
  };
}

export function bankrFeatureEnabled(name: "trending" | "source_monitor" | "notifications") {
  if (name === "trending") return booleanFromEnv("BANKR_ENABLE_TRENDING", true);
  if (name === "source_monitor") return booleanFromEnv("BANKR_ENABLE_SOURCE_MONITOR", true);
  return booleanFromEnv("BANKR_ENABLE_NOTIFICATIONS", true);
}

export function bankrModelCandidates() {
  const config = bankrLlmConfig();
  return Array.from(new Set([config.primaryModel, ...config.fallbackModels].filter(Boolean)));
}

export function bankrDailyBudgetUsd() {
  return numberFromEnv("BANKR_DAILY_LLM_BUDGET_USD", 25);
}

export function bankrRateLimitPerMinute() {
  return numberFromEnv("BANKR_NEXMIND_RATE_LIMIT_PER_MINUTE", 20);
}

export function bankrTrendingSeedTopics() {
  const configured = csv(process.env.BANKR_TRENDING_SEED_TOPICS);
  return configured.length ? configured : ["crypto", "base", "sports", "football", "culture"];
}
