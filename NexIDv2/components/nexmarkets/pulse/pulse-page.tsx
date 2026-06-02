"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  marketCategoryLabel,
  marketPriceLabel,
  marketStateClass,
  marketStateLabel,
  marketUiSummary,
  numberValue,
  polymarketRouteRaw
} from "@/components/nexmarkets/market-ui";
import type { BoardEntry } from "@/lib/types/nexid";
import type { NexMarket } from "@/lib/types/nexmarkets";

const sorts = ["Trending", "Newest", "Closing soon", "Volume"] as const;
const routeStates = ["All", "Routed", "Native", "No route"] as const;

function distinct(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function closeTimeValue(market: NexMarket) {
  const value = market.closeTime ? Date.parse(market.closeTime) : Number.POSITIVE_INFINITY;
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function marketVolumeValue(market: NexMarket) {
  const raw = polymarketRouteRaw(market);
  return numberValue(raw.volume24h) ?? 0;
}

function marketHref(market: NexMarket) {
  return market.origin === "draft"
    ? `/launch?thesis=${encodeURIComponent(market.title)}`
    : `/market/${encodeURIComponent(market.id)}`;
}

function MarketTile({ market }: { market: NexMarket }) {
  const ui = marketUiSummary(market);
  const priceLabel = marketPriceLabel(market, ui.price);
  const state = marketStateLabel(market);
  const stateClass = marketStateClass(market);
  const href = marketHref(market);
  const canTrade = market.status === "trading_live" && market.origin !== "draft";

  return (
    <article className="nm-market-card">
      <Link className="nm-market-card-hit" href={href} aria-label={`Open ${market.title}`}>
        <div>
          <div className="nm-card-top">
            <span className={`state-tag ${stateClass}`}>{state}</span>
            <span className="state-tag">{ui.category}</span>
          </div>
          <h3>{market.title}</h3>
          <p>{market.question || ui.originDetail}</p>
        </div>
        <div className="nm-card-metrics">
          <div className="nm-card-metric">
            <span>Price</span>
            <b>{ui.price === null ? priceLabel : `${Math.round(ui.price * 100)}c YES`}</b>
          </div>
          <div className="nm-card-metric">
            <span>Volume</span>
            <b>{market.origin === "draft" ? "No route" : ui.volumeLabel}</b>
          </div>
          <div className="nm-card-metric">
            <span>Close</span>
            <b>{ui.close}</b>
          </div>
        </div>
      </Link>
      <div className="nm-card-actions">
        {canTrade ? (
          <>
            <Link className="mini-btn ride" href={`${href}?side=ride`}>Ride</Link>
            <Link className="mini-btn fade" href={`${href}?side=fade`}>Fade</Link>
          </>
        ) : market.origin === "draft" ? (
          <Link className="primary" href={href}>Launch native</Link>
        ) : (
          <Link className="primary" href={href}>Open market</Link>
        )}
      </div>
    </article>
  );
}

export function PulsePage({
  markets
}: {
  markets: NexMarket[];
  board: BoardEntry[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [marketState, setMarketState] = useState<(typeof routeStates)[number]>("All");
  const [sort, setSort] = useState<(typeof sorts)[number]>("Trending");
  const categories = ["All", ...distinct(markets.map(marketCategoryLabel))];

  const filteredMarkets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = markets.filter((market) => {
      const haystack = `${market.title} ${market.question} ${market.arena} ${market.origin} ${market.creatorIdentity ?? ""}`.toLowerCase();
      return (!q || haystack.includes(q))
        && (category === "All" || marketCategoryLabel(market) === category)
        && (marketState === "All" || marketStateLabel(market) === marketState);
    });
    return [...next].sort((a, b) => {
      if (sort === "Newest") return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      if (sort === "Closing soon") return closeTimeValue(a) - closeTimeValue(b);
      if (sort === "Volume") return marketVolumeValue(b) - marketVolumeValue(a);
      const statusWeight = (market: NexMarket) => market.status === "trading_live" ? 3 : market.status === "live_pending_open" ? 2 : market.origin === "native" ? 1 : 0;
      return statusWeight(b) - statusWeight(a) || marketVolumeValue(b) - marketVolumeValue(a) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }, [category, marketState, markets, search, sort]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return markets
      .filter((market) => `${market.title} ${market.question} ${market.creatorIdentity ?? ""}`.toLowerCase().includes(q))
      .slice(0, 5);
  }, [markets, search]);

  const hasSearch = search.trim().length > 0;

  return (
    <section className="view active">
      <section>
        <div className="nm-page-title">
          <div>
            <div className="eyebrow"><i className="dot" /> Markets</div>
            <h1>Trade the timeline.</h1>
            <p>Search live narratives, find existing routes, or launch the missing market when no clean route exists.</p>
          </div>
          <Link className="primary" href="/launch">Launch market</Link>
        </div>

        <div className="nm-market-search">
          <div className="nm-search-row">
            <div className="nm-search-box">
              <input
                id="marketSearch"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search HYPE, Bankr, Osimhen, voice agents..."
                aria-label="Search markets"
              />
              <div className={`nm-search-results ${hasSearch ? "show" : ""}`} id="searchResults">
                {searchResults.length ? searchResults.map((market) => (
                  <Link key={market.id} className="nm-search-result" href={marketHref(market)}>
                    <div>
                      <b>{market.title}</b>
                      <span>{marketCategoryLabel(market)} · {marketStateLabel(market)}</span>
                    </div>
                    <span className={`state-tag ${marketStateClass(market)}`}>{marketStateLabel(market)}</span>
                  </Link>
                )) : hasSearch ? (
                  <div className="nm-empty-search">
                    <h3>No clean route found.</h3>
                    <p>Make the missing narrative tradable with a native market.</p>
                    <Link className="primary" href={`/launch?thesis=${encodeURIComponent(search)}`}>Launch native</Link>
                  </div>
                ) : null}
              </div>
            </div>
            <select className="nm-sort" value={sort} onChange={(event) => setSort(event.target.value as (typeof sorts)[number])} aria-label="Sort markets">
              {sorts.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="nm-filter-row">
            {categories.map((item) => (
              <button key={item} className={`nm-chip ${category === item ? "active" : ""}`} onClick={() => setCategory(item)} type="button">
                {item}
              </button>
            ))}
            {routeStates.map((item) => (
              <button key={item} className={`nm-chip ${marketState === item ? "active" : ""}`} onClick={() => setMarketState(item)} type="button">
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="nm-status-line">
          <span className="state-tag">{filteredMarkets.length} markets shown</span>
          <span className="state-tag routed">Routed</span>
          <span className="state-tag native">Native</span>
          <span className="state-tag no_route">No route</span>
        </div>

        {filteredMarkets.length ? (
          <div className="nm-market-grid">
            {filteredMarkets.map((market) => <MarketTile key={market.id} market={market} />)}
          </div>
        ) : (
          <div className="nm-empty-search nm-empty-panel">
            <h3>No market found for this search.</h3>
            <p>Make the missing narrative tradable by launching a NexMarkets market with visible rules.</p>
            <Link className="primary" href={search ? `/launch?thesis=${encodeURIComponent(search)}` : "/launch"}>Launch this market</Link>
          </div>
        )}

        {!markets.length ? (
          <div className="nm-empty-search nm-empty-panel">
            <h3>No markets yet.</h3>
            <p>Launch a clear market to start the public timeline.</p>
            <Link className="primary" href="/launch">Launch market</Link>
          </div>
        ) : null}
      </section>
    </section>
  );
}
