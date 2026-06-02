import type { Metadata } from "next";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { MarketsPage } from "@/components/nexmarkets/markets/markets-page";
import { listNexMarkets } from "@/lib/services/nexmarketsService";

export const metadata: Metadata = {
  title: "Markets | NexMarkets",
  description: "Search live narratives, find existing routes, or launch the missing market."
};

export const dynamic = "force-dynamic";

export default async function MarketsRoutePage() {
  const markets = await listNexMarkets();

  return (
    <NexidAppShell>
      <MarketsPage markets={markets} />
    </NexidAppShell>
  );
}
