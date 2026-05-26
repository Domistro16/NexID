import { DashboardPageClient } from "@/components/nexid/dashboard/dashboard-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { getAppBaseUrl } from "@/lib/appBaseUrl";

export default function DashboardPage() {
  return (
    <NexidAppShell>
      <DashboardPageClient appBaseUrl={getAppBaseUrl()} />
    </NexidAppShell>
  );
}
