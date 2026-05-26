import { LegalPageClient } from "@/components/nexid/legal/legal-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { legalPages, type LegalKey } from "@/lib/services/legalService";

export default async function LegalPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pageKey = slug in legalPages ? (slug as LegalKey) : "faq";
  return (
    <NexidAppShell>
      <LegalPageClient pageKey={pageKey} />
    </NexidAppShell>
  );
}
