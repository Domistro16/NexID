import type { Metadata } from "next";
import { DashboardPageClient } from "@/components/nexid/dashboard/dashboard-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import { noIndexRobots } from "@/lib/seo";

export const metadata: Metadata = {
  title: "My Edge | NexMarkets",
  description: "Your private NexMarkets edge profile, receipts, rewards, referrals, and positions.",
  robots: noIndexRobots()
};

export default function MyEdgePage() {
  return (
    <NexidAppShell>
      <DashboardPageClient appBaseUrl={getAppBaseUrl()} />
    </NexidAppShell>
  );
}
