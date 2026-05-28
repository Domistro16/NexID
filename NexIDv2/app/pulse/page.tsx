import type { Metadata } from "next";
import { PulsePage } from "@/components/nexmarkets/pulse/pulse-page";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { getBoard } from "@/lib/services/boardService";
import { listNexMarkets } from "@/lib/services/nexmarketsService";
import { listNarratives } from "@/lib/services/narrativeService";

export const metadata: Metadata = {
  title: "Pulse | NexMarkets",
  description: "Live markets, draftable theses, EdgeBoard state, and NexMarkets launch flow."
};

export const dynamic = "force-dynamic";

export default async function PulseRoutePage() {
  const [markets, narratives, board] = await Promise.all([
    listNexMarkets(),
    listNarratives(),
    getBoard("global")
  ]);

  return (
    <NexidAppShell>
      <PulsePage markets={markets} narratives={narratives} board={board} />
    </NexidAppShell>
  );
}
