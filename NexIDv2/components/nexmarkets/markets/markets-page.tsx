"use client";

import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  asRecord,
  marketCategoryLabel,
  marketStateLabel,
  marketUiSummary,
  numberValue,
  polymarketRouteRaw,
} from "@/components/nexmarkets/market-ui";
import type { NexMarket } from "@/lib/types/nexmarkets";

const types = ["All", "Routed", "Native"] as const;
const sorts = ["Trending", "Volume", "Liquidity", "Newest", "Closes soon"] as const;
const marketBodyClasses = [
  "nmx141-detail-active",
  "nmx140-detail-active",
  "nmx139-detail-active",
  "nmx138-detail-active",
  "nmx137-detail-active",
  "nmx116-markets-active",
  "nmx116-detail-active"
];

const radarTopics = [
  { key: "hype-arb-market-cap", category: "Crypto", title: "Will HYPE flip ARB in market cap this month?", signal: "fresh liquidity debate", source: "Market cap feed", close: "30d", score: 94 },
  { key: "ai-video-top-10-app-store", category: "AI", title: "Will a new AI video app enter the App Store top 10 this week?", signal: "measurable ranking source", source: "App Store chart", close: "7d", score: 91 },
  { key: "osimhen-transfer-window", category: "Sports", title: "Will Osimhen transfer headlines resolve before the window closes?", signal: "high-volume fan market", source: "Club announcement", close: "45d", score: 88 },
  { key: "album-number-one-debut", category: "Culture", title: "Will the next major album debut at #1?", signal: "clean weekly outcome", source: "Billboard chart", close: "14d", score: 86 },
  { key: "open-source-voice-agents", category: "AI", title: "Will an open-source voice agent trend above closed demos this week?", signal: "developer velocity spike", source: "GitHub + X velocity", close: "7d", score: 84 },
  { key: "memecoin-volume-comeback", category: "Crypto", title: "Will memecoin volume beat AI token volume over the next 24h?", signal: "fast measurable spread", source: "DEX volume feed", close: "24h", score: 82 },
  { key: "cup-final-social-mentions", category: "Sports", title: "Will the cup final become the most discussed sports topic today?", signal: "discussion velocity", source: "Trend feed", close: "24h", score: 80 },
  { key: "creator-launch-week", category: "Culture", title: "Will a creator-led product launch cross 1M views this week?", signal: "attention breakout", source: "Public view counts", close: "7d", score: 78 }
] as const;

type MarketType = "Routed" | "Native" | "No market found";
type TypeFilter = typeof types[number];
type SortMode = typeof sorts[number];
type ViewMode = "cards" | "table";
type SheetName = "search" | "filters" | "radar" | null;
type RadarTopic = typeof radarTopics[number];

type MarketView = {
  id: string;
  source: NexMarket;
  title: string;
  category: string;
  type: MarketType;
  typeClass: string;
  status: NexMarket["status"];
  statusLabel: string;
  statusClass: string;
  canTrade: boolean;
  summary: string;
  yes: number | null;
  no: number | null;
  price: number | null;
  volume: number;
  liquidity: number;
  close: string;
  closeSort: number;
  creator: string;
  sourceType: string;
  createdAt: string;
  createdSort: number;
};

const CLIENT_CLOSEABLE_MARKET_STATUSES = new Set<NexMarket["status"]>(["live_pending_open", "trading_live"]);

