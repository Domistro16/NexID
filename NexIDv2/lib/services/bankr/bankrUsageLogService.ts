import { withDatabase } from "@/lib/server/db";
import { bankrDailyBudgetUsd } from "@/lib/services/bankr/bankrConfig";
import type { BankrAiFeature } from "@/lib/services/bankr/bankrConfig";

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function startOfUtcDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function logBankrAiRequest(input: {
  requestId?: string | null;
  feature: BankrAiFeature;
  userId?: string | null;
  walletAddress?: string | null;
  agentId?: string | null;
  model: string;
  fallbackModel?: string | null;
  status: "success" | "error" | "skipped";
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  durationMs?: number | null;
  estimatedCostUsd?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: unknown;
}) {
  return withDatabase(
    async (db) => {
      await db.bankrAiRequestLog.create({
        data: {
          requestId: input.requestId ?? undefined,
          feature: input.feature,
          userId: input.userId ?? undefined,
          walletAddress: input.walletAddress ?? undefined,
          agentId: input.agentId ?? undefined,
          model: input.model,
          fallbackModel: input.fallbackModel ?? undefined,
          status: input.status,
          promptTokens: input.promptTokens ?? undefined,
          completionTokens: input.completionTokens ?? undefined,
          totalTokens: input.totalTokens ?? undefined,
          durationMs: input.durationMs ?? undefined,
          estimatedCostUsd: input.estimatedCostUsd ?? undefined,
          errorCode: input.errorCode ?? undefined,
          errorMessage: input.errorMessage?.slice(0, 1000) ?? undefined,
          metadata: input.metadata === undefined ? undefined : jsonInput(input.metadata)
        }
      });
      return true;
    },
    async () => false
  );
}

export async function assertBankrDailyBudget() {
  const budget = bankrDailyBudgetUsd();
  if (!Number.isFinite(budget) || budget <= 0) return;
  const used = await withDatabase(
    async (db) => {
      const aggregate = await db.bankrAiRequestLog.aggregate({
        where: {
          provider: "bankr",
          createdAt: { gte: startOfUtcDay() }
        },
        _sum: { estimatedCostUsd: true }
      });
      return aggregate._sum.estimatedCostUsd ?? 0;
    },
    async () => 0
  );
  if (used >= budget) {
    throw new Error(`Bankr daily LLM budget reached (${used.toFixed(2)} / ${budget.toFixed(2)} USD).`);
  }
}
