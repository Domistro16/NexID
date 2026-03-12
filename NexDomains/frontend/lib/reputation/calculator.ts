import { SLASH_AMOUNTS, TIERS } from "./constants";
import type { GoPlusRiskResult, ReputationResult } from "./types";

export function calculateReputation(
  address: string,
  riskData: GoPlusRiskResult
): ReputationResult {
  let score = 100;
  const flags: string[] = [];
  const breakdown: Record<string, number> = {};

  // Apply slashes for each risk flag
  for (const [flag, slashAmount] of Object.entries(SLASH_AMOUNTS)) {
    const flagValue = riskData[flag as keyof GoPlusRiskResult];

    if (flagValue === "1") {
      score -= slashAmount;
      flags.push(flag);
      breakdown[flag] = -slashAmount;
    }
  }

  // Ensure score stays within bounds
  score = Math.max(0, Math.min(100, score));

  // Determine tier
  const tier = getTier(score);

  return {
    address: address.toLowerCase(),
    score,
    tier,
    flags,
    breakdown,
    checkedAt: new Date().toISOString(),
    isClean: flags.length === 0,
  };
}

function getTier(score: number): "Platinum" | "Gold" | "Silver" | "Bronze" {
  if (score >= TIERS.PLATINUM.min) return "Platinum";
  if (score >= TIERS.GOLD.min) return "Gold";
  if (score >= TIERS.SILVER.min) return "Silver";
  return "Bronze";
}
