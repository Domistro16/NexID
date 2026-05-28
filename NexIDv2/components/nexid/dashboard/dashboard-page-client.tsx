"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchDashboardApi, renderCardApi } from "@/lib/services/nexid-client";
import { displayReferralUrl } from "@/lib/appBaseUrl";
import { resolvePrimaryDomainName, stripIdSuffix } from "@/lib/identity";
import type { DashboardSnapshot, Position, Receipt } from "@/lib/types/nexid";
import { EmptyState } from "@/components/nexid/shared/empty-state";
import { WalletChoiceButton, useWalletSession } from "@/components/nexid/shared/wallet-session";
import { shortAddress } from "@/components/nexid/shared/utils";
import { toTitleLabel } from "@/components/nexmarkets/copy";

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

const dashboardTabs = [
  ["overview", "Overview"],
  ["positions", "Positions"],
  ["receipts", "Receipts"],
  ["boards", "Boards"],
  ["points", "Points"],
  ["rewards", "Rewards"],
  ["id", ".id"],
  ["referrals", "Referrals"],
  ["settings", "Settings"]
] as const;

type DashboardTab = (typeof dashboardTabs)[number][0];

function signedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function positionStatusLabel(value?: string | null) {
  if (!value) return "Tracked";
  if (value === "open") return "Open";
  if (value === "partial_fill") return "Part filled";
  return toTitleLabel(value);
}

function executionLabel(value?: string | null) {
  if (value === "user_signed") return "Wallet signed";
  if (value === "native_onchain") return "Native market";
  if (value === "polymarket_route") return "Polymarket route";
  return "Tracked";
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
  if (receipt.returnPct !== 0) return signedPercent(receipt.returnPct);
  return receipt.rank || receipt.proofLevel;
}

