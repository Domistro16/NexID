import { createHash } from "crypto";

export type ProofFlowOutcome = "ride" | "fade" | "invalid";

export type EvidenceTimestampFailureCode =
  | "missing_timestamp"
  | "malformed_timestamp"
  | "before_market_creation"
  | "after_market_close"
  | "after_resolution_deadline"
  | "before_source_window"
  | "after_source_window";

export type EvidenceTimestampValidation = {
  valid: boolean;
  timestamp: string | null;
  failures: Array<{ code: EvidenceTimestampFailureCode; message: string }>;
};

export type MaterialEvidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export type MaterialEvidenceScore = {
  level: MaterialEvidenceLevel;
  score: number;
  reasons: string[];
};

export type CountdownParts = {
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
  label: string;
};

function dateFrom(value?: string | Date | null) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

export function hashReviewerNoteCommit(input: { noteText: string; nonce: string }) {
  return createHash("sha256")
    .update(`${normalizeText(input.noteText)}${normalizeText(input.nonce)}`)
    .digest("hex");
}

export function validProofFlowHash(value?: string | null) {
  return Boolean(value && /^[a-fA-F0-9]{64}$/.test(value.replace(/^0x/, "")));
}

export function validateReviewerNoteReveal(input: { noteText: string; nonce: string; noteHash: string }) {
  const expected = input.noteHash.replace(/^0x/, "").toLowerCase();
  return validProofFlowHash(expected) && hashReviewerNoteCommit(input).toLowerCase() === expected;
}

export function validateEvidenceTimestamp(input: {
  evidenceTimestamp?: string | Date | null;
  marketOpenTime?: string | Date | null;
  marketCloseTime?: string | Date | null;
  resolutionDeadline?: string | Date | null;
  sourceWindowStart?: string | Date | null;
  sourceWindowEnd?: string | Date | null;
}): EvidenceTimestampValidation {
  const failures: EvidenceTimestampValidation["failures"] = [];
  const evidenceTimestamp = dateFrom(input.evidenceTimestamp);
  const rawTimestamp = input.evidenceTimestamp instanceof Date
    ? input.evidenceTimestamp.toISOString()
    : typeof input.evidenceTimestamp === "string"
      ? input.evidenceTimestamp
      : null;

  if (!rawTimestamp) {
    failures.push({ code: "missing_timestamp", message: "Evidence timestamp is required." });
    return { valid: false, timestamp: null, failures };
  }
  if (!evidenceTimestamp) {
    failures.push({ code: "malformed_timestamp", message: "Evidence timestamp is malformed." });
    return { valid: false, timestamp: null, failures };
  }

  const marketOpenTime = dateFrom(input.marketOpenTime);
  const marketCloseTime = dateFrom(input.marketCloseTime);
  const resolutionDeadline = dateFrom(input.resolutionDeadline);
  const sourceWindowStart = dateFrom(input.sourceWindowStart);
  const sourceWindowEnd = dateFrom(input.sourceWindowEnd);

  if (marketOpenTime && evidenceTimestamp < marketOpenTime) {
    failures.push({ code: "before_market_creation", message: "Evidence was published before market creation." });
  }
  void marketCloseTime;
  if (resolutionDeadline && evidenceTimestamp > resolutionDeadline) {
    failures.push({ code: "after_resolution_deadline", message: "Evidence was published after the resolution deadline." });
  }
  if (sourceWindowStart && evidenceTimestamp < sourceWindowStart) {
    failures.push({ code: "before_source_window", message: "Evidence timestamp is before the source validity window." });
  }
  if (sourceWindowEnd && evidenceTimestamp > sourceWindowEnd) {
    failures.push({ code: "after_source_window", message: "Evidence timestamp is after the source validity window." });
  }

  return {
    valid: failures.length === 0,
    timestamp: evidenceTimestamp.toISOString(),
    failures
  };
}

function urlHost(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function sourceCredibility(sourceUrl?: string | null) {
  const host = urlHost(sourceUrl);
  if (!host) return 0;
  if (/\b(gov|edu)$/.test(host) || host.includes("coingecko") || host.includes("uefa") || host.includes("fifa")) return 3;
  if (host.includes("api.") || host.includes("official") || host.includes("binance")) return 2;
  return 1;
}

export function isMaterialEvidenceChange(input: {
  previousEvidence?: {
    outcome?: ProofFlowOutcome | null;
    sourceUrl?: string | null;
    evidenceText?: string | null;
    evidenceTimestamp?: string | Date | null;
  } | null;
  newEvidence: {
    outcome?: ProofFlowOutcome | null;
    sourceUrl?: string | null;
    evidenceText?: string | null;
    evidenceTimestamp?: string | Date | null;
  };
  marketCloseTime?: string | Date | null;
  resolutionDeadline?: string | Date | null;
}): MaterialEvidenceScore {
  const reasons: string[] = [];
  let score = 0;
  const previous = input.previousEvidence;
  const next = input.newEvidence;

  if (!previous) {
    return { level: "LOW", score: 0, reasons: ["No previous evidence to compare."] };
  }
  if (previous.outcome && next.outcome && previous.outcome !== next.outcome) {
    score += 45;
    reasons.push("New evidence supports a different outcome.");
  }
  if (urlHost(previous.sourceUrl) && urlHost(next.sourceUrl) && urlHost(previous.sourceUrl) !== urlHost(next.sourceUrl)) {
    score += 15;
    reasons.push("New evidence uses a different source.");
  }
  score += sourceCredibility(next.sourceUrl) * 8;
  if (normalizeText(next.evidenceText).length > normalizeText(previous.evidenceText).length + 80) {
    score += 10;
    reasons.push("New evidence adds substantial new detail.");
  }
  const timestampCheck = validateEvidenceTimestamp({
    evidenceTimestamp: next.evidenceTimestamp,
    marketOpenTime: null,
    marketCloseTime: input.marketCloseTime,
    resolutionDeadline: input.resolutionDeadline
  });
  if (!timestampCheck.valid) {
    score += 20;
    reasons.push(...timestampCheck.failures.map((failure) => failure.message));
  } else if (timestampCheck.timestamp) {
    score += 8;
    reasons.push("New evidence has a usable timestamp.");
  }

  const level: MaterialEvidenceLevel = score >= 70 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW";
  return { level, score, reasons: reasons.length ? reasons : ["Change is not outcome-material."] };
}

export function formatCountdownParts(target?: string | Date | null, now: Date = new Date()): CountdownParts {
  const targetDate = dateFrom(target);
  const totalSeconds = Math.max(0, Math.floor(((targetDate?.getTime() ?? now.getTime()) - now.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    totalSeconds,
    hours,
    minutes,
    seconds,
    label: `${hours}h ${minutes}m ${seconds}s`
  };
}

export function hashSettlementReceiptPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
