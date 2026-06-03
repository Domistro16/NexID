"use client";

import { Fragment, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  asRecord,
  marketCategoryLabel,
  marketPriceLabel,
  marketStateClass,
  marketStateLabel,
  marketUiSummary,
  numberValue,
  polymarketRouteRaw,
} from "@/components/nexmarkets/market-ui";
import type { NexMarket } from "@/lib/types/nexmarkets";

const fallbackCategories = ["All", "Crypto", "Sports", "Culture", "AI"];
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
  traders: number | null;
  watchers: number;
  close: string;
  creator: string;
  sourceType: string;
  createdAt: string;
  canTrade: boolean;
  noRoute: boolean;
  agentCreated: boolean;
};

type RailGroup = {
  category: string;
  strength: string;
  route: string;
  markets: MarketView[];
};

type RouteInfo = {
  left: number;
  top: number;
};

function fmt(value: number) {
  if (!value) return "—";
  if (value >= 1000000) return `$${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return `$${value.toLocaleString()}`;
}

function pct(value: number | null) {
  if (value === null) return "—";
  return `${Math.round(value * 100)}¢`;
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function volumeValue(market: NexMarket) {
  const raw = asRecord(polymarketRouteRaw(market));
  return firstNumber(raw, ["volume24h", "volume24hr", "volume", "volumeNum", "volumeNumeric"]) ?? 0;
}

function traderValue(market: NexMarket) {
  const raw = asRecord(polymarketRouteRaw(market));
  return firstNumber(raw, ["numTraders", "traderCount", "traders", "uniqueTraders", "activeTraders"]);
}

function creatorInitial(market: MarketView) {
  return (market.creator || market.category || "NX")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 2)
    .toUpperCase() || "NX";
}

function closeSortValue(value: string) {
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
}

function splitPercent(market: MarketView) {
  if (market.price !== null) return Math.max(1, Math.min(99, Math.round(market.price * 100)));
  return 50;
}

function sourceTypeLabel(market: NexMarket, source: string, status: string) {
  if (market.origin === "polymarket") return "Routed market";
  if (market.origin === "native" && source !== "Source pending") return source;
  if (market.origin === "native") return status;
  return "Public source";
}

function toMarketView(market: NexMarket): MarketView {
  const ui = marketUiSummary(market);
  const priceLabel = marketPriceLabel(market, ui.price);
  const state = marketStateLabel(market);
  const volume = volumeValue(market);
  const traders = traderValue(market);
  const creator = ui.creator || market.creatorIdentity || "NexMarkets";

  return {
    id: market.id,
    source: market,
    title: market.title,
    category: marketCategoryLabel(market),
    state,
    stateClass: marketStateClass(market),
    status: ui.status,
    summary: market.question || ui.originDetail,
    price: ui.price,
    priceLabel,
    volume,
    traders,
    watchers: traders ?? 0,
    close: ui.close,
    creator,
    sourceType: sourceTypeLabel(market, ui.source, ui.status),
    createdAt: market.createdAt,
    canTrade: market.status === "trading_live" && market.origin !== "draft",
    noRoute: state === "No route",
    agentCreated: creator.includes(".agent")
  };
}

function buildRailGroups(markets: MarketView[]) {
  const groups = new Map<string, MarketView[]>();
  for (const market of markets) {
    const bucket = groups.get(market.category) ?? [];
    bucket.push(market);
    groups.set(market.category, bucket);
  }

  return [...groups.entries()]
    .map(([category, items]): RailGroup => {
      const sorted = [...items].sort((a, b) => b.volume - a.volume || String(b.createdAt).localeCompare(String(a.createdAt)));
      const totalVolume = sorted.reduce((sum, market) => sum + market.volume, 0);
      const routed = sorted.filter((market) => market.state === "Routed").length;
      const native = sorted.filter((market) => market.state === "Native").length;
      const route = routed ? `${routed} routed` : native ? `${native} native` : "No clean route";
      const strength = totalVolume >= 1000000 || sorted.length >= 4 ? "High" : sorted.length >= 2 || totalVolume > 0 ? "Medium" : "Low";

      return {
        category,
        strength,
        route,
        markets: sorted.slice(0, 4)
      };
    })
    .sort((a, b) => b.markets.length - a.markets.length)
    .slice(0, 4);
}

export function MarketsPage({ markets }: { markets: NexMarket[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("All");
  const [marketState, setMarketState] = useState("All");
  const [sort, setSort] = useState("Trending");
  const [search, setSearch] = useState("");
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);

  const marketViews = useMemo(() => markets.map(toMarketView), [markets]);
  const categories = useMemo(() => {
    const actual = [...new Set(marketViews.map((market) => market.category).filter(Boolean))];
    return [...fallbackCategories, ...actual.filter((item) => !fallbackCategories.includes(item))];
  }, [marketViews]);
  const railGroups = useMemo(() => buildRailGroups(marketViews), [marketViews]);

  const filteredMarkets = useMemo(() => {
    let arr = marketViews.slice();
    const query = search.trim().toLowerCase();
    if (query) {
      arr = arr.filter((market) => (
        `${market.title} ${market.category} ${market.state} ${market.summary} ${market.creator} ${market.sourceType}`
      ).toLowerCase().includes(query));
    }
    if (category !== "All") arr = arr.filter((market) => market.category === category);
    if (marketState !== "All") arr = arr.filter((market) => market.state === marketState);

    if (sort === "Volume") arr.sort((a, b) => b.volume - a.volume);
    else if (sort === "Closing soon") arr.sort((a, b) => closeSortValue(a.close) - closeSortValue(b.close));
    else if (sort === "Newest") arr.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    else arr.sort((a, b) => (b.volume + (b.price ?? 0) * 100000) - (a.volume + (a.price ?? 0) * 100000));

    return arr;
  }, [category, marketState, marketViews, search, sort]);

  function openDetail(market: MarketView, side?: "ride" | "fade") {
    setRouteInfo(null);
    const suffix = side ? `?side=${side}` : "";
    router.push(`/market/${encodeURIComponent(market.id)}${suffix}`);
  }

  function prefillLaunch(title: string) {
    setRouteInfo(null);
    router.push(title ? `/launch?thesis=${encodeURIComponent(title)}` : "/launch");
  }

  function cardClick(market: MarketView) {
    if (market.noRoute) prefillLaunch(market.title);
    else openDetail(market);
  }

  function cardKey(event: KeyboardEvent<HTMLElement>, market: MarketView) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    cardClick(market);
  }

  function showRouteInfo(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 290;
    setRouteInfo({
      left: Math.min(Math.max(12, rect.right - width + 6), Math.max(12, window.innerWidth - width - 12)),
      top: Math.min(Math.max(12, rect.bottom + 8), Math.max(12, window.innerHeight - 150))
    });
  }

  return (
    <section id="markets" className="view active">
      <section className="b2-final-page">
        <div className="b2-final-hero">
          <div>
            <div className="eyebrow"><i className="dot" /> Markets</div>
            <h1>Route first. Launch only when missing.</h1>
            <p>Search the market. If a clean route exists, trade it. If not, NexMind helps prepare a native draft for review.</p>
          </div>
          <div className="b2-final-actions">
            <button className="primary" type="button" onClick={() => router.push("/launch")}>Launch market</button>
            <button className="btn" type="button" onClick={() => setMarketState("Native")}>View native</button>
          </div>
        </div>

        <div className="v40-filter-panel b2-final-filter-panel">
          <label className="v40-search-wide">
            <span>Search</span>
            <input
              value={search}
              placeholder="Search markets, narratives, creators..."
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div>
            <span>Category</span>
            <div className="v40-inline-chips">
              {categories.map((item) => (
                <button key={item} className={category === item ? "active" : ""} type="button" onClick={() => setCategory(item)}>{item}</button>
              ))}
            </div>
          </div>
          <div>
            <span>Market type</span>
            <div className="v40-inline-chips">
              {stateList.map((item) => (
                <button key={item} className={marketState === item ? "active" : ""} type="button" onClick={() => setMarketState(item)}>{item}</button>
              ))}
            </div>
          </div>
          <div>
            <span>Sort</span>
            <div className="v40-inline-chips">
              {sortList.map((item) => (
                <button key={item} className={sort === item ? "active" : ""} type="button" onClick={() => setSort(item)}>{item}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="b2-final-layout">
          <main className="b2-final-list">
            <div className="v40-filter-summary">
              <span><strong>{filteredMarkets.length}</strong> markets shown</span>
              <div className="v40-inline-chips">
                <span>{category}</span>
                <span>{marketState}</span>
                <span>{sort}</span>
              </div>
            </div>
            {filteredMarkets.length ? (
              <div className="v40-market-grid">
                {filteredMarkets.map((market, index) => (
                  <Fragment key={market.id}>
                    <MarketCard
                      market={market}
                      onCardClick={cardClick}
                      onCardKey={cardKey}
                      onOpenDetail={openDetail}
                      onLaunch={prefillLaunch}
                      onRouteInfo={showRouteInfo}
                    />
                    {railGroups.length && (index === 1 || (index > 1 && (index + 1) % 4 === 0)) ? (
                      <MobileNarrativeRail
                        group={railGroups[index % railGroups.length]}
                        onOpenDetail={openDetail}
                        onLaunch={prefillLaunch}
                      />
                    ) : null}
                  </Fragment>
                ))}
              </div>
            ) : (
              <div className="b2-final-empty">
                <h3>No clean route found.</h3>
                <p>Draft this as a native market with NexMind. The thesis stays reviewable before launch.</p>
                <button className="primary" type="button" onClick={() => prefillLaunch(search.trim() || "New market thesis")}>
                  Draft as native market
                </button>
              </div>
            )}
          </main>
          <NarrativeRail groups={railGroups} onOpenDetail={openDetail} onLaunch={prefillLaunch} />
        </div>
      </section>

      {routeInfo ? (
        <div className="b2-final-info-pop" style={{ left: routeInfo.left, top: routeInfo.top }}>
          <button type="button" aria-label="Close" onClick={() => setRouteInfo(null)}>×</button>
          <b>Routed market</b>
          <p>This market is routed from Polymarket. Original rules and settlement apply. NexMarkets does not control routed-market resolution.</p>
        </div>
      ) : null}
    </section>
  );
}

function MarketCard({
  market,
  onCardClick,
  onCardKey,
  onOpenDetail,
  onLaunch,
  onRouteInfo
}: {
  market: MarketView;
  onCardClick: (market: MarketView) => void;
  onCardKey: (event: KeyboardEvent<HTMLElement>, market: MarketView) => void;
  onOpenDetail: (market: MarketView, side?: "ride" | "fade") => void;
  onLaunch: (title: string) => void;
  onRouteInfo: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <article
      className="v40-market-card b2-final-market-card"
      onClick={() => onCardClick(market)}
      onKeyDown={(event) => onCardKey(event, market)}
      role="button"
      tabIndex={0}
    >
      <div>
        <div className="v40-card-head">
          <div className="v40-card-id">
            <div className="v40-avatar">{creatorInitial(market)}</div>
            <div>
              <b>{market.creator}</b>
              <span>{market.category} · {market.sourceType}</span>
            </div>
          </div>
          <div className="b2-final-card-labels">
            <span className="b2-final-market-label">{market.category}</span>
            <MarketLabel market={market} onRouteInfo={onRouteInfo} />
          </div>
        </div>
        <h3 className="v40-card-title">{market.title}</h3>
        <p className="v40-card-summary">{market.summary || "Market with visible rules, source type and close time."}</p>
        <div className="v40-price-zone">
          <div className="v40-price-main">
            <span>{market.noRoute ? "Status" : "Current YES"}</span>
            <b>{market.noRoute ? "No route" : market.price === null ? market.priceLabel : pct(market.price)}</b>
          </div>
          <div className="v40-split-mini">
            <div className="v40-split-label"><span>Ride</span><span>Fade</span></div>
            <div className="v40-split-bar"><i style={{ width: `${splitPercent(market)}%` }} /></div>
          </div>
        </div>
        <div className="v40-card-metrics">
          <div className="v40-card-metric"><span>Volume</span><b>{market.noRoute ? "—" : fmt(market.volume)}</b></div>
          <div className="v40-card-metric">
            <span>Traders</span>
            <b>{market.noRoute ? `${market.watchers} watching` : (market.traders ?? 0).toLocaleString()}</b>
          </div>
          <div className="v40-card-metric"><span>Close</span><b>{market.close || "Set on launch"}</b></div>
        </div>
      </div>
      <div className="v40-card-actions" onClick={(event) => event.stopPropagation()}>
        {market.noRoute ? (
          <button className="launch" type="button" onClick={() => onLaunch(market.title)}>Launch native</button>
        ) : (
          <>
            <button className="ride" type="button" onClick={() => onOpenDetail(market, "ride")}>Ride</button>
            <button className="fade" type="button" onClick={() => onOpenDetail(market, "fade")}>Fade</button>
          </>
        )}
      </div>
    </article>
  );
}

function MarketLabel({ market, onRouteInfo }: { market: MarketView; onRouteInfo: (event: MouseEvent<HTMLButtonElement>) => void }) {
  if (market.state === "Routed") {
    return (
      <span className="b2-final-market-label routed">
        Routed market
        <button className="b2-final-info-dot" type="button" onClick={onRouteInfo} aria-label="Routed market details">i</button>
      </span>
    );
  }
  if (market.agentCreated) return <span className="b2-final-market-label agent">Agent-created</span>;
  if (market.state === "Native") return <span className="b2-final-market-label native">Native market</span>;
  return <span className="b2-final-market-label">{market.state}</span>;
}

function NarrativeRail({
  groups,
  onOpenDetail,
  onLaunch
}: {
  groups: RailGroup[];
  onOpenDetail: (market: MarketView, side?: "ride" | "fade") => void;
  onLaunch: (title: string) => void;
}) {
  return (
    <aside className="b2-final-rail">
      <div className="b2-final-rail-head">
        <div><span>Discovery rail</span><h3>Trending narratives</h3></div>
        <span>{groups.length} sectors</span>
      </div>
      <div className="b2-final-rail-cards">
        {groups.length ? groups.map((group) => (
          <NarrativeCard key={group.category} group={group} onOpenDetail={onOpenDetail} onLaunch={onLaunch} />
        )) : (
          <div className="b2-final-empty b2-final-rail-empty">
            <h3>No market sectors yet.</h3>
            <p>Live market sectors will appear here as routes and native launches are created.</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function MobileNarrativeRail({
  group,
  onOpenDetail,
  onLaunch
}: {
  group: RailGroup;
  onOpenDetail: (market: MarketView, side?: "ride" | "fade") => void;
  onLaunch: (title: string) => void;
}) {
  return (
    <div className="b2-final-mobile-narr">
      <NarrativeCard group={group} onOpenDetail={onOpenDetail} onLaunch={onLaunch} />
    </div>
  );
}

function NarrativeCard({
  group,
  onOpenDetail,
  onLaunch
}: {
  group: RailGroup;
  onOpenDetail: (market: MarketView, side?: "ride" | "fade") => void;
  onLaunch: (title: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <article className="b2-final-narr-card">
      <div className="b2-final-narr-top">
        <span className="b2-final-label">{group.category}</span>
        <span className="b2-final-label trend">Trending narrative</span>
      </div>
      <div className="b2-final-headlines">
        {group.markets.map((market) => (
          <div
            key={market.id}
            className={`b2-final-headline ${openId === market.id ? "open" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setOpenId((value) => value === market.id ? null : market.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setOpenId((value) => value === market.id ? null : market.id);
              }
            }}
          >
            <span className="b2-final-headline-title">{market.title}</span>
            <div className="b2-final-cta">
              <span>{market.noRoute ? "Launch market for this narrative?" : "Open this market?"}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (market.noRoute) onLaunch(market.title);
                  else onOpenDetail(market);
                }}
              >
                {market.noRoute ? "Draft market" : "Open market"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="b2-final-meta"><span>{group.strength} source strength</span><b>{group.route}</b></div>
    </article>
  );
}
