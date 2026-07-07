import { randomUUID } from "crypto";
import { virtualsNexMindConfig, virtualsNexMindModelCandidates, type BankrAiFeature } from "@/lib/services/bankr/bankrConfig";
import { logBankrAiRequest } from "@/lib/services/bankr/bankrUsageLogService";

export type VirtualsChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type VirtualsCompletionResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
    text?: string | null;
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  content?: string;
  message?: string;
  response?: string;
  output_text?: string;
  data?: unknown;
  output?: unknown;
  statusCode?: number;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  } | string;
};

export class VirtualsNexMindError extends Error {
  statusCode?: number;
  code?: string;
  retryable: boolean;

  constructor(message: string, input: { statusCode?: number; code?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = "VirtualsNexMindError";
    this.statusCode = input.statusCode;
    this.code = input.code;
    this.retryable = input.retryable ?? false;
  }
}

function retryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function cleanError(payload: VirtualsCompletionResponse) {
  if (payload.message && payload.error) return payload.message;
  const error = payload.error;
  if (!error) return payload.message || null;
  if (typeof error === "string") return error;
  return error.message || error.code || error.type || null;
}

function extractText(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractText(item);
      if (text) return text;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of ["content", "text", "message", "response", "output_text"]) {
    const text = extractText(record[key]);
    if (text) return text;
  }

  const nested = extractText(record.data) ?? extractText(record.output);
  if (nested) return nested;
  return null;
}

function responseContent(payload: VirtualsCompletionResponse) {
  const choiceContent = payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? null;
  const text = extractText(choiceContent) ??
    extractText(payload.content) ??
    extractText(payload.message) ??
    extractText(payload.response) ??
    extractText(payload.output_text) ??
    extractText(payload.data) ??
    extractText(payload.output);
  if (text) return text;

  if (payload.data && typeof payload.data === "object") return JSON.stringify(payload.data);
  if (payload.output && typeof payload.output === "object") return JSON.stringify(payload.output);
  return null;
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as VirtualsCompletionResponse;
  } catch {
    return { error: { message: text.slice(0, 1000), type: "non_json_error" } } satisfies VirtualsCompletionResponse;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new VirtualsNexMindError("Virtuals NexMind request timed out.", { code: "timeout", retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callVirtualsNexMindChat(input: {
  feature: BankrAiFeature;
  messages: VirtualsChatMessage[];
  userId?: string | null;
  walletAddress?: string | null;
  agentId?: string | null;
  metadata?: unknown;
  responseFormat?: "json" | "text";
}) {
  const config = virtualsNexMindConfig();
  if (!config.enabled) {
    throw new VirtualsNexMindError("Virtuals NexMind inference is not configured.", { code: "virtuals_not_configured" });
  }

  const requestId = randomUUID();
  const started = Date.now();
  const url = `${config.baseUrl}${config.path}`;
  const modelCandidates = virtualsNexMindModelCandidates();
  const candidates = modelCandidates.length ? modelCandidates : [""];
  let lastError: VirtualsNexMindError | null = null;
  let response: Response | null = null;
  let payload: VirtualsCompletionResponse = {};
  let content: string | null = null;
  let modelForLog = config.model || "virtuals-nexmind";

  for (const model of candidates) {
    const candidateStarted = Date.now();
    modelForLog = model || "virtuals-nexmind";
    response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
        "X-API-Key": config.apiKey
      },
      body: JSON.stringify({
        ...(model ? { model } : {}),
        ...(config.agentId ? { agent_id: config.agentId } : {}),
        messages: input.messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        ...(input.responseFormat === "json" ? { response_format: { type: "json_object" } } : {})
      }),
      cache: "no-store"
    }, config.timeoutMs);
    payload = await readResponse(response);
    const usage = payload.usage ?? {};
    const durationMs = Date.now() - candidateStarted;

    if (!response.ok) {
      const code = typeof payload.error === "object" ? payload.error?.code || payload.error?.type || String(response.status) : String(response.status);
      const message = cleanError(payload) || `Virtuals NexMind request failed with HTTP ${response.status}`;
      await logBankrAiRequest({
        requestId,
        feature: input.feature,
        userId: input.userId,
        walletAddress: input.walletAddress,
        agentId: input.agentId,
        provider: "virtuals",
        model: modelForLog,
        status: "error",
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        durationMs,
        errorCode: code,
        errorMessage: message,
        metadata: input.metadata
      });
      lastError = new VirtualsNexMindError(message, {
        statusCode: response.status,
        code,
        retryable: retryableStatus(response.status)
      });
      if (!lastError.retryable) throw lastError;
      continue;
    }

    content = responseContent(payload);
    if (content) break;

    await logBankrAiRequest({
      requestId,
      feature: input.feature,
      userId: input.userId,
      walletAddress: input.walletAddress,
      agentId: input.agentId,
      provider: "virtuals",
      model: modelForLog,
      status: "error",
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      durationMs,
      errorCode: "empty_response",
      errorMessage: "Virtuals NexMind returned an empty response.",
      metadata: input.metadata
    });
    lastError = new VirtualsNexMindError("Virtuals NexMind returned an empty response.", { code: "empty_response", retryable: true });
  }

  if (!response || !content) {
    throw lastError ?? new VirtualsNexMindError("Virtuals NexMind request failed.");
  }

  const durationMs = Date.now() - started;
  const usage = payload.usage ?? {};

  await logBankrAiRequest({
    requestId,
    feature: input.feature,
    userId: input.userId,
    walletAddress: input.walletAddress,
    agentId: input.agentId,
    provider: "virtuals",
    model: (payload.model ?? modelForLog) || "virtuals-nexmind",
    status: "success",
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    durationMs,
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {}),
      virtualsResponseId: payload.id ?? null,
      finishReason: payload.choices?.[0]?.finish_reason ?? null
    }
  });

  return {
    requestId,
    provider: "virtuals" as const,
    model: (payload.model ?? modelForLog) || "virtuals-nexmind",
    content,
    usage
  };
}

export function virtualsNexMindReady() {
  return virtualsNexMindConfig().enabled;
}
