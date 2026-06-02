import Link from "next/link";
import {
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

export function MarketRoom({ market, activity }: { market: NexMarket; activity: PublicMarketActivity }) {
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
            <MarketHistoryChart price={ui.price} status={ui.status} pendingResult={pendingResult} activity={activity} />
            <MarketDetailTabs market={market} activity={activity} />
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
