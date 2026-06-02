"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { WalletChoiceButton, useWalletSession } from "@/components/nexid/shared/wallet-session";
import { toTitleLabel } from "@/components/nexmarkets/copy";
import { displayReferralUrl } from "@/lib/appBaseUrl";
import { resolvePrimaryDomainName, stripIdSuffix } from "@/lib/identity";
import { fetchDashboardApi, renderCardApi } from "@/lib/services/nexid-client";
import type { DashboardSnapshot, Position, Receipt } from "@/lib/types/nexid";

const emptyDashboard: DashboardSnapshot = {
  user: null,
  positions: [],
  receipts: [],
  points: { total: 0, rank: "Unranked", season: "Season 1", events: [] },
  idNames: [],
  referralStats: { clicks: 0, signups: 0, mints: 0, pending: 0, paid: 0, copied: 0, shared: 0 },
  referralEvents: [],
  rewards: {
    seasonCode: "",
    seasonTitle: "Rewards",
    status: "not_qualified",
    level: "Scout",
    badge: "Signal Scout",
    lifetimePoints: 0,
    weeklyScore: 0,
    rewardPoolUsd: 0,
    pendingUsd: 0,
    paidUsd: 0,
    projectedUsd: 0,
    feePaidUsd: 0,
    eligibleVolumeUsd: 0,
    nextLevel: { level: "Analyst", badge: "Edge Analyst", minPoints: 1000 },
    progressPct: 0,
    riskFlag: null
  }
};

const tabs = [
  ["overview", "Overview", "Command"],
  ["markets", "Markets", "Positions"],
  ["receipts", "Receipts", "Proof"],
  ["earnings", "Earnings", "Rewards"],
  ["activity", "Activity", "Timeline"],
  ["id", "My .id", "Passport"]
] as const;

type DashboardTab = (typeof tabs)[number][0];

function isDashboardTab(value: string | null | undefined): value is DashboardTab {
  return tabs.some(([key]) => key === value);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
}

function shortMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function positionStatusLabel(value?: string | null) {
  if (!value) return "Tracked";
  if (value === "partial_fill") return "Part filled";
  return toTitleLabel(value);
}

function receiptVerb(receipt: Receipt) {
  if (receipt.side === "ride") return "Rode";
  if (receipt.side === "fade") return "Faded";
  if (receipt.side === "launch") return "Launched";
  if (receipt.side === "settlement") return "Settled";
  if (receipt.side === "invalid") return "Invalidated";
  return "Saved";
}

function receiptHeadline(receipt: Receipt) {
  if (receipt.returnPct !== 0) return `${receipt.returnPct > 0 ? "+" : ""}${receipt.returnPct}%`;
  return receipt.rank || receipt.proofLevel;
}

function firstLetter(value: string) {
  return (value.trim().replace(/[^a-z0-9]/gi, "").slice(0, 1) || "N").toUpperCase();
}

function walletShort(value?: string | null) {
  if (!value) return "Not connected";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function icon(key: DashboardTab) {
  return { overview: "O", markets: "M", receipts: "R", earnings: "$", activity: "A", id: "ID" }[key];
}

function TabButton({ item, active, onClick }: { item: (typeof tabs)[number]; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick} type="button">
      <span><i>{icon(item[0])}</i>{item[1]}</span>
      <small>{item[2]}</small>
    </button>
  );
}

