import type { Metadata } from "next";
import { HomePage } from "@/components/nexmarkets/home/home-page";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { listNexMarkets } from "@/lib/services/nexmarketsService";

export const metadata: Metadata = {
  title: "NexMarkets",
  description: "Trade live narratives, launch missing markets, keep receipts, and build a portable .id passport."
};

export const dynamic = "force-dynamic";

export default async function RootHomePage() {
  const markets = await listNexMarkets();

  return (
    <NexidAppShell>
      <HomePage markets={markets} />
    </NexidAppShell>
  );
}
