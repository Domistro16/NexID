import type { Metadata } from "next";
import { DashboardPageClient } from "@/components/nexid/dashboard/dashboard-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import { noIndexRobots } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Dashboard | NexMarkets",
  description: "Private NexMarkets dashboard for positions, receipts, rewards, referrals, and market activity.",
  robots: noIndexRobots()
};

export default function DashboardPage() {
  return (
    <NexidAppShell>
      <DashboardPageClient appBaseUrl={getAppBaseUrl()} />
    </NexidAppShell>
  );
}
