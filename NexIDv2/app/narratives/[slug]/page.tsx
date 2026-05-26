import { NarrativeDetailPageClient } from "@/components/nexid/narratives/narrative-detail-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export default async function NarrativeDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <NexidAppShell>
      <NarrativeDetailPageClient slug={slug} />
    </NexidAppShell>
  );
}
