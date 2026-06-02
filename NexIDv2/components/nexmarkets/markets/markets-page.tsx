"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  marketCategoryLabel,
  marketPriceLabel,
  marketStateClass,
  marketStateLabel,
  marketUiSummary,
  numberValue,
  polymarketRouteRaw,
} from "@/components/nexmarkets/market-ui";
import type { NexMarket } from "@/lib/types/nexmarkets";

const categoryList = ["All", "Crypto", "Sports", "Culture", "AI"];
const stateList = ["All", "Routed", "Native", "No route"];
const sortList = ["Trending", "Newest", "Closing soon", "Volume"];

type MarketView = {
  id: string;
  source: NexMarket;
  title: string;
  category: string;
  state: string;
  stateClass: string;
  status: string;
  summary: string;
  price: number | null;
  priceLabel: string;
  volume: number;
  close: string;
  creator: string;
  createdAt: string;
  canTrade: boolean;
};

function fmt(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return `$${value}`;
}

function volumeValue(market: NexMarket) {
  const raw = polymarketRouteRaw(market);
  return numberValue(raw.volume24h) ?? 0;
}

function toMarketView(market: NexMarket): MarketView {
  const ui = marketUiSummary(market);
  return {
    id: market.id,
    source: market,
    title: market.title,
    category: marketCategoryLabel(market),
    state: marketStateLabel(market),
    stateClass: marketStateClass(market),
    status: ui.status,
    summary: market.question,
    price: ui.price,
    priceLabel: marketPriceLabel(market, ui.price),
    volume: volumeValue(market),
    close: ui.close,
    creator: ui.creator,
    createdAt: market.createdAt,
    canTrade: market.status === "trading_live" && market.origin !== "draft"
  };
}

function closeSortValue(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 999;
}

export function MarketsPage({ markets }: { markets: NexMarket[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("All");
  const [marketState, setMarketState] = useState("All");
  const [sort, setSort] = useState("Trending");
  const [search, setSearch] = useState("");

  const marketViews = useMemo(() => markets.map(toMarketView), [markets]);

  const filteredMarkets = useMemo(() => {
    let arr = marketViews.slice();
    if (category !== "All") arr = arr.filter((market) => market.category === category);
    if (marketState !== "All") arr = arr.filter((market) => market.state === marketState);
    const query = search.trim().toLowerCase();
    if (query) {
      arr = arr.filter((market) => (
        `${market.title} ${market.category} ${market.state} ${market.summary} ${market.creator}`
      ).toLowerCase().includes(query));
    }
    if (sort === "Volume") arr.sort((a, b) => b.volume - a.volume);
    if (sort === "Closing soon") arr.sort((a, b) => closeSortValue(a.close) - closeSortValue(b.close));
    if (sort === "Newest") arr.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return arr;
  }, [category, marketState, marketViews, search, sort]);

  const hasSearch = search.trim().length > 0;
  const searchResults = hasSearch ? filteredMarkets.slice(0, 5) : [];

  function openDetail(market: MarketView, side?: "ride" | "fade") {
    const suffix = side ? `?side=${side}` : "";
    router.push(`/market/${encodeURIComponent(market.id)}${suffix}`);
  }

  function prefillLaunch(title: string) {
    router.push(`/launch?thesis=${encodeURIComponent(title)}`);
  }

  function cardClick(market: MarketView) {
    if (market.state === "No route") prefillLaunch(market.title);
    else openDetail(market);
  }

  return (
    <section id="markets" className="view active">
      <section>
        <div className="nm-page-title">
          <div>
            <div className="eyebrow"><i className="dot" /> Markets</div>
            <h1>Trade the timeline.</h1>
            <p>Search live narratives, find existing routes, or launch the missing market when no clean route exists.</p>
          </div>
          <button className="primary" type="button" onClick={() => router.push("/launch")}>Launch market</button>
        </div>

        <div className="nm-market-search">
          <div className="nm-search-row">
            <div className="nm-search-box">
              <input
                id="marketSearch"
                value={search}
                placeholder="Search HYPE, Bankr, Osimhen, voice agents..."
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className={`nm-search-results${hasSearch ? " show" : ""}`} id="searchResults">
                {!hasSearch ? null : searchResults.length ? (
                  searchResults.map((market) => (
                    <div
                      className="nm-search-result"
                      key={market.id}
                      onClick={() => cardClick(market)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") cardClick(market);
                      }}
                    >
                      <div>
                        <b>{market.title}</b>
                        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3 }}>{market.category} · {market.state} · {market.status}</div>
                      </div>
                      <span className={`state-tag ${market.stateClass}`}>{market.state}</span>
                    </div>
                  ))
                ) : (
                  <div className="nm-empty-search">
                    <h3>No market found for “{search.trim()}”.</h3>
                    <p>Launch it as a native market with a source type, close time, fallback and creator bond.</p>
                    <button className="primary" type="button" onClick={() => prefillLaunch(search.trim())}>Launch this market</button>
                  </div>
                )}
              </div>
            </div>
            <select className="nm-sort" value={sort} onChange={(event) => setSort(event.target.value)}>
              {sortList.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="nm-filter-row">
            {categoryList.map((item) => (
              <button key={item} className={`nm-chip ${category === item ? "active" : ""}`} type="button" onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
            {stateList.map((item) => (
              <button key={item} className={`nm-chip ${marketState === item ? "active" : ""}`} type="button" onClick={() => setMarketState(item)}>
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

        <div className="nm-market-grid">
          {filteredMarkets.map((market) => (
            <article className="nm-market-card" key={market.id} onClick={() => cardClick(market)}>
              <div>
                <div className="nm-card-top">
                  <span className={`state-tag ${market.stateClass}`}>{market.state}</span>
                  <span className="state-tag">{market.category}</span>
                  <span className="state-tag">{market.status}</span>
                </div>
                <h3>{market.title}</h3>
                <p>{market.summary}</p>
              </div>
              <div>
                <div className="nm-card-metrics">
                  <div className="nm-card-metric">
                    <span>Price</span>
                    <b>{market.price === null ? market.priceLabel : `${Math.round(market.price * 100)}c YES`}</b>
                  </div>
                  <div className="nm-card-metric">
                    <span>Volume</span>
                    <b>{market.source.origin === "draft" ? "No route" : fmt(market.volume)}</b>
                  </div>
                  <div className="nm-card-metric">
                    <span>Close</span>
                    <b>{market.close}</b>
                  </div>
                </div>
                <div className="nm-card-actions">
                  {market.state === "No route" ? (
                    <button
                      className="primary"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        prefillLaunch(market.title);
                      }}
                    >
                      Launch native
                    </button>
                  ) : market.canTrade ? (
                    <>
                      <button
                        className="mini-btn ride"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDetail(market, "ride");
                        }}
                      >
                        Ride
                      </button>
                      <button
                        className="mini-btn fade"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDetail(market, "fade");
                        }}
                      >
                        Fade
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDetail(market);
                      }}
                    >
                      Open room
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