function effectiveDisplayStatus(market: NexMarket, now = Date.now()): NexMarket["status"] {
  if (!CLIENT_CLOSEABLE_MARKET_STATUSES.has(market.status) || !market.closeTime) return market.status;
  const closeTime = Date.parse(market.closeTime);
  if (!Number.isFinite(closeTime) || closeTime > now) return market.status;
  return "closed";
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function volumeValue(market: NexMarket) {
  if (market.origin === "native") return market.nativeStats?.collateralUsdc ?? 0;
  const raw = asRecord(polymarketRouteRaw(market));
  return firstNumber(raw, ["volume24h", "volume24hr", "volume", "volumeNum", "volumeNumeric"]) ?? 0;
}

function liquidityValue(market: NexMarket) {
  if (market.origin === "native") {
    const stats = market.nativeStats;
    if (stats?.collateralUsdc && stats.collateralUsdc > 0) return stats.collateralUsdc;
    if (stats?.launchStakeUsdc && stats.launchStakeUsdc > 0) return stats.launchStakeUsdc;
    if (
      market.launchStakeStatus === "paid" ||
      ["live_pending_open", "trading_live", "closed", "result_proposed", "disputed", "settled"].includes(market.status)
    ) return 20;
    return 0;
  }
  const raw = asRecord(polymarketRouteRaw(market));
  return firstNumber(raw, ["liquidity", "liquidityNum", "liquidityNumeric"]) ?? 0;
}

function typeOf(market: NexMarket): MarketType {
  const state = marketStateLabel(market);
  if (/no route|no market/i.test(state)) return "No market found";
  if (/route/i.test(state)) return "Routed";
  if (/native/i.test(state)) return "Native";
  return "No market found";
}

function typeClass(type: MarketType) {
  return type.toLowerCase().replace(/\s+/g, "-");
}

function sourceTypeLabel(market: NexMarket, source: string, status: string) {
  if (market.origin === "polymarket") return "Routed market";
  if (market.origin === "native" && source !== "Source pending") return source;
  if (market.origin === "native") return status;
  return "Public source";
}

function closeSortValue(market: NexMarket, close: string) {
  const raw = asRecord(polymarketRouteRaw(market));
  const rawClose = market.closeTime ?? (typeof raw.expiry === "string" ? raw.expiry : null);
  if (rawClose) {
    const parsed = Date.parse(rawClose);
    if (Number.isFinite(parsed)) return parsed;
  }
  const label = String(close || "");
  if (/closed/i.test(label)) return Number.POSITIVE_INFINITY;
  const days = Number((label.match(/(\d+)d/) || [])[1] || 0);
  const hours = Number((label.match(/(\d+)h/) || [])[1] || 0);
  const relative = days * 24 + hours;
  if (relative) return relative;
  const parsed = Date.parse(label);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function createdSortValue(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMarketView(market: NexMarket, now?: number): MarketView {
  const status = effectiveDisplayStatus(market, now);
  const marketForUi = status === market.status ? market : { ...market, status };
  const volume = volumeValue(market);
  const liquidity = liquidityValue(market);
  const ui = marketUiSummary(marketForUi, volume, market.nativeStats ?? undefined);
  const type = typeOf(marketForUi);
  const yes = ui.price;
  const no = yes === null ? null : Math.max(0.01, Math.min(0.99, 1 - yes));
  const creator = ui.creator || market.creatorIdentity || "NexMarkets";
  const canTrade = status === "trading_live";

  return {
    id: market.id,
    source: marketForUi,
    title: market.title,
    category: marketCategoryLabel(market),
    type,
    typeClass: typeClass(type),
    status,
    statusLabel: ui.status,
    statusClass: status.toLowerCase().replace(/_/g, "-"),
    canTrade,
    summary: market.question || ui.originDetail,
    yes,
    no,
    price: yes,
    volume,
    liquidity,
    close: status === "closed" ? "Closed" : ui.close,
    closeSort: closeSortValue(marketForUi, status === "closed" ? "Closed" : ui.close),
    creator,
    sourceType: sourceTypeLabel(market, ui.source, ui.status),
    createdAt: market.createdAt,
    createdSort: createdSortValue(market.createdAt)
  };
}

function money(value: number) {
  const amount = Number(value || 0);
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(amount >= 100000 ? 0 : 1)}K`;
  return amount ? `$${amount.toFixed(0)}` : "—";
}

function pct(value: number | null) {
  return value == null ? "—" : `${Math.round(Number(value) * 100)}¢`;
}

function initials(market: MarketView) {
  return String((market.category || market.title || "N").trim()[0] || "N").toUpperCase();
}

function words(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !/will|the|this|that|with|over|next|into|before|after|week|month|today/.test(word));
}

function marketMatchesRadar(topic: RadarTopic, markets: MarketView[]) {
  const topicWords = words(topic.title);
  if (!topicWords.length) return false;
  return markets.some((market) => {
    const haystack = words([market.title, market.summary, market.category].join(" "));
    const hits = topicWords.filter((word) => haystack.includes(word)).length;
    return hits >= Math.min(3, Math.max(2, Math.ceil(topicWords.length * 0.42)));
  });
}

function rangePresets(max: number) {
  const resolved = Math.max(1000, Number(max || 1000));
  const readable = resolved >= 2000000
    ? [0, 100000, 250000, 500000, 1000000, Math.round(resolved)]
    : resolved >= 500000
      ? [0, 25000, 50000, 100000, 250000, Math.round(resolved)]
      : [0, 5000, 10000, 25000, 50000, Math.round(resolved)];
  return readable.filter((value, index, all) => value <= resolved && all.indexOf(value) === index).slice(0, 6);
}

function rangeStyle(fill: number) {
  return { "--fill": `${fill}%` } as CSSProperties;
}

function stopAndRun(event: MouseEvent<HTMLElement>, action: () => void) {
  event.preventDefault();
  event.stopPropagation();
  action();
}

export function MarketsPage({ markets }: { markets: NexMarket[] }) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [sort, setSort] = useState<SortMode>("Trending");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("cards");
  const [minVolume, setMinVolume] = useState(0);
  const [minLiquidity, setMinLiquidity] = useState(0);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [expandedRadarKey, setExpandedRadarKey] = useState<string | null>(null);
  const [claimedRadar, setClaimedRadar] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.body.classList.add("nmx137-markets-active");
    document.body.classList.remove(...marketBodyClasses);
    return () => {
      document.body.classList.remove("nmx137-markets-active");
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width:880px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem("nmx179ClaimedRadar") || "[]");
      if (Array.isArray(parsed)) setClaimedRadar(parsed.map(String));
    } catch {
      setClaimedRadar([]);
    }
  }, []);

  const marketViews = useMemo(() => markets.map((market) => toMarketView(market, now)), [markets, now]);
  const tradableMarkets = useMemo(() => marketViews.filter((market) => market.type !== "No market found"), [marketViews]);
  const maxVolume = useMemo(() => Math.max(1000, ...tradableMarkets.map((market) => market.volume)), [tradableMarkets]);
  const maxLiquidity = useMemo(() => Math.max(1000, ...tradableMarkets.map((market) => market.liquidity)), [tradableMarkets]);
  const total = tradableMarkets.length;
  const routed = useMemo(() => tradableMarkets.filter((market) => market.type === "Routed").length, [tradableMarkets]);
  const native = useMemo(() => tradableMarkets.filter((market) => market.type === "Native").length, [tradableMarkets]);

  const filteredMarkets = useMemo(() => {
    let arr = tradableMarkets.slice();
    const query = search.trim().toLowerCase();
    if (query) {
      arr = arr.filter((market) => (
        [market.title, market.summary, market.category, market.type, market.creator, market.sourceType]
          .join(" ")
          .toLowerCase()
          .includes(query)
      ));
    }
    if (typeFilter !== "All") arr = arr.filter((market) => market.type === typeFilter);
    if (minVolume > 0) arr = arr.filter((market) => market.volume >= minVolume);
    if (minLiquidity > 0) arr = arr.filter((market) => market.liquidity >= minLiquidity);

    if (sort === "Volume") arr.sort((a, b) => b.volume - a.volume);
    else if (sort === "Liquidity") arr.sort((a, b) => b.liquidity - a.liquidity);
    else if (sort === "Newest") arr.sort((a, b) => b.createdSort - a.createdSort);
    else if (sort === "Closes soon") arr.sort((a, b) => a.closeSort - b.closeSort);
    else arr.sort((a, b) => (b.volume + b.liquidity + (b.yes ?? 0) * 100000) - (a.volume + a.liquidity + (a.yes ?? 0) * 100000));

    return arr;
  }, [minLiquidity, minVolume, search, sort, tradableMarkets, typeFilter]);

  const radarPool = useMemo(() => {
    const claimed = new Set(claimedRadar);
    const day = Math.floor(Date.now() / 86400000);
    return radarTopics
      .filter((topic) => !claimed.has(topic.key) && !marketMatchesRadar(topic, tradableMarkets))
      .sort((a, b) => ((b.score + day * 3) % 97) - ((a.score + day * 5) % 97));
  }, [claimedRadar, tradableMarkets]);

  const activeChips = useMemo(() => {
    const chips: string[] = [];
    if (typeFilter !== "All") chips.push(typeFilter);
    if (sort !== "Trending") chips.push(sort);
    if (search) chips.push(`Search: ${search}`);
    if (minVolume > 0) chips.push(`Vol ≥ ${money(minVolume)}`);
    if (minLiquidity > 0) chips.push(`Liq ≥ ${money(minLiquidity)}`);
    return chips;
  }, [minLiquidity, minVolume, search, sort, typeFilter]);

  function openMarket(market: MarketView, side?: "ride" | "fade") {
    const suffix = side ? `?side=${side}` : "";
    router.push(`/market/${encodeURIComponent(market.id)}${suffix}`);
  }

  function claimRadar(topic: RadarTopic) {
    setClaimedRadar((current) => {
      const next = [...new Set([...current, topic.key])];
      try {
        window.localStorage.setItem("nmx179ClaimedRadar", JSON.stringify(next));
      } catch {
        // localStorage can be unavailable in hardened browsers.
      }
      return next;
    });
  }

  function prefillLaunch(topic?: string) {
    const thesis = String(topic || search || "New market thesis").trim() || "New market thesis";
    setSheet(null);
    router.push(`/launch?thesis=${encodeURIComponent(thesis)}`);
  }

  function launchRadar(topic: RadarTopic) {
    claimRadar(topic);
    prefillLaunch(topic.title);
  }

  function resetFilters() {
    setTypeFilter("All");
    setSort("Trending");
    setSearch("");
    setMinVolume(0);
    setMinLiquidity(0);
  }

  return (
    <section id="narratives" className="view active">
      <section className="nmx179 nmx182">
        <div className="nmx179-hero nmx180-hero nmx182-head">
          <div className="nmx182-head-copy">
            <div className="nmx179-kicker">Markets</div>
            <h1>Search before you launch.</h1>
            <p>Browse existing markets. Launch appears when nothing matches.</p>
          </div>
          <div className="nmx179-proof nmx182-proof">
            <div><span>Routed</span><b>{routed}</b></div>
            <div><span>Native</span><b>{native}</b></div>
            <div><span>Shown</span><b>{filteredMarkets.length}/{total}</b></div>
            <div><span>Radar</span><b>{radarPool.length}</b></div>
          </div>
        </div>

        <div className="nmx179-layout">
          <div className="nmx179-desktop-filter">
            <FilterRail
              count={filteredMarkets.length}
              search={search}
              setSearch={setSearch}
              view={view}
              setView={setView}
              typeFilter={typeFilter}
              setTypeFilter={setTypeFilter}
              sort={sort}
              setSort={setSort}
              minVolume={minVolume}
              setMinVolume={setMinVolume}
              minLiquidity={minLiquidity}
              setMinLiquidity={setMinLiquidity}
              maxVolume={maxVolume}
              maxLiquidity={maxLiquidity}
              radarPool={radarPool}
              setSheet={setSheet}
              resetFilters={resetFilters}
              prefillLaunch={prefillLaunch}
              launchRadar={launchRadar}
            />
          </div>
          <main className="nmx179-main">
            <div className="nmx179-feedbar nmx183-feedbar">
              <div>
                {activeChips.length ? (
                  <div className="nmx179-activechips">
                    {activeChips.map((chip) => <span key={chip}>{chip}</span>)}
                  </div>
                ) : (
                  <span className="nmx183-feed-title">Live markets</span>
                )}
              </div>
              <div className="nmx183-feed-count">Showing {filteredMarkets.length} of {total}</div>
            </div>

            {filteredMarkets.length ? (
              isMobile ? (
                <MobileMarketFeed markets={filteredMarkets} openMarket={openMarket} />
              ) : view === "cards" ? (
                <MarketCards markets={filteredMarkets} openMarket={openMarket} />
              ) : (
                <MarketTable markets={filteredMarkets} openMarket={openMarket} />
              )
            ) : (
              <EmptyMarkets search={search} resetFilters={resetFilters} prefillLaunch={prefillLaunch} setSearch={setSearch} />
            )}
          </main>
        </div>

        <MobileDock sheet={sheet} setSheet={setSheet} prefillLaunch={prefillLaunch} />
        <MobileSheet
          sheet={sheet}
          setSheet={setSheet}
          search={search}
          setSearch={setSearch}
          markets={filteredMarkets}
          count={filteredMarkets.length}
          openMarket={openMarket}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          sort={sort}
          setSort={setSort}
          minVolume={minVolume}
          setMinVolume={setMinVolume}
          minLiquidity={minLiquidity}
          setMinLiquidity={setMinLiquidity}
          maxVolume={maxVolume}
          maxLiquidity={maxLiquidity}
          resetFilters={resetFilters}
          prefillLaunch={prefillLaunch}
          radarPool={radarPool}
          expandedRadarKey={expandedRadarKey}
          setExpandedRadarKey={setExpandedRadarKey}
          launchRadar={launchRadar}
        />
      </section>
    </section>
  );
}

function FilterRail({
  count,
  search,
  setSearch,
  view,
  setView,
  typeFilter,
  setTypeFilter,
  sort,
  setSort,
  minVolume,
  setMinVolume,
  minLiquidity,
  setMinLiquidity,
  maxVolume,
  maxLiquidity,
  radarPool,
  setSheet,
  resetFilters,
  prefillLaunch,
  launchRadar
}: {
  count: number;
  search: string;
  setSearch: (value: string) => void;
  view: ViewMode;
  setView: (value: ViewMode) => void;
  typeFilter: TypeFilter;
  setTypeFilter: (value: TypeFilter) => void;
  sort: SortMode;
  setSort: (value: SortMode) => void;
  minVolume: number;
  setMinVolume: (value: number) => void;
  minLiquidity: number;
  setMinLiquidity: (value: number) => void;
  maxVolume: number;
  maxLiquidity: number;
  radarPool: RadarTopic[];
  setSheet: (value: SheetName) => void;
  resetFilters: () => void;
  prefillLaunch: (topic?: string) => void;
  launchRadar: (topic: RadarTopic) => void;
}) {
  return (
    <aside className="nmx179-rail nmx180-rail nmx182-rail">
      <div className="nmx180-rail-title nmx182-rail-title">
        <div><span className="nmx179-kicker">Filters</span><b>{count} markets</b></div>
        <button className="nmx179-reset" type="button" onClick={resetFilters}>Reset</button>
      </div>
      <SearchBox slot="rail" search={search} setSearch={setSearch} setSheet={setSheet} />
      <ViewSeg view={view} setView={setView} />
      <FilterGroup label="Type" active={typeFilter} items={types} onSelect={(value) => setTypeFilter(value as TypeFilter)} />
      <RangeBox label="Min volume" value={minVolume} max={maxVolume} onChange={setMinVolume} />
      <RangeBox label="Min liquidity" value={minLiquidity} max={maxLiquidity} onChange={setMinLiquidity} />
      <FilterGroup label="Sort by" active={sort} items={sorts} onSelect={(value) => setSort(value as SortMode)} />
      <RadarMini radarPool={radarPool} setSheet={setSheet} launchRadar={launchRadar} />
      <button className="nmx179-rail-launch nmx180-secondary-launch" type="button" onClick={() => prefillLaunch()}>
        Create market
      </button>
    </aside>
  );
}

function SearchBox({
  slot,
  search,
  setSearch,
  setSheet
}: {
  slot: string;
  search: string;
  setSearch: (value: string) => void;
  setSheet: (value: SheetName) => void;
}) {
  return (
    <div className="nmx179-box nmx180-searchbox">
      <label><span>Search</span><b>{search ? "Active" : "Find markets"}</b></label>
      <div className="nmx179-search">
        <input
          value={search}
          placeholder="Search live markets…"
          data-nmx179-search
          data-slot={slot}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="button" data-nmx179-search-btn onClick={() => { if (!search) setSheet("search"); }}>
          {search ? "Go" : "Search"}
        </button>
      </div>
    </div>
  );
}

function ViewSeg({ view, setView }: { view: ViewMode; setView: (value: ViewMode) => void }) {
  return (
    <div className="nmx179-box">
      <label><span>View</span><b>{view === "cards" ? "Cards" : "Table"}</b></label>
      <div className="nmx179-view">
        <button className={view === "table" ? "active" : ""} type="button" data-nmx179-view="table" onClick={() => setView("table")}>Table</button>
        <button className={view === "cards" ? "active" : ""} type="button" data-nmx179-view="cards" onClick={() => setView("cards")}>Cards</button>
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  active,
  items,
  onSelect
}: {
  label: string;
  active: string;
  items: readonly string[];
  onSelect: (value: string) => void;
}) {
  return (
    <div className="nmx179-box">
      <label><span>{label}</span><b>{active || "All"}</b></label>
      <div className="nmx179-chip">
        {items.map((item) => (
          <button
            key={item}
            className={active === item ? "active" : ""}
            type="button"
            data-nmx179-filter={label}
            data-value={item}
            onClick={() => onSelect(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function RangeBox({
  label,
  value,
  max,
  onChange
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const resolvedMax = Math.max(1000, Number(max || 1000));
  const resolvedValue = Math.min(Number(value || 0), resolvedMax);
  const step = Math.max(100, Math.round(resolvedMax / 160));
  const fill = Math.max(0, Math.min(100, (resolvedValue / resolvedMax) * 100));
  const presets = rangePresets(resolvedMax);

  return (
    <div className="nmx179-box nmx179-range nmx180-range">
      <div className="nmx179-range-top"><span>{label}</span><b data-nmx179-range-value>{resolvedValue ? money(resolvedValue) : "Any"}</b></div>
      <input
        type="range"
        min="0"
        max={resolvedMax}
        step={step}
        value={resolvedValue}
        style={rangeStyle(fill)}
        data-nmx179-range={label}
        aria-label={label}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value || 0)))}
      />
      <div className="nmx180-range-scale"><span>Any</span><span>{money(resolvedMax)}</span></div>
      <div className="nmx180-range-presets">
        {presets.map((preset) => (
          <button
            key={preset}
            className={Number(preset) === Number(resolvedValue) ? "active" : ""}
            type="button"
            data-nmx179-range-preset={label}
            data-value={preset}
            onClick={() => onChange(preset)}
          >
            {preset ? money(preset) : "Any"}
          </button>
        ))}
      </div>
    </div>
  );
}

function Badge({ market }: { market: MarketView }) {
  return <span className={`nmx179-badge ${market.typeClass}`}>{market.type}</span>;
}

function StatusPill({ market }: { market: MarketView }) {
  return <span className={`nmx179-open ${market.statusClass}`}>{market.statusLabel}</span>;
}

function closeMetaLabel(market: MarketView) {
  return market.close === "Closed" ? "Closed" : `Close ${market.close || "--"}`;
}

function RadarMini({
  radarPool,
  setSheet,
  launchRadar
}: {
  radarPool: RadarTopic[];
  setSheet: (value: SheetName) => void;
  launchRadar: (topic: RadarTopic) => void;
}) {
  const pool = radarPool.slice(0, 2);
  return (
    <div className="nmx179-box nmx179-rail-radar nmx180-rail-radar">
      <div className="nmx179-rail-radar-head"><span>Radar</span><button className="nmx179-link" type="button" data-nmx179-sheet="radar" onClick={() => setSheet("radar")}>View</button></div>
      <div className="nmx183-scan-dot">NexMind suggestions</div>
      {pool.length ? pool.map((topic) => (
        <button key={topic.key} className="nmx179-mini-topic" type="button" data-nmx179-radar-launch={topic.key} onClick={() => launchRadar(topic)}>
          <b>{topic.title}</b>
          <span>{topic.category} · {topic.signal}</span>
        </button>
      )) : (
        <div className="nmx179-mini-topic"><b>Watchlist is clear.</b><span>Every launchable idea is already covered.</span></div>
      )}
    </div>
  );
}

function MarketCards({ markets, openMarket }: { markets: MarketView[]; openMarket: (market: MarketView, side?: "ride" | "fade") => void }) {
  return (
    <div className="nmx179-grid">
      {markets.map((market) => (
        <article
          key={market.id}
          className="nmx179-card"
          data-nmx179-open={market.id}
          role="button"
          tabIndex={0}
          onClick={() => openMarket(market)}
          onKeyDown={(event) => handleMarketKey(event, () => openMarket(market))}
        >
          <div className="nmx179-card-top"><div><Badge market={market} /></div><StatusPill market={market} /></div>
          <h3>{market.title}</h3>
          <div className="nmx179-meta"><span>{market.category || "Market"}</span><span>{closeMetaLabel(market)}</span><span>Vol {money(market.volume)}</span></div>
          <div className="nmx179-quotes">
            <div className="nmx179-quote ride"><span>Ride</span><b>{pct(market.yes ?? market.price)}</b></div>
            <div className="nmx179-quote fade"><span>Fade</span><b>{pct(market.no)}</b></div>
          </div>
          <div className="nmx179-card-foot">
            <span>Liq {money(market.liquidity)}</span>
            <div className="nmx179-card-actions">
              {market.canTrade ? (
                <>
                  <button className="nmx179-side ride" type="button" data-nmx179-open={market.id} data-nmx179-side="ride" onClick={(event) => stopAndRun(event, () => openMarket(market, "ride"))}>Ride</button>
                  <button className="nmx179-side fade" type="button" data-nmx179-open={market.id} data-nmx179-side="fade" onClick={(event) => stopAndRun(event, () => openMarket(market, "fade"))}>Fade</button>
                </>
              ) : (
                <button className="nmx179-side" type="button" data-nmx179-open={market.id} onClick={(event) => stopAndRun(event, () => openMarket(market))}>View</button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function MarketTable({ markets, openMarket }: { markets: MarketView[]; openMarket: (market: MarketView, side?: "ride" | "fade") => void }) {
  return (
    <div className="nmx179-tablewrap">
      <table className="nmx179-table">
        <thead>
          <tr><th>Market</th><th>Type</th><th>Ride</th><th>Fade</th><th>Volume</th><th>Liquidity</th><th>Close</th><th /></tr>
        </thead>
        <tbody>
          {markets.map((market) => (
            <tr key={market.id} data-nmx179-open={market.id} onClick={() => openMarket(market)}>
              <td>
                <div className="nmx179-market-cell">
                  <span className="nmx179-orb">{initials(market)}</span>
                  <div><b>{market.title}</b><br /><span className="nmx179-muted">{market.category} · {market.sourceType || "Source"}</span></div>
                </div>
              </td>
              <td><Badge market={market} /></td>
              <td><b>{pct(market.yes ?? market.price)}</b></td>
              <td><b>{pct(market.no)}</b></td>
              <td>{money(market.volume)}</td>
              <td>{money(market.liquidity)}</td>
              <td>{market.close || "—"}</td>
              <td><button className="nmx179-btn" type="button" data-nmx179-open={market.id} onClick={(event) => stopAndRun(event, () => openMarket(market))}>{market.canTrade ? "Open" : "View"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileMarketFeed({ markets, openMarket }: { markets: MarketView[]; openMarket: (market: MarketView, side?: "ride" | "fade") => void }) {
  return (
    <div className="nmx185-mobile-feed" aria-label="Live markets">
      {markets.map((market) => (
        <article key={market.id} className="nmx185-mobile-card" data-nmx179-open={market.id} onClick={() => openMarket(market)}>
          <div className="nmx185-card-glow" />
          <header className="nmx185-card-head">
            <div className="nmx185-meta"><span className={`nmx185-badge ${market.type === "Native" ? "native" : "routed"}`}>{market.type}</span><span>{market.category || "Market"}</span></div>
            <button className={`nmx185-open ${market.statusClass}`} type="button" data-nmx179-open={market.id} onClick={(event) => stopAndRun(event, () => openMarket(market))}>{market.canTrade ? "Open" : market.statusLabel}</button>
          </header>
          <h3>{market.title}</h3>
          <div className="nmx185-trade-grid">
            <button className="nmx185-trade ride" type="button" data-nmx179-open={market.id} data-nmx179-side="ride" disabled={!market.canTrade} onClick={(event) => stopAndRun(event, () => openMarket(market, "ride"))}><span>Ride</span><b>{pct(market.yes ?? market.price)}</b></button>
            <button className="nmx185-trade fade" type="button" data-nmx179-open={market.id} data-nmx179-side="fade" disabled={!market.canTrade} onClick={(event) => stopAndRun(event, () => openMarket(market, "fade"))}><span>Fade</span><b>{pct(market.no)}</b></button>
          </div>
          <footer className="nmx185-card-foot">
            <div><span>Volume</span><b>{money(market.volume)}</b></div>
            <div><span>Liquidity</span><b>{money(market.liquidity || 0)}</b></div>
            <div><span>{market.close === "Closed" ? "Status" : "Closes"}</span><b>{market.close || "—"}</b></div>
          </footer>
        </article>
      ))}
    </div>
  );
}

function EmptyMarkets({
  search,
  resetFilters,
  prefillLaunch,
  setSearch
}: {
  search: string;
  resetFilters: () => void;
  prefillLaunch: (topic?: string) => void;
  setSearch: (value: string) => void;
}) {
  const term = search.trim();
  if (term) {
    return (
      <div className="nmx179-empty nmx180-empty-search">
        <b>No live market for “{term}”.</b>
        <p>NexMind can turn this into a clean market draft only because no matching live market exists.</p>
        <div className="nmx179-empty-actions">
          <button className="nmx179-primary" type="button" data-nmx179-launch-search onClick={() => prefillLaunch(term)}>Launch with NexMind</button>
          <button className="nmx179-clear" type="button" data-nmx179-clear-search onClick={() => setSearch("")}>Clear search</button>
        </div>
      </div>
    );
  }
  return (
    <div className="nmx179-empty">
      <b>No matching live markets.</b>
      <p>Adjust filters or reset the markets menu.</p>
      <div className="nmx179-empty-actions">
        <button className="nmx179-clear" type="button" data-nmx179-reset onClick={resetFilters}>Reset filters</button>
      </div>
    </div>
  );
}

function MobileDock({ sheet, setSheet, prefillLaunch }: { sheet: SheetName; setSheet: (value: SheetName) => void; prefillLaunch: (topic?: string) => void }) {
  return (
    <nav className="nmx179-mobile-dock nmx180-mobile-dock" aria-label="Markets actions">
      <button className={sheet === "search" ? "active" : ""} type="button" data-nmx179-sheet="search" onClick={() => setSheet("search")}><DockIcon name="search" /><span>Search</span></button>
      <button className={sheet === "filters" ? "active" : ""} type="button" data-nmx179-sheet="filters" onClick={() => setSheet("filters")}><DockIcon name="filters" /><span>Filters</span></button>
      <button className={sheet === "radar" ? "active" : ""} type="button" data-nmx179-sheet="radar" onClick={() => setSheet("radar")}><DockIcon name="radar" /><span>Radar</span></button>
      <button type="button" data-nmx179-launch-empty onClick={() => prefillLaunch()}><DockIcon name="launch" /><span>Launch</span></button>
    </nav>
  );
}

function DockIcon({ name }: { name: "search" | "filters" | "radar" | "launch" }) {
  return (
    <span className="nmx180-dock-icon">
      {name === "search" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>
      ) : name === "filters" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M7 12h10" /><path d="M10 17h4" /></svg>
      ) : name === "radar" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4L12 3z" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
      )}
    </span>
  );
}

function MobileSheet({
  sheet,
  setSheet,
  search,
  setSearch,
  markets,
  count,
  openMarket,
  typeFilter,
  setTypeFilter,
  sort,
  setSort,
  minVolume,
  setMinVolume,
  minLiquidity,
  setMinLiquidity,
  maxVolume,
  maxLiquidity,
  resetFilters,
  prefillLaunch,
  radarPool,
  expandedRadarKey,
  setExpandedRadarKey,
  launchRadar
}: {
  sheet: SheetName;
  setSheet: (value: SheetName) => void;
  search: string;
  setSearch: (value: string) => void;
  markets: MarketView[];
  count: number;
  openMarket: (market: MarketView, side?: "ride" | "fade") => void;
  typeFilter: TypeFilter;
  setTypeFilter: (value: TypeFilter) => void;
  sort: SortMode;
  setSort: (value: SortMode) => void;
  minVolume: number;
  setMinVolume: (value: number) => void;
  minLiquidity: number;
  setMinLiquidity: (value: number) => void;
  maxVolume: number;
  maxLiquidity: number;
  resetFilters: () => void;
  prefillLaunch: (topic?: string) => void;
  radarPool: RadarTopic[];
  expandedRadarKey: string | null;
  setExpandedRadarKey: (value: string | null) => void;
  launchRadar: (topic: RadarTopic) => void;
}) {
  if (!sheet) return <><div className="nmx179-sheet-backdrop" /><div className="nmx179-sheet" /></>;

  const title = sheet === "search"
    ? ["Search markets", "Search existing markets first."]
    : sheet === "filters"
      ? ["Refine markets", "Filter by market type, volume and liquidity."]
      : ["Radar", "Powered by NexMind — market ideas ready to draft."];

  return (
    <>
      <div className="nmx179-sheet-backdrop open" data-nmx179-close-sheet onClick={() => setSheet(null)} />
      <section className="nmx179-sheet open">
        <div className="nmx179-sheet-title">
          <div><b>{title[0]}</b><span>{title[1]}</span></div>
          <button className="nmx179-close" type="button" data-nmx179-close-sheet onClick={() => setSheet(null)}>×</button>
        </div>
        {sheet === "search" ? (
          <>
            <SearchBox slot="search" search={search} setSearch={setSearch} setSheet={setSheet} />
            <SearchResults search={search} markets={markets} openMarket={openMarket} prefillLaunch={prefillLaunch} setSearch={setSearch} />
          </>
        ) : sheet === "filters" ? (
          <>
            <FilterGroup label="Type" active={typeFilter} items={types} onSelect={(value) => setTypeFilter(value as TypeFilter)} />
            <RangeBox label="Min volume" value={minVolume} max={maxVolume} onChange={setMinVolume} />
            <RangeBox label="Min liquidity" value={minLiquidity} max={maxLiquidity} onChange={setMinLiquidity} />
            <FilterGroup label="Sort by" active={sort} items={sorts} onSelect={(value) => setSort(value as SortMode)} />
            <div className="nmx179-sheet-actions">
              <button className="reset" type="button" data-nmx179-reset onClick={resetFilters}>Reset</button>
              <button className="show" type="button" data-nmx179-close-sheet onClick={() => setSheet(null)}>Show {count} markets</button>
            </div>
          </>
        ) : (
          <div className="nmx179-sheet-radar">
            <RadarIntro />
            {radarPool.length ? radarPool.map((topic) => (
              <RadarCard
                key={topic.key}
                topic={topic}
                expanded={expandedRadarKey === topic.key}
                setExpandedRadarKey={setExpandedRadarKey}
                launchRadar={launchRadar}
              />
            )) : (
              <div className="nmx179-empty"><b>Watchlist is clear.</b><p>Every launchable idea is already covered by a market.</p></div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

function SearchResults({
  search,
  markets,
  openMarket,
  prefillLaunch,
  setSearch
}: {
  search: string;
  markets: MarketView[];
  openMarket: (market: MarketView, side?: "ride" | "fade") => void;
  prefillLaunch: (topic?: string) => void;
  setSearch: (value: string) => void;
}) {
  const term = search.trim();
  return (
    <div className="nmx179-search-results">
      {markets.slice(0, 6).map((market) => (
        <button key={market.id} className="nmx179-suggestion" type="button" data-nmx179-open={market.id} onClick={() => openMarket(market)}>
          <b>{market.title}</b>
          <span>{market.type} · {market.category} · {money(market.volume)} volume</span>
        </button>
      ))}
      {term && markets.length === 0 ? (
        <div className="nmx179-empty nmx180-empty-search">
          <b>No live market yet.</b>
          <p>NexMind can draft “{term}” because this search did not return a market.</p>
          <div className="nmx179-empty-actions">
            <button className="nmx179-primary" type="button" data-nmx179-launch-search onClick={() => prefillLaunch(term)}>Launch with NexMind</button>
            <button className="nmx179-clear" type="button" data-nmx179-clear-search onClick={() => setSearch("")}>Clear</button>
          </div>
        </div>
      ) : !term && markets.length === 0 ? (
        <div className="nmx180-search-hint">Start typing to search live markets.</div>
      ) : null}
    </div>
  );
}

function RadarIntro() {
  return (
    <div className="nmx183-radar-intro">
      <div className="nmx183-radar-orb"><i /></div>
      <div><b>Radar is powered by NexMind.</b><span>It scans fast-moving topics and shows market ideas ready to draft.</span></div>
    </div>
  );
}

function RadarCard({
  topic,
  expanded,
  setExpandedRadarKey,
  launchRadar
}: {
  topic: RadarTopic;
  expanded: boolean;
  setExpandedRadarKey: (value: string | null) => void;
  launchRadar: (topic: RadarTopic) => void;
}) {
  return (
    <article
      className={`nmx179-radar-card nmx183-radar-card ${expanded ? "expanded" : ""}`}
      data-nmx179-radar-toggle={topic.key}
      role="button"
      tabIndex={0}
      onClick={() => setExpandedRadarKey(expanded ? null : topic.key)}
      onKeyDown={(event) => handleMarketKey(event, () => setExpandedRadarKey(expanded ? null : topic.key))}
    >
      <div className="top"><span className="nmx179-pill">{topic.category} · Radar</span><strong className="nmx183-scan-dot">{topic.score}% signal</strong></div>
      <div>
        <h3>{topic.title}</h3>
        <p>{topic.signal}. NexMind found enough structure for a clear draft.</p>
        <div className="nmx183-radar-metrics">
          <div><span>Source</span><b>{topic.source}</b></div>
          <div><span>Window</span><b>{topic.close}</b></div>
          <div><span>Status</span><b>Launchable</b></div>
        </div>
      </div>
      <div className="nmx179-radar-actions">
        <span>Create this before the crowd asks.</span>
        <button className="nmx179-primary" type="button" data-nmx179-radar-launch={topic.key} onClick={(event) => stopAndRun(event, () => launchRadar(topic))}>Create market</button>
      </div>
    </article>
  );
}

function handleMarketKey(event: KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  if ((event.target as HTMLElement).closest("button")) return;
  event.preventDefault();
  action();
}
