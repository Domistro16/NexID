import Link from "next/link";
import { marketOriginLabel, marketStatusLabel, marketTemplateLabel, toTitleLabel } from "@/components/nexmarkets/copy";
import type { NexMarket } from "@/lib/types/nexmarkets";

export function MarketCard({ market }: { market: NexMarket }) {
  return (
    <Link className="nexmarket-card" href={`/market/${encodeURIComponent(market.id)}`}>
      <div className="nexmarket-card-top">
        <span>{marketOriginLabel(market.origin)}</span>
        <b>{marketStatusLabel(market.status)}</b>
      </div>
      <h3>{market.title}</h3>
      <p>{market.question}</p>
      <div className="nexmarket-card-foot">
        <span>{toTitleLabel(market.arena)}</span>
        <span>{marketTemplateLabel(market.template)}</span>
      </div>
    </Link>
  );
}
