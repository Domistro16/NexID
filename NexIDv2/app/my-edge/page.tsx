import type { Metadata } from "next";
import { DashboardPageClient } from "@/components/nexid/dashboard/dashboard-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { getAppBaseUrl } from "@/lib/appBaseUrl";

export const metadata: Metadata = {
  title: "My Edge | NexMarkets",
  description: "Your private NexMarkets edge profile, receipts, rewards, referrals, and positions."
};

export default function MyEdgePage() {
  return (
    <NexidAppShell>
      <DashboardPageClient appBaseUrl={getAppBaseUrl()} />
    </NexidAppShell>
  );
}
