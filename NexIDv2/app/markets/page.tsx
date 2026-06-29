import type { Metadata } from "next";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { MarketsPage } from "@/components/nexmarkets/markets/markets-page";
import { pageSeo } from "@/lib/seo";
import { listNexMarkets } from "@/lib/services/nexmarketsService";

export const metadata: Metadata = pageSeo({
  title: "Prediction Markets for Live Narratives | NexMarkets",
  description: "Search live narratives, trade existing routes, or launch a native NexMarkets market with locked rules and ProofFlow settlement.",
  path: "/markets"
});

export const dynamic = "force-dynamic";

export default async function MarketsRoutePage() {
  const markets = await listNexMarkets();

  return (
    <NexidAppShell>
      <MarketsPage markets={markets} />
    </NexidAppShell>
  );
}
