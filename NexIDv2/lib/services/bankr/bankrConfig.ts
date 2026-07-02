export type BankrAiFeature =
  | "nexmind_draft_market"
  | "nexmind_route_market"
  | "nexmind_trending_thesis"
  | "nexmind_source_health"
  | "nexmind_notification"
  | "proofflow_audit"
  | "agent_market";

function cleanEnvValue(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function cleanUrl(value: string | undefined, fallback: string) {
  const trimmed = cleanEnvValue(value).replace(/\/+$/, "");
  return trimmed || fallback;
}

function csv(value: string | undefined) {
  return cleanEnvValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanApiPath(value: string | undefined, fallback: string, baseUrl: string) {
  const raw = cleanEnvValue(value) || fallback;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (baseUrl.endsWith("/v1") && path.startsWith("/v1/")) return path.slice(3);
  return path;
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
  const apiKey = cleanEnvValue(process.env.BANKR_LLM_API_KEY) || cleanEnvValue(process.env.BANKR_API_KEY);
  const primaryModel =
    cleanEnvValue(process.env.BANKR_NEXMIND_MODEL) ||
    cleanEnvValue(process.env.GEMINI_MARKET_COMPOSER_MODEL) ||
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

export function nexMindInferenceProvider() {
  const explicit = cleanEnvValue(process.env.NEXMIND_INFERENCE_PROVIDER).toLowerCase();
  const composerProvider = cleanEnvValue(process.env.MARKET_COMPOSER_PROVIDER).toLowerCase();
  const value = explicit || (composerProvider === "gemini_direct" ? "gemini_direct" : "auto");
  if (["virtuals", "virtuals_only", "bankr", "gemini", "gemini_direct", "auto"].includes(value)) return value;
  return "auto";
}

export function virtualsNexMindConfig() {
  const apiKey = cleanEnvValue(process.env.VIRTUALS_NEXMIND_API_KEY) || cleanEnvValue(process.env.VIRTUALS_API_KEY);
  const agentId = cleanEnvValue(process.env.VIRTUALS_NEXMIND_AGENT_ID) || cleanEnvValue(process.env.VIRTUALS_AGENT_ID);
  const baseUrl = cleanUrl(process.env.VIRTUALS_NEXMIND_BASE_URL || process.env.VIRTUALS_API_BASE_URL, "");
  return {
    enabled: booleanFromEnv("VIRTUALS_NEXMIND_ENABLED", Boolean(apiKey && baseUrl)) && Boolean(apiKey && baseUrl),
    baseUrl,
    apiKey,
    agentId,
    path: cleanApiPath(process.env.VIRTUALS_NEXMIND_CHAT_PATH, "/v1/chat/completions", baseUrl),
    model: cleanEnvValue(process.env.VIRTUALS_NEXMIND_MODEL) || agentId,
    timeoutMs: numberFromEnv("VIRTUALS_NEXMIND_TIMEOUT_MS", numberFromEnv("BANKR_REQUEST_TIMEOUT_MS", 45000)),
    maxTokens: numberFromEnv("VIRTUALS_NEXMIND_MAX_TOKENS", numberFromEnv("BANKR_NEXMIND_MAX_TOKENS", 1600)),
    temperature: Number.isFinite(Number(process.env.VIRTUALS_NEXMIND_TEMPERATURE))
      ? Number(process.env.VIRTUALS_NEXMIND_TEMPERATURE)
      : Number.isFinite(Number(process.env.BANKR_NEXMIND_TEMPERATURE))
        ? Number(process.env.BANKR_NEXMIND_TEMPERATURE)
        : 0.2,
    strictMode: booleanFromEnv("VIRTUALS_NEXMIND_STRICT_MODE", false)
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
