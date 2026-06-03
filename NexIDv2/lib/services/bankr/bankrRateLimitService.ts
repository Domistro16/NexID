import { bankrRateLimitPerMinute } from "@/lib/services/bankr/bankrConfig";

type Bucket = {
  count: number;
  resetsAt: number;
};

const buckets = new Map<string, Bucket>();

function bucketKey(input: { feature: string; actor: string }) {
  return `${input.feature}:${input.actor.toLowerCase()}`;
}

export function assertBankrRateLimit(input: {
  feature: string;
  actor?: string | null;
  limit?: number;
  windowMs?: number;
}) {
  const actor = input.actor?.trim() || "anonymous";
  const key = bucketKey({ feature: input.feature, actor });
  const now = Date.now();
  const limit = input.limit ?? bankrRateLimitPerMinute();
  const windowMs = input.windowMs ?? 60_000;
  const current = buckets.get(key);

  if (!current || current.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    const seconds = Math.max(1, Math.ceil((current.resetsAt - now) / 1000));
    throw new Error(`NexMind rate limit reached. Try again in ${seconds}s.`);
  }

  current.count += 1;
}