function pointReasonLabel(value: string) {
  const labels: Record<string, string> = {
    native_trade_volume: "Market trade",
    polymarket_trade_volume: "Market trade",
    receipt_generated: "Receipt generated",
    referral_mint: ".id referral",
    id_mint_referral: ".id referral",
    qualified_creator_referral: "Creator referral",
    clean_settlement_bonus: "Clean settlement",
    valid_launch: "Market launch",
    native_market_valid_launch: "Market launch",
    native_market_clean_settlement: "Clean settlement"
  };
  return labels[value] ?? toTitleLabel(value);
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

  const primaryId = dashboard.user?.primaryIdName ?? dashboard.idNames.find((item) => item.isPrimary)?.name ?? "";
  const storedPrimaryDomain = resolvePrimaryDomainName(dashboard.user);
  const livePrimaryDomain = dashboard.user ? wallet.primaryDomainName : null;
  const displayDomain = primaryId ? `${primaryId}.id` : livePrimaryDomain ?? storedPrimaryDomain ?? "";
  const referralCode = stripIdSuffix(displayDomain);
  const identity = displayDomain || shortAddress(dashboard.user?.walletAddress) || "Not signed in";
  const walletLabel = dashboard.user ? shortAddress(dashboard.user.walletAddress) : "Not connected";

  async function renderCard(type: string, title: string, payload?: Record<string, unknown>) {
    try {
      const card = await renderCardApi({ type, title, payload });
      setMessage(`Card ready: ${card.publicUrl}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Card render failed.");
    }
  }

  return (
    <section id="dashboard" className="view active">
      <div className="dashboard-command">
        <aside className="rail">
          <div className="dash-identity-card">
            <div className="dash-avatar">{(referralCode || "N").slice(0, 1).toUpperCase()}</div>
            <h2>{identity}</h2>
            <p>{displayDomain ? "Your edge passport is active." : "Your command center for positions, receipts, points and .id status."}</p>
            <div className="wallet-chip">
              <div className="wallet-chip-copy"><span>Wallet</span><b title={dashboard.user?.walletAddress ?? walletLabel}>{walletLabel}</b></div>
              <WalletChoiceButton
                authenticated={Boolean(dashboard.user)}
                onSign={() => void wallet.ensureSignedIn().then(refresh).catch((error) => setMessage(error.message))}
                onDisconnect={() => void wallet.disconnect().then(() => setDashboard(emptyDashboard))}
              />
            </div>
          </div>
          <div className="dash-nav">
            {dashboardTabs.map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><span>{label}</span></button>)}
          </div>
        </aside>
        <section className="dash-content">
          {message ? <div className="wallet-note">{message}</div> : null}
          {tab === "overview" ? <DashboardOverview dashboard={dashboard} displayDomain={displayDomain} onTab={setTab} renderCard={renderCard} /> : null}
          {tab === "positions" ? <PositionsPanel positions={dashboard.positions} receipts={dashboard.receipts} renderCard={renderCard} /> : null}
          {tab === "receipts" ? <ReceiptsPanel receipts={dashboard.receipts} renderCard={renderCard} /> : null}
          {tab === "boards" ? <BoardsPanel dashboard={dashboard} renderCard={renderCard} /> : null}
          {tab === "points" ? <PointsPanel dashboard={dashboard} renderCard={renderCard} /> : null}
          {tab === "rewards" ? <RewardsPanel dashboard={dashboard} displayDomain={displayDomain} /> : null}
          {tab === "id" ? <IdPanel displayDomain={displayDomain} dashboard={dashboard} /> : null}
          {tab === "referrals" ? <ReferralPanel appBaseUrl={appBaseUrl} displayDomain={displayDomain} dashboard={dashboard} /> : null}
          {tab === "settings" ? <SettingsPanel connected={Boolean(dashboard.user)} signIn={() => void wallet.ensureSignedIn().then(refresh).catch((error) => setMessage(error.message))} disconnect={() => void wallet.disconnect().then(() => setDashboard(emptyDashboard))} /> : null}
        </section>
      </div>
    </section>
  );
}

function DashboardOverview({ dashboard, displayDomain, onTab, renderCard }: { dashboard: DashboardSnapshot; displayDomain: string; onTab: (tab: DashboardTab) => void; renderCard: (type: string, title: string, payload?: Record<string, unknown>) => void }) {
  const position = dashboard.positions[0];
  const receiptCountLabel = dashboard.receipts.length === 1 ? "1 saved proof" : `${dashboard.receipts.length} saved proofs`;
  return (
    <>
      <section className="dash-hero">
        <div className="dash-hero-content">
          <div>
            <div className="eyebrow"><i className="dot" /> Private dashboard</div>
            <h1>{position ? "Position live." : "Your edge starts here."}</h1>
            <p>{position ? `Your ${position.side} on ${position.narrativeName} is saved to your market profile.` : "Take a side from any live market. The dashboard keeps positions, receipts, points, .id status and referrals in one place."}</p>
            <div className="hero-ctas">
              <Link className="primary" href="/pulse">Explore markets</Link>
              <button className="btn" onClick={() => renderCard("points", "Points card", { points: dashboard.points.total })}>Points card</button>
              <Link className="btn" href="/boards">Open boards</Link>
            </div>
          </div>
          <aside className="dash-next">
            <span>Next best action</span>
            <b>{position ? "Keep your edge moving" : displayDomain ? "Make your first market move" : "Claim the name that carries it"}</b>
            <p>{position ? "New trades, launches and settlements add proof to this profile automatically." : displayDomain ? "Your .id link is live." : "Mint .id after you have proof worth carrying."}</p>
            <Link className="primary" href={position ? "/pulse" : displayDomain ? "/launch" : "/mint"}>{position ? "Explore markets" : displayDomain ? "Launch or trade" : "Mint .id"}</Link>
          </aside>
        </div>
      </section>
      <div className="dash-stat-row">
        <div className="dash-stat"><span>Active positions</span><b>{dashboard.positions.length}</b><small>{receiptCountLabel}</small></div>
        <div className="dash-stat"><span>Receipts</span><b>{dashboard.receipts.length}</b><small>{displayDomain ? ".id verified ready" : "Mint .id to verify"}</small></div>
        <div className="dash-stat"><span>Edge Points</span><b>{dashboard.points.total.toLocaleString()}</b><small>Season rank {dashboard.points.rank}</small></div>
        <div className="dash-stat"><span>Reward level</span><b>{dashboard.rewards.level}</b><small>{dashboard.rewards.badge}</small></div>
        <div className="dash-stat"><span>.id status</span><b>{displayDomain ? "Live" : "Open"}</b><small>{displayDomain || "Not minted"}</small></div>
      </div>
      <div className="dash-panel">
        <div className="dash-panel-head"><div><h2>Active now</h2><p>Live market positions and saved proof.</p></div><button className="btn" onClick={() => onTab("positions")}>View all</button></div>
        {position ? <PositionRow position={position} receipt={dashboard.receipts.find((item) => item.positionId === position.id)} renderCard={renderCard} /> : <EmptyState title="No active position yet" copy="Open a market and take a side. Your first position card appears here." />}
      </div>
    </>
  );
}

function PositionRow({ position, receipt, renderCard }: { position: Position; receipt?: Receipt; renderCard: (type: string, title: string, payload?: Record<string, unknown>) => void }) {
  const settlement = position.settlementPrice ?? position.exitPrice;
  return (
    <div className="position-row">
      <div className="position-main">
        <b>{position.side === "ride" ? "Riding" : "Fading"} {position.narrativeName}</b>
        <span>Entry {Math.round(position.entryPrice * 100)}c - {positionStatusLabel(position.status)} - ${position.amount} size{settlement != null ? ` - settled ${Math.round(settlement * 100)}c` : ""}</span>
        <div className="position-meta">
          <span className="meta-pill">{toTitleLabel(position.orderType)}</span>
          <span className="meta-pill">{positionStatusLabel(position.fillStatus)}</span>
          <span className="meta-pill">{executionLabel(position.executionMode)}</span>
        </div>
      </div>
      <div className="position-actions">
        <button className="btn" onClick={() => renderCard("position", "Position card", { positionId: position.id })}>Position card</button>
        {position.marketId ? <Link className="primary" href={`/market/${position.marketId}`}>{receipt ? "Open market" : "Track market"}</Link> : null}
      </div>
    </div>
  );
}

function PositionsPanel({ positions, receipts, renderCard }: { positions: Position[]; receipts: Receipt[]; renderCard: (type: string, title: string, payload?: Record<string, unknown>) => void }) {
  return <div className="dash-panel"><div className="dash-panel-head"><div><h2>Positions</h2><p>Live native trades and routed market orders.</p></div><Link className="primary" href="/pulse">Take a side</Link></div>{positions.length ? positions.map((position) => <PositionRow key={position.id} position={position} receipt={receipts.find((receipt) => receipt.positionId === position.id)} renderCard={renderCard} />) : <EmptyState title="No live positions" copy="Pick a market, ride or fade it, then come back here to track it." />}</div>;
}

function ReceiptsPanel({ receipts, renderCard }: { receipts: Receipt[]; renderCard: (type: string, title: string, payload?: Record<string, unknown>) => void }) {
  return <div className="dash-panel"><div className="dash-panel-head"><div><h2>Receipt archive</h2><p>Trades, launches and settlements save proof here automatically.</p></div></div>{receipts.length ? <div className="receipt-archive">{receipts.map((receipt) => <div className="receipt-archive-card" key={receipt.id}><div><span className="rc-kicker">{receipt.proofLevel}{receipt.edgeScore != null ? ` - Edge ${receipt.edgeScore}` : ""}</span><h3>{receiptHeadline(receipt)}</h3><p>{receipt.identity} {receiptVerb(receipt).toLowerCase()} {receipt.narrativeName}</p></div><div className="receipt-actions"><button className="btn" onClick={() => renderCard("receipt", "Receipt card", { receiptId: receipt.id })}>Open card</button></div></div>)}</div> : <EmptyState title="No receipts yet" copy="Trade, launch or settle a market to save your first receipt." />}</div>;
}

function BoardsPanel({ dashboard, renderCard }: { dashboard: DashboardSnapshot; renderCard: (type: string, title: string, payload?: Record<string, unknown>) => void }) {
  return <div className="dash-panel"><div className="dash-panel-head"><div><h2>Your board signals</h2><p>Where positions, receipts and points are pushing you.</p></div><Link className="primary" href="/boards">Open EdgeBoards</Link></div><div className="dash-board-grid"><div className="dash-board-tile"><span>Global Points</span><h3>{dashboard.points.rank}</h3><b>{dashboard.points.total.toLocaleString()}</b></div><div className="dash-board-tile"><span>Receipts</span><h3>{dashboard.receipts.length}</h3><b>Proof</b></div><div className="dash-board-tile"><span>Positions</span><h3>{dashboard.positions.length}</h3><b>Live</b></div></div><div className="position-row"><div className="position-main"><b>Snapshot an EdgeBoard</b><span>Export a board card from the public board page.</span></div><button className="btn" onClick={() => renderCard("board", "Board card", { points: dashboard.points.total })}>Board card</button></div></div>;
}

function PointsPanel({ dashboard, renderCard }: { dashboard: DashboardSnapshot; renderCard: (type: string, title: string, payload?: Record<string, unknown>) => void }) {
  return <div className="dash-panel"><div className="dash-panel-head"><div><h2>Edge Points</h2><p>Season points from positions, receipts, boards and referrals.</p></div><button className="btn" onClick={() => renderCard("points", "Points card", { points: dashboard.points.total, badge: dashboard.rewards.badge })}>Points card</button></div><div className="global-hero" style={{ marginBottom: 14 }}><div><div className="eyebrow"><i className="dot" /> {dashboard.points.season}</div><h2>{dashboard.points.total.toLocaleString()}</h2><p style={{ color: "var(--muted)" }}>Your Global Points rank is {dashboard.points.rank}. Current reward badge: {dashboard.rewards.badge}.</p></div><div className="points-orb"><div><b>{dashboard.points.rank}</b><span style={{ display: "block", textAlign: "center", color: "#b8ad9d", fontWeight: 950, textTransform: "uppercase", letterSpacing: ".08em" }}>Rank</span></div></div></div><div className="points-timeline">{dashboard.points.events.length ? dashboard.points.events.map((event) => <div className="points-event" key={event.id}><time>{new Date(event.createdAt).toLocaleDateString()}</time><b>{pointReasonLabel(event.reason)}</b><span>{event.points}</span></div>) : <div className="points-event"><time>Season</time><b>No point events yet</b><span>0</span></div>}</div></div>;
}

function RewardsPanel({ dashboard, displayDomain }: { dashboard: DashboardSnapshot; displayDomain: string }) {
  const rewards = dashboard.rewards;
  return <div className="dash-panel"><div className="dash-panel-head"><div><h2>.id Rewards</h2><p>Weekly loyalty rewards from NexID trading fees and .id mint revenue.</p></div><Link className="primary" href="/points">Open points</Link></div><div className="reward-brief"><div><div className="eyebrow"><i className="dot" /> {rewards.seasonCode || rewards.seasonTitle}</div><h3>{rewards.badge}</h3><p>{displayDomain ? `${displayDomain} is your reward account.` : "Mint .id before payouts to unlock reward eligibility."}</p></div><div className="reward-meter"><span style={{ width: `${rewards.progressPct}%` }} /></div></div><div className="dash-stat-row"><div className="dash-stat"><span>Level</span><b>{rewards.level}</b><small>{rewards.nextLevel ? `${rewards.nextLevel.minPoints.toLocaleString()} pts to ${rewards.nextLevel.level}` : "Top level"}</small></div><div className="dash-stat"><span>Weekly score</span><b>{Math.round(rewards.weeklyScore).toLocaleString()}</b><small>{rewards.status}</small></div><div className="dash-stat"><span>Projected</span><b>${rewards.projectedUsd.toFixed(2)}</b><small>Before review</small></div><div className="dash-stat"><span>Pending</span><b>${rewards.pendingUsd.toFixed(2)}</b><small>Awaiting payout</small></div><div className="dash-stat"><span>Paid</span><b>${rewards.paidUsd.toFixed(2)}</b><small>Lifetime rewards</small></div></div>{rewards.riskFlag ? <div className="wallet-note">{rewards.riskFlag}</div> : null}<div className="position-row"><div className="position-main"><b>Reward formula</b><span>Fees paid, real filled volume, realized winnings, unique markets and settled receipts raise score. Churn and suspicious concentration lower it.</span></div></div></div>;
}

function IdPanel({ displayDomain, dashboard }: { displayDomain: string; dashboard: DashboardSnapshot }) {
  return displayDomain ? <div className="id-status-card"><div className="eyebrow"><i className="dot" /> .id active</div><h2>{displayDomain}</h2><p>Your portable edge passport is live. It now carries receipts, referrals and the {dashboard.rewards.badge} reward badge.</p><div className="hero-ctas"><Link className="primary" href="/mint">Manage names</Link><button className="btn" type="button">Level {dashboard.rewards.level}</button></div></div> : <div className="id-status-card"><div className="eyebrow"><i className="dot" /> .id open</div><h2>Own the name that carries your edge.</h2><p>Mint .id after you have positions and receipts worth keeping. Reward payouts require an active .id account.</p><div className="hero-ctas"><Link className="primary" href="/mint">Mint .id</Link></div></div>;
}

function ReferralPanel({ appBaseUrl, displayDomain, dashboard }: { appBaseUrl: string; displayDomain: string; dashboard: DashboardSnapshot }) {
  const referralCode = stripIdSuffix(displayDomain);
  if (!referralCode) return <div className="referral-locked"><div className="eyebrow"><i className="dot" /> Referrals locked</div><h2>Mint .id to unlock your referral trail.</h2><p>Once your .id is active, every receipt can carry your link.</p><Link className="primary" href="/mint">Mint .id</Link></div>;
  return <div className="referral-locked"><div className="eyebrow"><i className="dot" /> Referrals live</div><h2>Your link is active.</h2><p>Your cards now carry {displayDomain}.</p><Link className="ref-link-live" href={`/r/${referralCode}`}><code>{displayReferralUrl(referralCode, appBaseUrl)}</code><span>Save referral</span></Link><div className="dash-stat-row"><div className="dash-stat"><span>Clicks</span><b>{dashboard.referralStats.clicks}</b></div><div className="dash-stat"><span>Signups</span><b>{dashboard.referralStats.signups}</b></div><div className="dash-stat"><span>.id mints</span><b>{dashboard.referralStats.mints}</b></div><div className="dash-stat"><span>Pending</span><b>${dashboard.referralStats.pending.toFixed(2)}</b></div></div></div>;
}

function SettingsPanel({ connected, signIn, disconnect }: { connected: boolean; signIn: () => void; disconnect: () => void }) {
  return <div className="dash-panel"><div className="dash-panel-head"><div><h2>Settings</h2><p>Profile visibility, wallet state and card preferences.</p></div><button className={connected ? "btn" : "primary"} onClick={connected ? disconnect : signIn}>{connected ? "Disconnect wallet" : "Connect wallet"}</button></div></div>;
}
