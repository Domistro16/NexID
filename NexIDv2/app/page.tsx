import type { Metadata } from "next";
import { HomePage } from "@/components/nexmarkets/home/home-page";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, pageSeo } from "@/lib/seo";
import { listNexMarkets } from "@/lib/services/nexmarketsService";

export const metadata: Metadata = pageSeo({
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  path: "/"
});

export const dynamic = "force-dynamic";

export default async function RootHomePage() {
  const markets = await listNexMarkets();

  return (
    <NexidAppShell>
      <HomePage markets={markets} />
    </NexidAppShell>
  );
}
