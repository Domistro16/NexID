import Link from "next/link";
import {
  compactUsd,
  marketPriceLabel,
  marketUiSummary,
  numberArray,
  polymarketRouteRaw,
  stringArray
} from "@/components/nexmarkets/market-ui";
import { MarketDetailTabs } from "@/components/nexmarkets/market-detail-tabs";
import { MarketHistoryChart } from "@/components/nexmarkets/market-history-chart";
import { NativeTradeTicket } from "@/components/nexmarkets/native-trade-ticket";
import { PolymarketRouteTicket } from "@/components/nexmarkets/polymarket-route-ticket";
import type { PublicMarketActivity } from "@/lib/services/marketActivityService";
import type { NexMarket } from "@/lib/types/nexmarkets";

function marketIsClosed(status: NexMarket["status"]) {
  return ["closed", "result_proposed", "disputed", "settled", "invalid_refund"].includes(status);
}

const DEFAULT_NATIVE_LAUNCH_STAKE_USDC = 20;

function profileHref(identity: string) {
  const clean = identity.trim();
  if (!clean) return "/dashboard";
  return `/id/${encodeURIComponent(clean.replace(/\.id$/i, ""))}`;
}

function rulesLabel(market: NexMarket) {
  if (market.origin === "native" && (market.rulesHash || market.metadataHash || market.sourceUrl)) return "Locked at launch";
  return market.sourceUrl ? "Visible" : "Pending";
}

function creatorBondLabel(market: NexMarket, activity: PublicMarketActivity) {
  if (market.origin !== "native") return "-";
  const stake = activity.native.launchStakeUsdc;
  if (stake && stake > 0) return `${compactUsd(stake)} locked`;
  if (
    market.launchStakeStatus === "paid" ||
    ["live_pending_open", "trading_live", "closed", "result_proposed", "disputed", "settled"].includes(market.status)
  ) {
    return `$${DEFAULT_NATIVE_LAUNCH_STAKE_USDC} locked`;
  }
  return "-";
}

function RelatedMarkets({ market, markets }: { market: NexMarket; markets: NexMarket[] }) {
  const related = markets
    .filter((item) => item.id !== market.id && (item.arena === market.arena || item.origin === market.origin))
    .slice(0, 3);

  if (!related.length) return null;

  return (
    <section className="v40-panel v40-related-panel">
      <h3>Related narratives</h3>
      <div className="v40-related">
        {related.map((item) => {
          const itemUi = marketUiSummary(item);
          return (
            <Link className="v40-related-card" href={`/market/${item.id}`} key={item.id}>
              <b>{item.title}</b>
              <span>{itemUi.category} - {itemUi.state} - {marketPriceLabel(item, itemUi.price)}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function MarketRoom({
  market,
  activity,
  relatedMarkets = []
}: {
  market: NexMarket;
  activity: PublicMarketActivity;
  relatedMarkets?: NexMarket[];
}) {
  const raw = polymarketRouteRaw(market);
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
              {market.origin === "native" ? <span className="pill">Rules locked</span> : null}
            </div>
            <h1>{market.title}</h1>
            <p>{market.question || "Market room with visible source, rules, trading activity and receipts."}</p>
            <div className="v40-stat-grid">
              <div className="v40-stat"><span>YES</span><b>{priceLabel}</b></div>
              <div className="v40-stat"><span>Volume</span><b>{ui.volumeLabel}</b></div>
              <div className="v40-stat"><span>Liquidity</span><b>{ui.liquidityLabel}</b></div>
              <div className="v40-stat"><span>Traders</span><b>{activity.traderCount.toLocaleString()}</b></div>
              <div className="v40-stat"><span>Close</span><b>{ui.close}</b></div>
              <div className="v40-stat"><span>Source</span><b>{ui.source}</b></div>
            </div>
          </div>
          <aside className="v40-side-card">
            <span className={`v40-state ${ui.stateClass}`}>{market.origin === "native" ? "Creator market" : ui.state}</span>
            <div className="v40-side-price">{priceLabel}</div>
            <div className="v40-side-by">
              {market.origin === "native" ? "Created by" : "Routed via"}{" "}
              <Link className="btn" href={profileHref(ui.creator)}>{ui.creator}</Link>
            </div>
            <div className="v40-info-line"><span>Ride / Fade</span><b>{riders.toLocaleString()} / {faders.toLocaleString()}</b></div>
            <div className="v40-info-line"><span>Creator bond</span><b>{creatorBondLabel(market, activity)}</b></div>
            <div className="v40-info-line"><span>Outcome</span><b>Yes/No</b></div>
            <div className="v40-info-line"><span>Rules</span><b>{rulesLabel(market)}</b></div>
          </aside>
        </div>

        <div className="v40-detail-grid">
          <main>
            <MarketHistoryChart price={ui.price} status={ui.status} pendingResult={pendingResult} activity={activity} />
            <MarketDetailTabs market={market} activity={activity} />
            <RelatedMarkets market={market} markets={relatedMarkets} />
          </main>
          <aside>
            {isPolymarketRoute ? (
              <PolymarketRouteTicket
                marketId={market.id}
                prices={prices}
                clobTokenIds={clobTokenIds}
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
