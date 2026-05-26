import { PointsPageClient } from "@/components/nexid/points/points-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export default function PointsPage() {
  return (
    <NexidAppShell>
      <PointsPageClient />
    </NexidAppShell>
  );
}
