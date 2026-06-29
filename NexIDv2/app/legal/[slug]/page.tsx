import type { Metadata } from "next";
import { LegalPageClient } from "@/components/nexid/legal/legal-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { pageSeo } from "@/lib/seo";
import { legalPages, type LegalKey } from "@/lib/services/legalService";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pageKey = slug in legalPages ? (slug as LegalKey) : "faq";
  const page = legalPages[pageKey];
  return pageSeo({
    title: `${page.title} | NexMarkets`,
    description: page.lead,
    path: `/legal/${pageKey}`
  });
}

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
