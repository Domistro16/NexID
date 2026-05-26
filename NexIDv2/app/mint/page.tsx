import { MintPageClient } from "@/components/nexid/mint/mint-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { getAppBaseUrl } from "@/lib/appBaseUrl";

export default function MintPage() {
  return (
    <NexidAppShell>
      <MintPageClient appBaseUrl={getAppBaseUrl()} />
    </NexidAppShell>
  );
}
