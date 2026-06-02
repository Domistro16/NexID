import Link from "next/link";
import { marketOriginDetail, toTitleLabel } from "@/components/nexmarkets/copy";
import {
  compactUsd,
  marketPriceLabel,
  marketUiSummary,
  numberArray,
  polymarketRouteRaw,
  stringArray
} from "@/components/nexmarkets/market-ui";
import { NativeTradeTicket } from "@/components/nexmarkets/native-trade-ticket";
import { PolymarketRouteTicket } from "@/components/nexmarkets/polymarket-route-ticket";
import type { PublicMarketActivity } from "@/lib/services/marketActivityService";
import type { NexMarket } from "@/lib/types/nexmarkets";

function formatDateTime(value?: string | null) {
  if (!value) return "Open";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Open";
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function sourceLabel(value?: string | null) {
  if (!value) return "Source pending";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function activityTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "recently";
  const minutes = Math.max(1, Math.round((Date.now() - parsed) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ActivityRows({ activity }: { activity: PublicMarketActivity }) {
  if (!activity.trades.length && !activity.receipts.length) {
    return <div className="v40-empty-inline"><b>No live activity yet.</b><p>Trades, launches and receipts will appear here after they are recorded.</p></div>;
  }
  const rows = [
    ...activity.trades.map((trade) => ({
      id: `trade:${trade.id}`,
      identity: trade.identity,
      label: `${trade.side === "ride" ? "Rode" : "Faded"} ${compactUsd(trade.amount)}`,
      meta: trade.status,
      time: trade.createdAt
    })),
    ...activity.receipts.map((receipt) => ({
      id: `receipt:${receipt.id}`,
      identity: receipt.identity,
      label: receipt.title,
      meta: receipt.proof,
      time: receipt.createdAt
    }))
  ].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 10);

  return (
    <>
      {rows.map((row) => (
        <div className="v40-row" key={row.id}>
          <div><b>{row.identity}</b><span>{row.label}</span></div>
          <span>{row.meta}</span>
          <span>{activityTime(row.time)}</span>
          <b>Live</b>
          <span />
        </div>
      ))}
    </>
  );
}

function RulesTab({ market }: { market: NexMarket }) {
  const rows = [
    ["Market question", market.question],
    ["Outcome type", "Ride / Fade"],
    ["Market source", sourceLabel(market.sourceUrl)],
    ["Close time", formatDateTime(market.closeTime)],
    ["Market route", marketOriginDetail(market.origin)],
    ["Rules status", market.sourceUrl ? "Visible before trading" : "Pending source"]
  ];
  return (
    <div className="v40-rule-grid">
      {rows.map(([label, value]) => (
        <div className="v40-rule" key={label}><span>{label}</span><b>{value}</b></div>
      ))}
    </div>
  );
}

function ReceiptsTab({ activity }: { activity: PublicMarketActivity }) {
  if (!activity.receipts.length) {
    return <div className="v40-empty-inline"><b>No receipts yet.</b><p>Receipts will appear once market actions are saved.</p></div>;
  }
  return (
    <div className="v40-receipt-grid">
      {activity.receipts.slice(0, 6).map((receipt) => (
        <article className="v40-mini-receipt" key={receipt.id}>
          <div>
            <h4>{receipt.proof}</h4>
            <p>{receipt.title}</p>
          </div>
          <Link className="btn" href={receipt.id ? `/receipts` : `/market`}>Open</Link>
        </article>
      ))}
    </div>
  );
}

function marketIsClosed(status: NexMarket["status"]) {
  return ["closed", "result_proposed", "disputed", "settled", "invalid_refund"].includes(status);
}

function MarketHistoryPanel({ price, status, pendingResult }: { price: number | null; status: string; pendingResult: boolean }) {
  if (price === null) {
    return (
      <div className="v40-empty-chart">
        <b>{pendingResult ? "Result pending." : "No market history yet."}</b>
        <span>{pendingResult ? "Verification and settlement will set the final outcome." : "Price history will appear after live market data is available."}</span>
      </div>
    );
  }
  const cents = Math.round(price * 100);
  return (
    <div className="nx89-chart nm-static-chart">
      <div className="nx89-live"><span>YES</span><b>{cents}c</b><em>{status}</em></div>
      <svg viewBox="0 0 1000 350" preserveAspectRatio="none" aria-label="Current market price">
        <g className="nx89-grid">
          <line x1="0" x2="1000" y1="110" y2="110" />
          <line x1="0" x2="1000" y1="190" y2="190" />
          <line x1="0" x2="1000" y1="270" y2="270" />
        </g>
        <path className="nx89-line" d={`M 0 ${350 - cents * 3} C 300 ${350 - cents * 3}, 650 ${350 - cents * 3}, 1000 ${350 - cents * 3}`} />
      </svg>
    </div>
  );
}

export function MarketRoom({ market, activity }: { market: NexMarket; activity: PublicMarketActivity }) {
  const raw = polymarketRouteRaw(market);
  const outcomes = stringArray(raw.outcomes);
  const prices = numberArray(raw.outcomePrices);
  const clobTokenIds = stringArray(market.polymarketClobTokenIds).length
    ? stringArray(market.polymarketClobTokenIds)
    : stringArray(raw.clobTokenIds);
  const ui = marketUiSummary(market, activity.volumeUsdc, activity.native);
  const priceLabel = marketPriceLabel(market, ui.price);
  const isPolymarketRoute = market.origin === "polymarket" && market.status === "trading_live" && Boolean(market.polymarketMarketId);
  const nativeReady = market.origin === "native" && market.status === "trading_live" && Boolean(market.contractAddress && market.chainId);
  const closed = marketIsClosed(market.status);
  const pendingResult = market.origin === "native" && ["closed", "result_proposed", "disputed"].includes(market.status);
  const riders = activity.riders;
  const faders = activity.faders;

  return (
    <section className="view active">
      <div className="v40-detail">
        <div className="v40-detail-hero">
          <div className="v40-detail-main">
            <div className="v40-backline">
              <Link className="back" href="/markets">Back to markets</Link>
              <span className={`v40-state ${ui.stateClass}`}>{ui.state}</span>
              <span className="pill">{ui.category}</span>
              {market.origin === "native" ? <span className="pill">Rules visible</span> : null}
            </div>
            <h1>{market.title}</h1>
            <p>{market.question}</p>
            <div className="v40-stat-grid">
              <div className="v40-stat"><span>Yes</span><b>{priceLabel}</b></div>
              <div className="v40-stat"><span>Volume</span><b>{ui.volumeLabel}</b></div>
              <div className="v40-stat"><span>{market.origin === "native" ? "Stake" : "Liquidity"}</span><b>{ui.liquidityLabel}</b></div>
              <div className="v40-stat"><span>Traders</span><b>{activity.traderCount.toLocaleString()}</b></div>
              <div className="v40-stat"><span>Close</span><b>{ui.close}</b></div>
              <div className="v40-stat"><span>Source</span><b>{ui.source}</b></div>
            </div>
          </div>
          <aside className="v40-side-card">
            <span className={`v40-state ${ui.stateClass}`}>{market.origin === "native" ? "Creator market" : ui.state}</span>
            <div className="v40-side-price">{priceLabel}</div>
            <div className="v40-side-by">{market.origin === "native" ? "Created by" : "Routed via"} <b>{ui.creator}</b></div>
            <div className="v40-info-line"><span>Ride / Fade</span><b>{riders.toLocaleString()} / {faders.toLocaleString()}</b></div>
            <div className="v40-info-line"><span>Market style</span><b>{ui.template}</b></div>
            <div className="v40-info-line"><span>Status</span><b>{ui.status}</b></div>
            <div className="v40-info-line"><span>Rules</span><b>{market.sourceUrl ? "Visible" : "Pending"}</b></div>
          </aside>
        </div>

        <div className="v40-detail-grid">
          <main>
            <section className="v40-panel v40-chart-panel">
              <div className="v40-chart-head">
                <div>
                  <h3>Market history</h3>
                  <p>Live prices and volume appear as the market is indexed.</p>
                </div>
              </div>
              <MarketHistoryPanel price={ui.price} status={ui.status} pendingResult={pendingResult} />
            </section>
            <section className="v40-panel v40-market-tabs">
              <div className="v40-tab-content">
                <h3>Activity</h3>
                <ActivityRows activity={activity} />
              </div>
            </section>
            <section className="v40-panel v40-market-tabs">
              <div className="v40-tab-content">
                <h3>Rules</h3>
                <RulesTab market={market} />
              </div>
            </section>
            <section className="v40-panel v40-market-tabs">
              <div className="v40-tab-content">
                <h3>Receipts</h3>
                <ReceiptsTab activity={activity} />
              </div>
            </section>
          </main>
          <aside>
            {isPolymarketRoute ? (
              <PolymarketRouteTicket
                marketId={market.id}
                question={market.question}
                outcomes={outcomes}
                prices={prices}
                clobTokenIds={clobTokenIds}
                liquidity={ui.liquidityLabel}
                volume24h={compactUsd(raw.volume24h)}
              />
            ) : nativeReady ? (
              <NativeTradeTicket
                marketId={market.id}
                chainId={market.chainId!}
                contractAddress={market.contractAddress!}
                status={market.status}
              />
            ) : (
              <section className="v40-ticket">
                <h3>{closed ? "Trading closed" : "Market not open"}</h3>
                <p className="v40-risk">
                  {closed
                    ? "This market is past its close time. Result verification and settlement follow the locked source and rules."
                    : "This room opens for trading when the launch checks and source rules are complete."}
                </p>
                <div className="v40-summary">
                  <div><span>Route</span><b>{ui.originDetail}</b></div>
                  <div><span>Status</span><b>{ui.status}</b></div>
                  <div><span>Close</span><b>{ui.close}</b></div>
                  <div><span>Source</span><b>{ui.source}</b></div>
                </div>
                <Link className="execute" href="/launch">Launch another market</Link>
              </section>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
