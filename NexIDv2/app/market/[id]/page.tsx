import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketRoom } from "@/components/nexmarkets/market-room";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { getPublicMarketActivity } from "@/lib/services/marketActivityService";
import { getNexMarket } from "@/lib/services/nexmarketsService";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const market = await getNexMarket(id);
  return {
    title: market ? `${market.title} | NexMarkets` : "Market | NexMarkets",
    description: market?.question ?? "NexMarkets market room."
  };
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
      <MarketRoom market={market} activity={activity} />
    </NexidAppShell>
  );
}
