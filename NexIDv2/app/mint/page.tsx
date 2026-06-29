import type { Metadata } from "next";
import { MintPageClient } from "@/components/nexid/mint/mint-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Mint a NexMarkets .id | NexMarkets",
  description: "Mint a portable .id for NexMarkets trading, market launches, receipts, referrals, and public creator identity.",
  path: "/mint"
});

export default function MintPage() {
  return (
    <NexidAppShell>
      <MintPageClient appBaseUrl={getAppBaseUrl()} />
    </NexidAppShell>
  );
}
