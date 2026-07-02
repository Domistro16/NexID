import { randomUUID } from "crypto";
import { assertBankrDailyBudget, logBankrAiRequest } from "@/lib/services/bankr/bankrUsageLogService";
import { bankrLlmConfig, bankrModelCandidates, nexMindInferenceProvider, virtualsNexMindConfig, type BankrAiFeature } from "@/lib/services/bankr/bankrConfig";
import { callVirtualsNexMindChat, virtualsNexMindReady } from "@/lib/services/virtuals/virtualsNexMindAiService";

export type BankrChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type BankrCompletionResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

export class BankrAiError extends Error {
  statusCode?: number;
  code?: string;
  retryable: boolean;

  constructor(message: string, input: { statusCode?: number; code?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = "BankrAiError";
    this.statusCode = input.statusCode;
    this.code = input.code;
    this.retryable = input.retryable ?? false;
  }
}

function retryableStatus(status: number) {
  return status === 402 || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as unknown;
    throw new Error("Bankr returned non-JSON output.");
  }
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as BankrCompletionResponse;
  } catch {
    return { error: { message: text.slice(0, 1000), type: "non_json_error" } } satisfies BankrCompletionResponse;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new BankrAiError("Bankr LLM request timed out.", { code: "timeout", retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callModel(input: {
  model: string;
  messages: BankrChatMessage[];
  feature: BankrAiFeature;
  userId?: string | null;
  walletAddress?: string | null;
  agentId?: string | null;
  metadata?: unknown;
  responseFormat?: "json" | "text";
}) {
  const config = bankrLlmConfig();
  if (!config.enabled || !config.apiKey) {
    throw new BankrAiError("Bankr LLM Gateway is not configured.", { code: "bankr_not_configured" });
  }

  const requestId = randomUUID();
  const started = Date.now();
  const response = await fetchWithTimeout(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
      "Authorization": `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      ...(input.responseFormat === "json" ? { response_format: { type: "json_object" } } : {})
    }),
    cache: "no-store"
  }, config.timeoutMs);
  const payload = await readResponse(response);
  const durationMs = Date.now() - started;
  const usage = payload.usage ?? {};

  if (!response.ok) {
    const message = payload.error?.message || `Bankr LLM request failed with HTTP ${response.status}`;
    await logBankrAiRequest({
      requestId,
      feature: input.feature,
      userId: input.userId,
      walletAddress: input.walletAddress,
      agentId: input.agentId,
      model: input.model,
      status: "error",
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      durationMs,
      errorCode: payload.error?.code || payload.error?.type || String(response.status),
      errorMessage: message,
      metadata: input.metadata
    });
    throw new BankrAiError(message, {
      statusCode: response.status,
      code: payload.error?.code || payload.error?.type || String(response.status),
      retryable: retryableStatus(response.status)
    });
  }

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    await logBankrAiRequest({
      requestId,
      feature: input.feature,
      userId: input.userId,
      walletAddress: input.walletAddress,
      agentId: input.agentId,
      model: input.model,
      status: "error",
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      durationMs,
      errorCode: "empty_response",
      errorMessage: "Bankr LLM returned an empty response.",
      metadata: input.metadata
    });
    throw new BankrAiError("Bankr LLM returned an empty response.", { code: "empty_response", retryable: true });
  }

  await logBankrAiRequest({
    requestId,
    feature: input.feature,
    userId: input.userId,
    walletAddress: input.walletAddress,
    agentId: input.agentId,
    model: input.model,
    status: "success",
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    durationMs,
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {}),
      bankrResponseId: payload.id ?? null,
      finishReason: payload.choices?.[0]?.finish_reason ?? null
    }
  });

  return {
    requestId,
    provider: "bankr" as const,
    model: payload.model ?? input.model,
    content,
    usage
  };
}

export async function callBankrChat(input: {
  feature: BankrAiFeature;
  messages: BankrChatMessage[];
  userId?: string | null;
  walletAddress?: string | null;
  agentId?: string | null;
  metadata?: unknown;
  responseFormat?: "json" | "text";
  skipVirtuals?: boolean;
}) {
  const provider = nexMindInferenceProvider();
  const virtualsConfig = virtualsNexMindConfig();
  const shouldTryVirtuals = !input.skipVirtuals &&
    virtualsNexMindReady() &&
    provider !== "bankr" &&
    provider !== "gemini" &&
    provider !== "gemini_direct";
  let virtualsError: unknown;

  if (shouldTryVirtuals) {
    try {
      return await callVirtualsNexMindChat(input);
    } catch (error) {
      virtualsError = error;
      if (provider === "virtuals_only" || virtualsConfig.strictMode) throw error;
      console.warn("Virtuals NexMind unavailable; falling back to Gemini gateway.", error);
    }
  }

  if (provider === "virtuals_only") {
    throw virtualsError instanceof Error ? virtualsError : new BankrAiError("Virtuals NexMind inference is not available.");
  }

  const models = bankrModelCandidates();
  await assertBankrDailyBudget();
  let lastError: unknown;

  for (const model of models) {
    try {
      return await callModel({ ...input, model });
    } catch (error) {
      lastError = error;
      if (!(error instanceof BankrAiError) || !error.retryable) break;
    }
  }

  throw lastError instanceof Error ? lastError : new BankrAiError("Bankr LLM request failed.");
}

export async function callBankrJson(input: {
  feature: BankrAiFeature;
  messages: BankrChatMessage[];
  userId?: string | null;
  walletAddress?: string | null;
  agentId?: string | null;
  metadata?: unknown;
}) {
  const response = await callBankrChat({ ...input, responseFormat: "json" });
  try {
    return {
      ...response,
      json: parseJsonObject(response.content)
    };
  } catch (error) {
    if (response.provider !== "virtuals" || nexMindInferenceProvider() === "virtuals_only" || virtualsNexMindConfig().strictMode) {
      throw error;
    }
    console.warn("Virtuals NexMind returned non-JSON output; falling back to Gemini gateway.", error);
  }
  const fallback = await callBankrChat({ ...input, responseFormat: "json", skipVirtuals: true });
  return {
    ...fallback,
    json: parseJsonObject(fallback.content)
  };
}

export function bankrAiReady() {
  return virtualsNexMindReady() || bankrLlmConfig().enabled;
}
