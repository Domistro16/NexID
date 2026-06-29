import type { Metadata } from "next";
import { PassportPage } from "@/components/nexmarkets/passport/passport-page";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { noIndexRobots } from "@/lib/seo";
import { getSessionUser } from "@/lib/services/authService";
import { getDashboardSnapshot } from "@/lib/services/dashboardService";

export const metadata: Metadata = {
  title: "Passport | NexMarkets",
  description: "Your .id passport for NexMarkets trading, receipts, referrals, rewards, and creator identity.",
  robots: noIndexRobots()
};

export const dynamic = "force-dynamic";

export default async function PassportRoutePage() {
  const user = await getSessionUser();
  const dashboard = await getDashboardSnapshot(user);

  return (
    <NexidAppShell>
      <PassportPage dashboard={dashboard} />
    </NexidAppShell>
  );
}
