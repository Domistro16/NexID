import { NarrativesPageClient } from "@/components/nexid/narratives/narratives-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export default function NarrativesPage() {
  return (
    <NexidAppShell>
      <NarrativesPageClient />
    </NexidAppShell>
  );
}
