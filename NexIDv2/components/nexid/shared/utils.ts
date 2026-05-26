import type { BoardEntry, BoardKey } from "@/lib/types/nexid";
import { shortWalletAddress } from "@/lib/identity";

export const emptyBoards: Record<BoardKey, BoardEntry[]> = {
  faders: [],
  riders: [],
  receipts: [],
  lowcap: [],
  global: [],
  regional: [],
  ai: [],
  base: [],
  solana: [],
  rwa: []
};

export function cls(...items: Array<string | false | undefined>) {
  return items.filter(Boolean).join(" ");
}

export function fmtCurrency(value: number) {
  return value >= 1000000 ? `$${(value / 1000000).toFixed(1)}m` : `$${Math.round(value / 1000)}k`;
}

export function cleanIdName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
}

export function shortAddress(value?: string | null) {
  return shortWalletAddress(value);
}

export function boardLabels(): Record<BoardKey, string> {
  return {
    faders: "Top Faders",
    riders: "Top Riders",
    receipts: "Best Receipts",
    lowcap: "Low-Capital High-Signal",
    global: "Global Points",
    regional: "Regional Edge",
    ai: "AI Agents",
    base: "Base",
    solana: "Solana",
    rwa: "RWA"
  };
}