function D82Row({ title, body, meta, action }: { title: string; body: string; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="d82-row">
      <div><h4>{title}</h4><p>{body}</p></div>
      <div className="d82-row-meta">{meta}{action}</div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="d82-stat"><span>{label}</span><b>{value}</b>{sub ? <em>{sub}</em> : null}</div>;
}

export function DashboardPageClient({ appBaseUrl }: { appBaseUrl: string }) {
  const [dashboard, setDashboard] = useState<DashboardSnapshot>(emptyDashboard);
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [message, setMessage] = useState("");
  const wallet = useWalletSession(dashboard.user);

  async function refresh() {
    const next = await fetchDashboardApi();
    setDashboard(next);
    wallet.setUser(next.user);
  }

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, []);

  useEffect(() => {
    const applyRequestedTab = (value?: string | null) => {
      const requested = value ?? window.sessionStorage.getItem("nexmarkets_dashboard_tab");
      if (isDashboardTab(requested)) setTab(requested);
    };
    const onDashboardTab = (event: Event) => {
      applyRequestedTab((event as CustomEvent<{ tab?: string }>).detail?.tab);
    };

    applyRequestedTab();
    window.addEventListener("nexmarkets:dashboard-tab", onDashboardTab);
    return () => window.removeEventListener("nexmarkets:dashboard-tab", onDashboardTab);
  }, []);

  async function renderCard(type: string, title: string, payload?: Record<string, unknown>) {
    try {
      const card = await renderCardApi({ type, title, payload });
      setMessage(`Card ready: ${card.publicUrl}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Card render failed.");
    }
  }

  const primaryId = dashboard.user?.primaryIdName ?? dashboard.idNames.find((item) => item.isPrimary)?.name ?? "";
  const livePrimaryDomain = dashboard.user ? wallet.primaryDomainName : null;
  const storedPrimaryDomain = resolvePrimaryDomainName(dashboard.user);
  const displayDomain = primaryId ? `${stripIdSuffix(primaryId)}.id` : livePrimaryDomain ?? storedPrimaryDomain ?? "";
  const identity = displayDomain || walletShort(dashboard.user?.walletAddress);
  const claimable = dashboard.rewards.pendingUsd + dashboard.referralStats.pending;
  const progress = Math.max(0, Math.min(100, dashboard.rewards.progressPct || 0));
  const openPositions = dashboard.positions.filter((position) => position.status === "live" || position.status === "partial_fill" || position.status === "filled");
  const launchedMarkets = dashboard.receipts.filter((receipt) => receipt.side === "launch");
  const letter = firstLetter(identity);

  return (
    <section id="dashboard" className="view active">
      <div className="d82">
        <section className="d82-hero">
          <div>
            <span className="d82-kicker"><i className="d82-dot" /> Dashboard</span>
            <h1>{identity}</h1>
            <p>This is where your trades, launches, receipts, earnings and .id record come together.</p>
            <div className="d82-hero-actions">
              <Link className="primary" href="/launch">Launch market</Link>
              <Link className="btn" href="/markets">Trade</Link>
              <Link className="btn" href="/edgeboard">Check rank</Link>
            </div>
            <div className="d82-rhythm">
              <div><span>Rank</span><b>{dashboard.points.rank}</b></div>
              <div><span>This week</span><b>{Math.round(dashboard.rewards.weeklyScore).toLocaleString()}</b></div>
              <div><span>Receipts</span><b>{dashboard.receipts.length}</b></div>
              <div><span>Claimable</span><b>{money(claimable)}</b></div>
            </div>
          </div>
          <aside className="d82-passport-card">
            <div>
              <div className="d82-avatar-row"><div className="d82-avatar">{letter}</div><span className="d82-pill gold">{displayDomain ? "Active .id" : "Wallet"}</span></div>
              <h3>{displayDomain ? "Passport active" : "No .id yet"}</h3>
              <p>{displayDomain ? "Receipts, rewards and referrals are attached to this identity." : "Mint .id when you want receipts, rewards and referrals attached to one name."}</p>
            </div>
            <div className="d82-scoreline">
              <div className="d82-scoreline-top"><span>{dashboard.rewards.nextLevel ? `Progress to ${dashboard.rewards.nextLevel.level}` : "Reward progress"}</span><b>{progress}%</b></div>
              <div className="d82-meter"><i style={{ width: `${progress}%` }} /></div>
            </div>
          </aside>
        </section>

        <nav className="d82-mobile-tabs">
          {tabs.map((item) => <button key={item[0]} className={tab === item[0] ? "active" : ""} onClick={() => setTab(item[0])}>{item[1]}</button>)}
        </nav>

        <div className="d82-layout">
          <aside className="d82-rail">
            <div className="d82-rail-card">
              <div className="d82-rail-user">
                <div className="d82-small-avatar">{letter}</div>
                <div><h3>{identity}</h3><span className="d82-pill gold">{displayDomain ? "Active" : "Wallet"}</span></div>
              </div>
              <p>Your record is built from what you trade, launch and settle.</p>
              <div className="d82-rail-stats">
                <div className="d82-mini"><span>Rank</span><b>{dashboard.points.rank}</b></div>
                <div className="d82-mini"><span>Points</span><b>{dashboard.points.total.toLocaleString()}</b></div>
                <div className="d82-mini"><span>Fees</span><b>{money(dashboard.rewards.feePaidUsd)}</b></div>
                <div className="d82-mini"><span>Rewards</span><b>{money(dashboard.rewards.pendingUsd)}</b></div>
              </div>
            </div>
            <nav className="d82-tabs">
              {tabs.map((item) => <TabButton key={item[0]} item={item} active={tab === item[0]} onClick={() => setTab(item[0])} />)}
            </nav>
            <div className="wallet-chip d82-wallet-chip">
              <div className="wallet-chip-copy"><span>Wallet</span><b>{walletShort(dashboard.user?.walletAddress)}</b></div>
              <WalletChoiceButton
                authenticated={Boolean(dashboard.user)}
                onSign={() => void wallet.ensureSignedIn().then(refresh).catch((error) => setMessage(error.message))}
                onDisconnect={() => void wallet.disconnect().then(() => setDashboard(emptyDashboard))}
              />
            </div>
          </aside>

          <main className="d82-main">
            {message ? <div className="wallet-note">{message}</div> : null}
            {tab === "overview" ? (
              <OverviewPanel
                dashboard={dashboard}
                openPositions={openPositions}
                launchedMarkets={launchedMarkets.length}
                claimable={claimable}
                onTab={setTab}
                renderCard={renderCard}
              />
            ) : null}
            {tab === "markets" ? <MarketsPanel positions={dashboard.positions} launchedReceipts={launchedMarkets} /> : null}
            {tab === "receipts" ? <ReceiptsPanel receipts={dashboard.receipts} renderCard={renderCard} /> : null}
            {tab === "earnings" ? <EarningsPanel dashboard={dashboard} claimable={claimable} /> : null}
            {tab === "activity" ? <ActivityPanel dashboard={dashboard} /> : null}
            {tab === "id" ? <IdPanel appBaseUrl={appBaseUrl} dashboard={dashboard} displayDomain={displayDomain} /> : null}
          </main>
        </div>
      </div>
    </section>
  );
}

function OverviewPanel({
  dashboard,
  openPositions,
  launchedMarkets,
  claimable,
  onTab,
  renderCard
}: {
  dashboard: DashboardSnapshot;
  openPositions: Position[];
  launchedMarkets: number;
  claimable: number;
  onTab: (tab: DashboardTab) => void;
  renderCard: (type: string, title: string, payload?: Record<string, unknown>) => void;
}) {
  return (
    <section className="d82-panel">
      <div className="d82-title">
        <div><h2>My Edge.</h2><p>Your weekly position, open work and strongest proof.</p></div>
        <div className="d82-actions"><Link className="primary" href="/edgeboard">Open EdgeBoard</Link><button className="btn" onClick={() => onTab("receipts")}>View receipts</button></div>
      </div>
      <div className="d82-grid4">
        <Stat label="Open positions" value={String(openPositions.length)} sub={`${dashboard.receipts.length} saved receipts`} />
        <Stat label="Markets launched" value={String(launchedMarkets)} sub="Launch receipts" />
        <Stat label="Eligible volume" value={shortMoney(dashboard.rewards.eligibleVolumeUsd)} sub={`${money(dashboard.rewards.feePaidUsd)} fees paid`} />
        <Stat label="EdgeBoard" value={dashboard.points.rank} sub={`${dashboard.points.total.toLocaleString()} points`} />
      </div>
      <div className="d82-grid2" style={{ marginTop: 12 }}>
        <article className="d82-edge-card">
          <div className="d82-rank-line"><span className="d82-pill gold">{dashboard.points.season}</span><span className="d82-pill green">{dashboard.rewards.level}</span></div>
          <div><div className="d82-rank-big">{dashboard.points.rank}</div><h3>{dashboard.rewards.badge}</h3><p>{dashboard.rewards.nextLevel ? `${dashboard.rewards.nextLevel.minPoints.toLocaleString()} points unlock ${dashboard.rewards.nextLevel.level}.` : "Top level reached for this season."}</p></div>
          <div className="d82-card-stats">
            <div><span>Points</span><b>{dashboard.points.total.toLocaleString()}</b></div>
            <div><span>Weekly</span><b>{Math.round(dashboard.rewards.weeklyScore).toLocaleString()}</b></div>
            <div><span>Reward</span><b>{money(dashboard.rewards.projectedUsd)}</b></div>
          </div>
        </article>
        <section className="d82-panel" style={{ boxShadow: "none", padding: 16 }}>
          <h3 style={{ color: "var(--ink)", fontSize: 30, letterSpacing: "-.075em", margin: "0 0 10px" }}>Needs attention</h3>
          {openPositions[0] ? <D82Row title="Position active" body={`${openPositions[0].side === "ride" ? "Riding" : "Fading"} ${openPositions[0].narrativeName}.`} meta={<span className="d82-pill gold">{positionStatusLabel(openPositions[0].status)}</span>} action={openPositions[0].marketId ? <Link className="btn" href={`/market/${openPositions[0].marketId}`}>Open</Link> : null} /> : <D82Row title="No open position" body="Open a market when you are ready to take a side." meta={<span className="d82-pill">Idle</span>} />}
          <D82Row title="Claimable balance" body="Pending referral and reward balances." meta={<span className="d82-pill green">{money(claimable)}</span>} />
          <D82Row title="Rank card" body="Your EdgeBoard proof can be shared from the board." meta={<span className="d82-pill">Card</span>} action={<button className="btn" onClick={() => renderCard("points", "Points card", { points: dashboard.points.total })}>Create</button>} />
        </section>
      </div>
    </section>
  );
}

function MarketsPanel({ positions, launchedReceipts }: { positions: Position[]; launchedReceipts: Receipt[] }) {
  return (
    <section className="d82-panel">
      <div className="d82-title">
        <div><h2>My Markets.</h2><p>Created routes, live positions and what needs review.</p></div>
        <div className="d82-actions"><Link className="primary" href="/launch">Launch another</Link><Link className="btn" href="/markets">Find markets</Link></div>
      </div>
      <div className="d82-grid3">
        {launchedReceipts.length ? launchedReceipts.map((receipt) => (
          <article className="d82-market-card" key={receipt.id}>
            <div><span className="d82-pill gold">{receipt.proofLevel}</span><h3>{receipt.narrativeName}</h3><p>{receipt.rank}</p></div>
            <div className="d82-card-stats"><div><span>Points</span><b>{receipt.edgePoints}</b></div><div><span>Status</span><b>{receipt.status ?? "Saved"}</b></div><div><span>Proof</span><b>{receipt.side}</b></div></div>
            <div className="d82-actions"><Link className="btn" href={receipt.publicUrl || "/receipts"}>Open</Link></div>
          </article>
        )) : <D82Row title="No launched markets yet" body="Launch receipts will appear after your first market is created." meta={<span className="d82-pill">Empty</span>} />}
      </div>
      <div className="d82-panel" style={{ boxShadow: "none", marginTop: 12, padding: 16 }}>
        <h3 style={{ color: "var(--ink)", fontSize: 28, letterSpacing: "-.075em", margin: "0 0 10px" }}>Live positions</h3>
        {positions.length ? positions.map((position) => (
          <D82Row
            key={position.id}
            title={position.narrativeName}
            body={`${position.side === "ride" ? "Ride" : "Fade"} - entry ${Math.round(position.entryPrice * 100)}c - ${positionStatusLabel(position.status)}`}
            meta={<span className="d82-pill gold">{money(position.amount)}</span>}
            action={position.marketId ? <Link className="btn" href={`/market/${position.marketId}`}>View</Link> : null}
          />
        )) : <D82Row title="No live positions" body="Take a side on a live market to start this list." meta={<span className="d82-pill">Empty</span>} />}
      </div>
    </section>
  );
}

function ReceiptsPanel({ receipts, renderCard }: { receipts: Receipt[]; renderCard: (type: string, title: string, payload?: Record<string, unknown>) => void }) {
  return (
    <section className="d82-panel">
      <div className="d82-title">
        <div><h2>Receipts.</h2><p>Proof cards for trades, launches, settlements and rank movement.</p></div>
        <div className="d82-actions"><Link className="primary" href="/edgeboard">Open rank card</Link></div>
      </div>
      {receipts.length ? (
        <div className="d82-grid3">
          {receipts.map((receipt) => (
            <article className="d82-receipt-card dark" key={receipt.id}>
              <div><span className="d82-pill gold">{receipt.proofLevel}</span><h3>{receiptHeadline(receipt)}</h3><p>{receipt.identity} {receiptVerb(receipt).toLowerCase()} {receipt.narrativeName}</p></div>
              <div className="d82-card-stats"><div><span>Points</span><b>{receipt.edgePoints}</b></div><div><span>Status</span><b>{receipt.status ?? "Ready"}</b></div><div><span>Rank</span><b>{receipt.rank}</b></div></div>
              <div className="d82-actions"><button className="btn" onClick={() => renderCard("receipt", "Receipt card", { receiptId: receipt.id })}>Open card</button></div>
            </article>
          ))}
        </div>
      ) : <D82Row title="No receipts yet" body="Trades, launches and settlements save receipts here." meta={<span className="d82-pill">Empty</span>} />}
    </section>
  );
}

function EarningsPanel({ dashboard, claimable }: { dashboard: DashboardSnapshot; claimable: number }) {
  return (
    <section className="d82-panel">
      <div className="d82-title"><div><h2>Earnings.</h2><p>Referral rewards and EdgeBoard rewards in one place.</p></div><span className="d82-pill gold">{dashboard.rewards.status}</span></div>
      <div className="d82-grid2">
        <article className="d82-money-flow">
          <div><span className="d82-pill gold">Available</span><h3 style={{ color: "#fff", fontSize: 52, lineHeight: ".86", letterSpacing: "-.1em", margin: "18px 0 6px" }}>{money(claimable)}</h3><p style={{ color: "#c7bba8", margin: 0 }}>Pending from referrals and rewards.</p></div>
          <div className="d82-flow-line"><div className="d82-flow-orb"><i /></div><div className="d82-flow-track"><i /><i /><i /></div><div className="d82-deposit"><b>{money(claimable)}</b><span>claimable</span></div></div>
        </article>
        <div className="d82-grid2">
          <MoneyBox label="Eligible volume" value={shortMoney(dashboard.rewards.eligibleVolumeUsd)} sub="Reward score input" />
          <MoneyBox label="Fees paid" value={money(dashboard.rewards.feePaidUsd)} sub="Trading fees" />
          <MoneyBox label="Referral rewards" value={money(dashboard.referralStats.pending)} sub={`${dashboard.referralStats.mints} .id mints`} />
          <MoneyBox label="Edge rewards" value={money(dashboard.rewards.pendingUsd)} sub={dashboard.rewards.badge} />
        </div>
      </div>
    </section>
  );
}

function MoneyBox({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="d82-money"><span>{label}</span><b>{value}</b><em>{sub}</em></div>;
}

function ActivityPanel({ dashboard }: { dashboard: DashboardSnapshot }) {
  const events = [
    ...dashboard.points.events.map((event) => ({ id: event.id, title: toTitleLabel(event.reason), body: `${event.points} points`, date: event.createdAt })),
    ...dashboard.receipts.map((receipt) => ({ id: receipt.id, title: receiptVerb(receipt), body: receipt.narrativeName, date: new Date().toISOString() }))
  ].slice(0, 12);
  return (
    <section className="d82-panel">
      <div className="d82-title"><div><h2>Activity.</h2><p>A clean record of what changed and when.</p></div></div>
      <div className="d82-grid2">
        <div className="d82-panel" style={{ boxShadow: "none", padding: 16 }}>
          <h3 style={{ color: "var(--ink)", fontSize: 28, letterSpacing: "-.075em", margin: "0 0 12px" }}>Recent</h3>
          <div className="d82-timeline">
            {events.length ? events.map((event) => <div className="d82-time-row" key={event.id}><i /><b>{event.title}</b><span>{event.body}</span></div>) : <div className="d82-time-row"><i /><b>No activity yet</b><span>Your actions will appear here.</span></div>}
          </div>
        </div>
        <div className="d82-panel" style={{ boxShadow: "none", padding: 16 }}>
          <h3 style={{ color: "var(--ink)", fontSize: 28, letterSpacing: "-.075em", margin: "0 0 12px" }}>Open work</h3>
          {dashboard.positions.slice(0, 4).map((position) => <D82Row key={position.id} title={position.narrativeName} body={positionStatusLabel(position.status)} meta={<span className="d82-pill gold">{position.side}</span>} />)}
          {!dashboard.positions.length ? <D82Row title="No open work" body="Trade or launch a market to start building your record." meta={<span className="d82-pill">Empty</span>} /> : null}
        </div>
      </div>
    </section>
  );
}

function IdPanel({ appBaseUrl, dashboard, displayDomain }: { appBaseUrl: string; dashboard: DashboardSnapshot; displayDomain: string }) {
  const base = stripIdSuffix(displayDomain);
  const referralUrl = base ? displayReferralUrl(base, appBaseUrl) : "";
  return (
    <section className="d82-panel">
      <div className="d82-title"><div><h2>My .id.</h2><p>Your name for receipts, referrals, rewards and rank cards.</p></div><Link className="primary" href="/mint">{displayDomain ? "Manage .id" : "Mint .id"}</Link></div>
      <div className="d82-grid2">
        <article className="d82-passport-card" style={{ minHeight: 420 }}>
          <div><div className="d82-avatar-row"><div className="d82-avatar">{firstLetter(displayDomain || dashboard.user?.walletAddress || "N")}</div><span className="d82-pill gold">{displayDomain ? "Active" : "Not minted"}</span></div><h3>{displayDomain || "No .id yet"}</h3><p>{displayDomain ? "This .id is attached to your dashboard record." : "Mint when you want one public name for your record."}</p></div>
          <div className="d82-card-stats"><div><span>Receipts</span><b>{dashboard.receipts.length}</b></div><div><span>Referral</span><b>{money(dashboard.referralStats.pending)}</b></div><div><span>Rank</span><b>{dashboard.points.rank}</b></div></div>
        </article>
        <section className="d82-panel" style={{ boxShadow: "none", padding: 16 }}>
          <h3 style={{ color: "var(--ink)", fontSize: 30, letterSpacing: "-.075em", margin: "0 0 12px" }}>What it carries</h3>
          <D82Row title="Receipts" body="Trade, launch and rank cards carry the same name." meta={<span className="d82-pill gold">Cards</span>} />
          <D82Row title="Referrals" body={referralUrl || "Mint .id to activate your referral link."} meta={<span className="d82-pill green">Rewards</span>} />
          <D82Row title="Creator record" body="Created markets, clean settlements and fees build one record." meta={<span className="d82-pill">Record</span>} />
        </section>
      </div>
    </section>
  );
}
