import type { Metadata } from "next";
import { BoardsPageClient } from "@/components/nexid/boards/boards-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export const metadata: Metadata = {
  title: "EdgeBoard | NexMarkets",
  description: "NexMarkets reputation, receipts, points, and reward boards."
};

export default function EdgeBoardPage() {
  return (
    <NexidAppShell>
      <BoardsPageClient />
    </NexidAppShell>
  );
}
