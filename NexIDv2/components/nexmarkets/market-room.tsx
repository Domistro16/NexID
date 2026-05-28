import Link from "next/link";
import { marketOriginDetail, marketOriginLabel, marketStatusLabel, marketTemplateLabel, toTitleLabel } from "@/components/nexmarkets/copy";
import { NativeTradeTicket } from "@/components/nexmarkets/native-trade-ticket";
import { PolymarketRouteTicket } from "@/components/nexmarkets/polymarket-route-ticket";
import type { NexMarket } from "@/lib/types/nexmarkets";

type PolymarketRouteRaw = {
  slug?: unknown;
  outcomes?: unknown;
  outcomePrices?: unknown;
  clobTokenIds?: unknown;
  liquidity?: unknown;
  volume24h?: unknown;
  expiry?: unknown;
};

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown) {
  return asArray(value).map(String).filter(Boolean);
}

function numberArray(value: unknown) {
  return asArray(value).map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

function asRouteRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function polymarketRouteRaw(market: NexMarket): PolymarketRouteRaw {
  const route = asRouteRecord(market.routeDecision);
  const candidates = asArray(route.polymarketCandidates);
  const first = asRouteRecord(candidates[0]);
  return asRouteRecord(first.raw) as PolymarketRouteRaw;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priceLabel(value: unknown) {
  const price = numberValue(value);
  if (price === null) return null;
  return `${Math.round(price * 1000) / 10}%`;
}

function compactUsd(value: unknown) {
  const amount = numberValue(value);
  if (amount === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(amount);
}

export function MarketRoom({ market }: { market: NexMarket }) {
  const nativeDisabled = market.origin === "native" && (!market.contractAddress || market.status !== "trading_live");
  const polymarketRaw = market.origin === "polymarket" ? polymarketRouteRaw(market) : {};
  const outcomes = stringArray(polymarketRaw.outcomes);
  const prices = numberArray(polymarketRaw.outcomePrices);
  const clobTokenIds = stringArray(market.polymarketClobTokenIds).length
    ? stringArray(market.polymarketClobTokenIds)
    : stringArray(polymarketRaw.clobTokenIds);
  const rideOutcome = outcomes[0] ?? "Yes";
  const fadeOutcome = outcomes[1] ?? "No";
  const ridePrice = priceLabel(prices[0]);
  const fadePrice = priceLabel(prices[1]);
  const isPolymarketRoute = market.origin === "polymarket" && Boolean(market.polymarketMarketId);
  const liquidity = compactUsd(polymarketRaw.liquidity);
  const volume24h = compactUsd(polymarketRaw.volume24h);
  const rulesLabel = market.sourceUrl ? "Source ready" : market.origin === "draft" ? "Needs source" : "Visible before settlement";

  return (
    <section className="view active">
      <div className="detail-head">
        <div className="detail-title">
          <div className="backline">
            <Link className="btn" href="/pulse">Back to Pulse</Link>
            <span className="status-pill ok">{marketOriginLabel(market.origin)}</span>
          </div>
          <h1>{market.title}</h1>
          <p>{market.question}</p>
          <div className="stat-grid">
            <div className="statbox"><span>Status</span><b>{marketStatusLabel(market.status)}</b></div>
            <div className="statbox"><span>Arena</span><b>{toTitleLabel(market.arena)}</b></div>
            <div className="statbox"><span>Style</span><b>{marketTemplateLabel(market.template)}</b></div>
            <div className="statbox"><span>Creator</span><b>{market.creatorIdentity ?? "NexMarkets"}</b></div>
            <div className="statbox"><span>Market</span><b>{marketOriginDetail(market.origin)}</b></div>
            <div className="statbox"><span>Rules</span><b>{rulesLabel}</b></div>
          </div>
        </div>
        <aside className="detail-side">
          <h3>Ride / Fade</h3>
          <div className="side-split">
            <div className="split"><span>Ride</span><b>{rideOutcome}</b>{ridePrice ? <small>{ridePrice}</small> : null}</div>
            <div className="split"><span>Fade</span><b>{fadeOutcome}</b>{fadePrice ? <small>{fadePrice}</small> : null}</div>
          </div>
          <p>{isPolymarketRoute ? "Choose a side here, confirm with your wallet, and keep the receipt in NexMarkets." : nativeDisabled ? "This market is still being prepared. Trading opens after launch is complete." : "Choose a side when the market is open and keep the proof on your passport."}</p>
        </aside>
      </div>

      <section className="detail-grid">
        <div className="market-body">
          <div className="social-panel">
            <div className="dash-panel-head">
              <div>
                <h2>What Settles This Market</h2>
                <p>The question and source below decide the result. Read them before taking a side.</p>
              </div>
            </div>
            <div className="rule">
              <span className="num">1</span>
              <div>
                <b>Question</b>
                <span>{market.question}</span>
              </div>
            </div>
            <div className="rule">
              <span className="num">2</span>
              <div>
                <b>Source</b>
                <span>{market.sourceUrl ?? "The final source will appear before settlement."}</span>
              </div>
            </div>
          </div>
        </div>
        {isPolymarketRoute ? (
          <PolymarketRouteTicket
            marketId={market.id}
            question={market.question}
            outcomes={outcomes}
            prices={prices}
            clobTokenIds={clobTokenIds}
            liquidity={liquidity}
            volume24h={volume24h}
          />
        ) : market.origin === "native" && market.status === "trading_live" && market.contractAddress && market.chainId ? (
          <NativeTradeTicket
            marketId={market.id}
            chainId={market.chainId}
            contractAddress={market.contractAddress}
            status={market.status}
          />
        ) : (
          <aside className="ticket">
            <h3>Trading Opens Soon</h3>
            <div className="summary">
              <div><span>Market</span><b>{marketOriginDetail(market.origin)}</b></div>
              <div><span>Status</span><b>{marketStatusLabel(market.status)}</b></div>
              <div><span>Fit</span><b>{market.polymarketMarketId ? "Matched" : "New idea"}</b></div>
              <div><span>Launch stake</span><b>{market.launchStakeStatus ? toTitleLabel(market.launchStakeStatus) : "-"}</b></div>
            </div>
            <button className="execute" type="button" disabled>
              Not Ready Yet
            </button>
            <p className="risk-line">This market will open when the question, source and launch checks are complete.</p>
          </aside>
        )}
      </section>
    </section>
  );
}
