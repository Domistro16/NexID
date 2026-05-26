import type { Narrative } from "@/lib/types/nexid";

export function assertNarrativeTradable(narrative: Narrative & { tradable?: boolean; fallbackReason?: string | null }) {
  if (narrative.tradable === false) {
    throw new Error(narrative.fallbackReason || "No clean position available yet. Watch this narrative.");
  }
}

export function chainEligibility(chainId?: number) {
  if (!chainId) return { eligible: true, reason: null };
  const supported = new Set([137, 80002]);
  return supported.has(chainId)
    ? { eligible: true, reason: null }
    : { eligible: false, reason: "Wrong chain. Switch to Polygon or Polygon Amoy." };
}
