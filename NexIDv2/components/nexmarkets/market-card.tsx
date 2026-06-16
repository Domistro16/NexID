import Link from "next/link";
import { marketPriceLabel, marketUiSummary } from "@/components/nexmarkets/market-ui";
import type { NexMarket } from "@/lib/types/nexmarkets";

function agentPublicLabel(value?: string | null) {
  const raw = String(value ?? "").trim().replace(/\.id$/i, "");
  return raw ? `${raw}.id` : null;
}

export function MarketCard({ market }: { market: NexMarket }) {
  const ui = marketUiSummary(market, market.nativeStats?.collateralUsdc ?? 0, market.nativeStats ?? undefined);
  const canTrade = market.status === "trading_live" && market.origin !== "draft";
  const href = market.origin === "draft" ? `/launch?thesis=${encodeURIComponent(market.title)}` : `/market/${encodeURIComponent(market.id)}`;
  const agentLabel = market.createdByType === "agent" ? agentPublicLabel(market.creatorAgentPublicId) : null;

  return (
    <article className="v40-market-card">
      <Link href={href} className="v40-card-link" aria-label={`Open ${market.title}`}>
        <div className="v40-card-head">
          <div className="v40-card-id">
            <div className="v40-avatar">{ui.category.slice(0, 2).toUpperCase()}</div>
            <div>
              <b>{ui.creator}</b>
              <span>{ui.status}</span>
            </div>
          </div>
          <span className={`v40-state ${ui.stateClass}`}>{ui.state}</span>
        </div>
        <div>
          <h3 className="v40-card-title">{market.title}</h3>
          <p className="v40-card-summary">{market.question}</p>
          <div className="v40-price-zone">
            <div className="v40-price-main">
              <span>Yes</span>
              <b>{marketPriceLabel(market, ui.price)}</b>
            </div>
            <div className="v40-split-mini">
              <div className="v40-split-label"><span>Ride</span><span>Fade</span></div>
              <div className="v40-split-bar"><i style={{ width: ui.price === null ? "0%" : `${Math.round(ui.price * 100)}%` }} /></div>
            </div>
          </div>
          <div className="v40-card-metrics">
            <div className="v40-card-metric"><span>Volume</span><b>{ui.volumeLabel}</b></div>
            <div className="v40-card-metric"><span>Close</span><b>{ui.close}</b></div>
            <div className="v40-card-metric"><span>Source</span><b>{ui.source}</b></div>
          </div>
        </div>
      </Link>
      {agentLabel ? (
        <Link className="v40-agent-launcher" href={`/agents/${encodeURIComponent(agentLabel.replace(/\.id$/i, ""))}`}>
          <span>Launched by agent</span><b>{agentLabel}</b>
        </Link>
      ) : null}
      <div className="v40-card-actions">
        {canTrade ? (
          <>
            <Link className="ride" href={`/market/${encodeURIComponent(market.id)}?side=ride`}>Ride</Link>
            <Link className="fade" href={`/market/${encodeURIComponent(market.id)}?side=fade`}>Fade</Link>
          </>
        ) : (
          <Link className="launch" href={href}>{market.origin === "draft" ? "Continue launch" : "Open room"}</Link>
        )}
      </div>
    </article>
  );
}
