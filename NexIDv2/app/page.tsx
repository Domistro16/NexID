import type { Metadata } from "next";
import { HomePage } from "@/components/nexmarkets/home/home-page";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { listNexMarkets } from "@/lib/services/nexmarketsService";

export const metadata: Metadata = {
  title: "Launch a market for any narrative, earn 1% of all trades automatically, settled by randomly selected credentialed human",
  description: "Launch, trade, and settle native prediction markets with locked Resolution Cards, ProofFlow consensus, and public receipts."
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
