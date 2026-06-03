import { bankrAgentConfig } from "@/lib/services/bankr/bankrConfig";

type BankrAgentSubmitResponse = {
  success?: boolean;
  jobId?: string;
  threadId?: string;
  status?: string;
  message?: string;
  error?: string;
};

type BankrAgentJobResponse = {
  success?: boolean;
  jobId?: string;
  status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
  prompt?: string;
  response?: string;
  createdAt?: string;
  completedAt?: string;
  processingTime?: number;
  error?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bankrAgentFetch(path: string, init: RequestInit = {}) {
  const config = bankrAgentConfig();
  if (!config.apiKey) throw new Error("BANKR_AGENT_API_KEY is not configured.");
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.error === "string"
      ? body.error
      : typeof body.message === "string"
        ? body.message
        : `Bankr Agent API failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

export async function submitBankrAgentPrompt(input: { prompt: string; threadId?: string | null }) {
  const config = bankrAgentConfig();
  const body = await bankrAgentFetch("/agent/prompt", {
    method: "POST",
    body: JSON.stringify({
      prompt: input.prompt,
      ...(input.threadId ?? config.defaultThreadId ? { threadId: input.threadId ?? config.defaultThreadId } : {})
    })
  }) as BankrAgentSubmitResponse;
  if (!body.jobId) throw new Error(body.message || "Bankr Agent API did not return a job id.");
  return {
    jobId: body.jobId,
    threadId: body.threadId ?? input.threadId ?? config.defaultThreadId,
    status: body.status ?? "pending",
    message: body.message ?? null
  };
}

export async function getBankrAgentJob(jobId: string) {
  return bankrAgentFetch(`/agent/job/${encodeURIComponent(jobId)}`) as Promise<BankrAgentJobResponse>;
}

export async function runBankrAgentPrompt(input: { prompt: string; threadId?: string | null }) {
  const config = bankrAgentConfig();
  const submitted = await submitBankrAgentPrompt(input);
  const deadline = Date.now() + config.pollTimeoutMs;

  while (Date.now() < deadline) {
    const job = await getBankrAgentJob(submitted.jobId);
    if (job.status === "completed") {
      return {
        ...submitted,
        status: job.status,
        response: job.response ?? "",
        processingTime: job.processingTime ?? null
      };
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(job.error || `Bankr Agent job ${job.status}.`);
    }
    await sleep(config.pollIntervalMs);
  }

  throw new Error("Bankr Agent job timed out before completion.");
}
