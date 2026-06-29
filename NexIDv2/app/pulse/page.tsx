import type { Metadata } from "next";
import { PulsePage } from "@/components/nexmarkets/pulse/pulse-page";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { pageSeo } from "@/lib/seo";
import { getBoard } from "@/lib/services/boardService";
import { listNexMarkets } from "@/lib/services/nexmarketsService";

export const metadata: Metadata = pageSeo({
  title: "Live Prediction Market Pulse | NexMarkets",
  description: "Follow live markets, draftable narratives, EdgeBoard state, and NexMarkets launch flow signals.",
  path: "/pulse"
});

export const dynamic = "force-dynamic";

export default async function PulseRoutePage() {
  const [markets, board] = await Promise.all([
    listNexMarkets(),
    getBoard("global")
  ]);

  return (
    <NexidAppShell>
      <PulsePage markets={markets} board={board} />
    </NexidAppShell>
  );
}
