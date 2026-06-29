import type { Metadata } from "next";
import { ReceiptsPageClient } from "@/components/nexid/receipts/receipts-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { noIndexRobots } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Receipts | NexMarkets",
  description: "Private NexMarkets receipt archive for trades, launches, claims, and market actions.",
  robots: noIndexRobots()
};

export default function ReceiptsPage() {
  return (
    <NexidAppShell>
      <ReceiptsPageClient />
    </NexidAppShell>
  );
}
