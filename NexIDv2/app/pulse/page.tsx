import type { Metadata } from "next";
import { PulsePage } from "@/components/nexmarkets/pulse/pulse-page";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { getBoard } from "@/lib/services/boardService";
import { listNexMarkets } from "@/lib/services/nexmarketsService";

export const metadata: Metadata = {
  title: "Pulse | NexMarkets",
  description: "Live markets, draftable theses, EdgeBoard state, and NexMarkets launch flow."
};

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
