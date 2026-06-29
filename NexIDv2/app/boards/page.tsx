import type { Metadata } from "next";
import { BoardsPageClient } from "@/components/nexid/boards/boards-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "EdgeBoard Reputation and Market Receipts | NexMarkets",
  description: "Track NexMarkets reputation, receipts, creator records, market activity, and public board movement.",
  path: "/edgeboard",
  noIndex: true
});

export default function BoardsPage() {
  return (
    <NexidAppShell>
      <BoardsPageClient />
    </NexidAppShell>
  );
}
