"use client";

import { useEffect, useState } from "react";
import { fetchMarketOrderbookApi } from "@/lib/services/nexid-client";
import type { MarketOrderbookLevel, MarketOrderbookSide, PublicMarketOrderbook } from "@/lib/types/orderbook";

type MarketOrderbookPanelProps = {
  marketId: string;
};

const CENT = "\u00a2";

function sourceLabel(book?: PublicMarketOrderbook | null) {
  if (!book) return "Loading";
  if (book.source === "nexmarkets_orderbook") return "NexMarkets book";
  if (book.source === "polymarket_clob") return "CLOB";
  return "No book";
}

function cents(value: number | null) {
  if (value === null) return "-";
  return `${Math.round(value * 100)}${CENT}`;
}

function pct(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

function moneyCompact(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: value >= 10_000 ? 0 : 1
  }).format(value);
}

function amountLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return Math.round(value).toLocaleString("de-DE");
}

function spreadLabel(side?: MarketOrderbookSide | null) {
  if (!side || side.spread === null) return "Spread -";
  return `Spread ${Math.round(side.spread * 100)}${CENT}`;
}

function displayPrice(side?: MarketOrderbookSide | null) {
  return side?.midpoint ?? side?.bestBid ?? side?.bestAsk ?? null;
}

function BookRows({ levels, tone }: { levels: MarketOrderbookLevel[]; tone: "bid" | "ask" }) {
  if (!levels.length) {
    return <div className="ob-empty-row">No live orders</div>;
  }
  return (
    <div className="ob-rows">
      {levels.map((level) => (
        <div className={`ob-row ${tone}`} key={`${tone}-${level.price}`}>
          <i style={{ width: `${level.depthPct}%` }} />
          <b>{level.priceCents}{CENT}</b>
          <span>{amountLabel(level.shareEstimate)}</span>
          <strong>{moneyCompact(level.cumulativeUsdc)}</strong>
        </div>
      ))}
    </div>
  );
}

export function MarketOrderbookPanel({ marketId }: MarketOrderbookPanelProps) {
  const [book, setBook] = useState<PublicMarketOrderbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadBook() {
    setLoading(true);
    setMessage("");
    try {
      const next = await fetchMarketOrderbookApi(marketId);
      setBook(next);
      setMessage(next.errors?.[0] ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Orderbook unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage("");
    void fetchMarketOrderbookApi(marketId)
      .then((next) => {
        if (!cancelled) {
          setBook(next);
          setMessage(next.errors?.[0] ?? "");
        }
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Orderbook unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  const updated = book?.updatedAt ? new Date(book.updatedAt) : null;
  const updatedLabel = updated && !Number.isNaN(updated.getTime())
    ? updated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    : "-";
  const ridePrice = displayPrice(book?.ride);
  const fadePrice = displayPrice(book?.fade) ?? (ridePrice === null ? null : 1 - ridePrice);
  const ridePct = ridePrice === null ? Math.max(0, Math.min(100, Math.round(50 + ((book?.stats.imbalancePct ?? 0) / 2)))) : Math.round(ridePrice * 100);
  const fadePct = 100 - ridePct;

  return (
    <section className="v40-panel ob-panel" aria-label="Market orderbook">
      <div className="ob-head">
        <div>
          <h3>Orderbook</h3>
          <p>Live bids and asks with size at each price level.</p>
        </div>
        <button type="button" onClick={() => void loadBook()} disabled={loading} title={sourceLabel(book)}>
          {loading ? "Syncing" : spreadLabel(book?.ride)}
        </button>
      </div>

      {message ? <div className="wallet-note route-status"><b>Orderbook:</b> {message}</div> : null}
      {!book && loading ? <div className="ob-loading">Loading live orderbook.</div> : null}
      {book ? (
        <div className="ob-book">
          <div className="ob-ask-stack">
            <div className="ob-table-head">
              <span>Price</span>
              <span>Amount</span>
              <span>Total</span>
            </div>
            <BookRows levels={[...book.ride.asks].reverse()} tone="ask" />
          </div>
          <div className="ob-price-card">
            <div>
              <b>{cents(ridePrice)}</b>
              <span>Ride price</span>
            </div>
            <em>{fadePrice === null ? "" : `~ ${cents(fadePrice)} Fade`}</em>
          </div>
          <div className="ob-bid-stack">
            <BookRows levels={book.ride.bids} tone="bid" />
          </div>
          <div className="ob-footer">
            <span>{pct(ridePct)} Ride</span>
            <i><b style={{ width: `${ridePct}%` }} /><strong style={{ width: `${fadePct}%` }} /></i>
            <span>{pct(fadePct)} Fade</span>
          </div>
          <div className="ob-updated">Updated {updatedLabel} UTC - {sourceLabel(book)}</div>
        </div>
      ) : null}
    </section>
  );
}
