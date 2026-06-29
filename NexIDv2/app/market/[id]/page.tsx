import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketRoom } from "@/components/nexmarkets/market-room";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { absoluteUrl, pageSeo } from "@/lib/seo";
import { getPublicMarketActivity } from "@/lib/services/marketActivityService";
import { getNexMarket } from "@/lib/services/nexmarketsService";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const market = await getNexMarket(id);
  if (!market) {
    return pageSeo({
      title: "Market Not Found | NexMarkets",
      description: "This NexMarkets market could not be found.",
      path: `/market/${encodeURIComponent(id)}`,
      noIndex: true
    });
  }

  const status = market.finalOutcome ? `Final outcome: ${market.finalOutcome}. ` : "";
  return pageSeo({
    title: `${market.title} | NexMarkets`,
    description: `${status}${market.question || "Trade Ride or Fade on this NexMarkets market."}`.slice(0, 180),
    path: `/market/${encodeURIComponent(market.id)}`
  });
}

function MarketStructuredData({ market }: { market: NonNullable<Awaited<ReturnType<typeof getNexMarket>>> }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": absoluteUrl(`/market/${encodeURIComponent(market.id)}#webpage`),
    name: market.title,
    description: market.question,
    url: absoluteUrl(`/market/${encodeURIComponent(market.id)}`),
    datePublished: market.createdAt,
    dateModified: market.updatedAt,
    isPartOf: {
      "@type": "WebSite",
      name: "NexMarkets",
      url: absoluteUrl("/")
    },
    about: {
      "@type": "Thing",
      name: market.arena || "Prediction market"
    }
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [market, activity] = await Promise.all([
    getNexMarket(id),
    getPublicMarketActivity(id)
  ]);
  if (!market) notFound();

  return (
    <NexidAppShell>
      <MarketStructuredData market={market} />
      <MarketRoom market={market} activity={activity} />
    </NexidAppShell>
  );
}
