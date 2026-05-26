export function detectReferralRisk(input: { referrer?: string; referred?: string }) {
  if (input.referrer && input.referred && input.referrer.toLowerCase() === input.referred.toLowerCase()) {
    return "Self-referral";
  }
  return null;
}

export type PositionRiskInput = {
  amount: number;
  returnPct?: number;
  marketQualityScore?: number | null;
  proofLevel?: string | null;
  repeatNarrativeCount?: number;
  executionMode?: string | null;
};

export function detectPositionRiskSignals(input: PositionRiskInput) {
  const signals: string[] = [];
  if (input.amount < 5) signals.push("Dust position");
  if ((input.marketQualityScore ?? 0) < 45) signals.push("Low market quality");
  if ((input.repeatNarrativeCount ?? 0) >= 5) signals.push("Repeated same-narrative activity");
  if ((input.returnPct ?? 0) > 350 && (input.marketQualityScore ?? 0) < 65) signals.push("Outlier return on weak market");
  if (!input.proofLevel || input.proofLevel === "Stated") signals.push("Weak proof");
  if (input.executionMode === "operator_controlled") signals.push("Controlled-launch custody");
  return signals;
}

export function antiGamingPenalty(input: PositionRiskInput) {
  const signals = detectPositionRiskSignals(input);
  const penalty = signals.reduce((sum, signal) => {
    if (signal === "Controlled-launch custody") return sum + 6;
    if (signal === "Dust position") return sum + 8;
    if (signal === "Weak proof") return sum + 12;
    return sum + 10;
  }, 0);
  return {
    signals,
    penalty: Math.min(45, penalty)
  };
}
