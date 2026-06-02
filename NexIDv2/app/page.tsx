import type { Metadata } from "next";
import { HomePage } from "@/components/nexmarkets/home/home-page";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { getBoard } from "@/lib/services/boardService";
import { listNexMarkets } from "@/lib/services/nexmarketsService";

export const metadata: Metadata = {
  title: "NexMarkets",
  description: "Trade live narratives, launch missing markets, keep receipts, and build a portable .id passport."
};

export const dynamic = "force-dynamic";

export default async function RootHomePage() {
  const [markets, board] = await Promise.all([
    listNexMarkets(),
    getBoard("global")
  ]);

  return (
    <NexidAppShell>
      <HomePage markets={markets} board={board} />
    </NexidAppShell>
  );
}
