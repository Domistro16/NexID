import { ReceiptsPageClient } from "@/components/nexid/receipts/receipts-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export default function ReceiptsPage() {
  return (
    <NexidAppShell>
      <ReceiptsPageClient />
    </NexidAppShell>
  );
}
