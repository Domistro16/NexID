"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSwitchChain, useWriteContract } from "wagmi";
import { useWalletSession } from "@/components/nexid/shared/wallet-session";
import { toTitleLabel } from "@/components/nexmarkets/copy";
import { displayReferralUrl } from "@/lib/appBaseUrl";
import { userFacingTransactionError } from "@/lib/client/transaction-error";
import { resolvePrimaryDomainName, stripIdSuffix } from "@/lib/identity";
import { claimBalanceApi, confirmClaimBalanceApi, connectTelegramAlertsApi, fetchDashboardApi, fetchTelegramAlertConnectionApi, updateAgentControlsApi } from "@/lib/services/nexid-client";
import type { AgentDashboardSummary, CreatedMarketSummary, DashboardSnapshot, Position, Receipt } from "@/lib/types/nexid";

const edgeRewardDistributorAbi = [
  {
    inputs: [
      {
        components: [
          { name: "account", type: "address" },
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "idNameHash", type: "bytes32" },
          { name: "authorizationId", type: "bytes32" },
          { name: "action", type: "uint8" },
          { name: "deadline", type: "uint256" }
        ],
        name: "authorization",
        type: "tuple"
      },
      { name: "signature", type: "bytes" }
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

const emptyDashboard: DashboardSnapshot = {
  user: null,
  positions: [],
  receipts: [],
  createdMarkets: [],
  agents: [],
  points: { total: 0, rank: "Unranked", season: "Season 1", events: [] },
  idNames: [],
  referralStats: { clicks: 0, signups: 0, mints: 0, pending: 0, paid: 0, copied: 0, shared: 0 },
  referralEvents: [],
  claimableBalance: {
    referral: { availableUsd: 0, reservedUsd: 0, spentUsd: 0, claimedUsd: 0 },
    edge: { availableUsd: 0, lockedUsd: 0, usableForMintUsd: 0, reservedUsd: 0, spentUsd: 0, claimedUsd: 0 },
    totalAvailableUsd: 0,
    totalLockedUsd: 0,
    totalUsableForMintUsd: 0,
    totalReservedUsd: 0,
    totalSpentUsd: 0,
    totalClaimRequestedUsd: 0,
    totalClaimedUsd: 0
  },
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
  ["overview", "My Edge", "Overview"],
  ["markets", "My Markets", "Launches"],
  ["agents", "Agents", "Launch"],
  ["alerts", "Alerts", "Messages"],
  ["earnings", "Earnings", "Fees"],
  ["activity", "Activity", "Moves"],
  ["id", "My .id", "Passport"]
] as const;

type DashboardTab = (typeof tabs)[number][0];

const tabAliases: Record<string, DashboardTab> = {
  created: "markets",
  receipts: "alerts",
  agent: "agents",
  launch_agents: "agents",
  trades: "activity",
  orders: "activity",
  referrals: "earnings",
  dashboard: "overview",
  passport: "id"
};

type AlertItem = {
  id: string;
  type: string;
  title: string;
  time: string;
  market: string;
  detail: string;
  action: string;
  tab?: DashboardTab;
  href?: string;
};

function normalizeDashboardTab(value: string | null | undefined): DashboardTab | null {
  if (!value) return null;
  const normalized = tabAliases[value] ?? value;
  return tabs.some(([key]) => key === normalized) ? normalized as DashboardTab : null;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
}

function shortMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: value >= 10000 ? 0 : 1 }).format(value);
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

function firstLetter(value: string) {
  return (value.trim().replace(/[^a-z0-9]/gi, "").slice(0, 1) || "N").toUpperCase();
}

function walletShort(value?: string | null) {
  if (!value) return "Not connected";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function cents(value: number) {
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}¢`;
}

function signedNumber(value: number) {
  if (value > 0) return `+${Math.round(value).toLocaleString()}`;
  return Math.round(value).toLocaleString();
}

function positionPnl(position: Position) {
  const exit = position.settlementPrice ?? position.exitPrice;
  if (typeof exit !== "number") return null;
  const sideMultiplier = position.side === "ride" ? 1 : -1;
  return (exit - position.entryPrice) * position.amount * sideMultiplier;
}

function rowTone(value?: number | null) {
  if (typeof value !== "number") return "gold";
  return value >= 0 ? "green" : "red";
}

function rankValue(rank: string) {
  return rank && rank !== "Unranked" ? rank : "Unranked";
}

function DashPill({ tone, children }: { tone?: "gold" | "green" | "red"; children: ReactNode }) {
  return <span className={`d82-pill${tone ? ` ${tone}` : ""}`}>{children}</span>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="d82-stat"><span>{label}</span><b>{value}</b>{sub ? <em>{sub}</em> : null}</div>;
}

function MoneyBox({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="d82-money"><span>{label}</span><b>{value}</b><em>{sub}</em></div>;
}

function D82Row({ title, body, meta, action }: { title: string; body: string; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="d82-row">
      <div><h4>{title}</h4><p>{body}</p></div>
      <div className="d82-row-meta">{meta}{action}</div>
    </div>
  );
}

function TimeRow({ title, body }: { title: string; body: string }) {
  return <div className="d82-time-row"><i /><b>{title}</b><span>{body}</span></div>;
}

function buildAlerts(input: {
  dashboard: DashboardSnapshot;
  createdMarkets: CreatedMarketSummary[];
  edgeRewards: number;
  creatorClaimable: number;
  hasActiveId: boolean;
}): AlertItem[] {
  const alerts: AlertItem[] = [];
  const { dashboard, createdMarkets, edgeRewards, creatorClaimable, hasActiveId } = input;

  if (edgeRewards > 0) {
    alerts.push({
      id: "edge-rewards",
      type: hasActiveId ? "Reward claim" : "Reward reserved",
      title: hasActiveId ? "EdgeBoard rewards are ready to claim" : "EdgeBoard rewards are reserved",
      time: "Now",
      market: "EdgeBoard",
      detail: hasActiveId
        ? "Your active .id unlocks the reward distributor claim path."
        : "Mint or connect a .id to unlock EdgeBoard reward claims. The balance can offset a .id mint first.",
      action: hasActiveId ? "Open earnings" : "Mint .id",
      tab: hasActiveId ? "earnings" : undefined,
      href: hasActiveId ? undefined : "/mint"
    });
  }

  if (creatorClaimable > 0) {
    alerts.push({
      id: "creator-fees",
      type: "Fee claim",
      title: "Creator fees are recorded",
      time: "Latest",
      market: "Created markets",
      detail: `${money(creatorClaimable)} in creator fees has been recorded from markets you launched.`,
      action: "Open earnings",
      tab: "earnings"
    });
  }

  for (const market of createdMarkets.slice(0, 3)) {
    const needsSettlement = /closed|pending/i.test(`${market.status} ${market.settlement}`);
    alerts.push({
      id: `market-${market.id}`,
      type: needsSettlement ? "Settlement watch" : "Creator market",
      title: needsSettlement ? `${market.title} needs settlement attention` : `${market.title} is being tracked`,
      time: market.close,
      market: market.title,
      detail: `${market.status} - ${shortMoney(market.volume)} volume - ${market.traders.toLocaleString()} traders - ${market.settlement}.`,
      action: "Open market",
      href: market.publicUrl
    });
  }

  for (const position of dashboard.positions.slice(0, 2)) {
    alerts.push({
      id: `position-${position.id}`,
      type: "Position",
      title: `${toTitleLabel(position.side)} position is ${positionStatusLabel(position.status).toLowerCase()}`,
      time: "Latest",
      market: position.narrativeName,
      detail: `${money(position.amount)} at ${cents(position.entryPrice)} entry. Status: ${positionStatusLabel(position.status)}.`,
      action: "View position",
      href: position.marketId ? `/market/${position.marketId}` : undefined,
      tab: position.marketId ? undefined : "markets"
    });
  }

  for (const receipt of dashboard.receipts.slice(0, 2)) {
    alerts.push({
      id: `receipt-${receipt.id}`,
      type: "Receipt",
      title: `${receiptVerb(receipt)} receipt saved`,
      time: "Latest",
      market: receipt.narrativeName,
      detail: `${receipt.proofLevel} - ${receipt.rank} - ${receipt.edgePoints} points.`,
      action: "Open receipt",
      href: receipt.publicUrl || undefined,
      tab: receipt.publicUrl ? undefined : "activity"
    });
  }

  for (const referral of dashboard.referralEvents.slice(0, 2)) {
    alerts.push({
      id: `referral-${referral.id}`,
      type: "Referral",
      title: referral.title,
      time: "Latest",
      market: ".id referrals",
      detail: `${referral.sub}${referral.amount ? ` - ${referral.amount}` : ""}.`,
      action: "Open earnings",
      tab: "earnings"
    });
  }

  return alerts.slice(0, 10);
}

export function DashboardPageClient({ appBaseUrl }: { appBaseUrl: string }) {
  const [dashboard, setDashboard] = useState<DashboardSnapshot>(emptyDashboard);
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [message, setMessage] = useState("");
  const [openedAlerts, setOpenedAlerts] = useState<string[]>([]);
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramStartUrl, setTelegramStartUrl] = useState<string | null>(null);
  const wallet = useWalletSession(dashboard.user);
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  async function refresh() {
    const next = await fetchDashboardApi();
    setDashboard({ ...emptyDashboard, ...next, createdMarkets: next.createdMarkets ?? [], agents: next.agents ?? [] });
    wallet.setUser(next.user);
  }

  async function refreshTelegramStatus() {
    const status = await fetchTelegramAlertConnectionApi();
    setTelegramConnected(status.connected);
    if (status.connected) setTelegramStartUrl(null);
    return status.connected;
  }

  useEffect(() => {
    void refresh().catch(() => undefined);
    void refreshTelegramStatus().catch(() => undefined);
  }, []);

  useEffect(() => {
    const applyRequestedTab = (value?: string | null) => {
      const requested = normalizeDashboardTab(value ?? window.sessionStorage.getItem("nexmarkets_dashboard_tab"));
      if (requested) setTab(requested);
    };
    const onDashboardTab = (event: Event) => {
      applyRequestedTab((event as CustomEvent<{ tab?: string }>).detail?.tab);
    };

    applyRequestedTab();
    window.addEventListener("nexmarkets:dashboard-tab", onDashboardTab);
    return () => window.removeEventListener("nexmarkets:dashboard-tab", onDashboardTab);
  }, []);

  function selectTab(next: DashboardTab) {
    setTab(next);
    window.sessionStorage.setItem("nexmarkets_dashboard_tab", next);
  }

  async function claimBalance() {
    try {
      const user = await wallet.ensureSignedIn();
      const claim = await claimBalanceApi({ destination: user.walletAddress });
      if (!claim.authorization) throw new Error("Reward distributor authorization was not returned.");
      const authorization = claim.authorization.authorization;
      await switchChainAsync({ chainId: claim.authorization.chainId }).catch(() => undefined);
      const txHash = await writeContractAsync({
        address: claim.authorization.distributorAddress,
        abi: edgeRewardDistributorAbi,
        functionName: "claim",
        args: [
          {
            account: authorization.account,
            recipient: authorization.recipient,
            amount: BigInt(authorization.amount),
            idNameHash: authorization.idNameHash,
            authorizationId: authorization.authorizationId,
            action: authorization.action,
            deadline: BigInt(authorization.deadline)
          },
          claim.authorization.signature
        ]
      });
      const paid = await confirmClaimBalanceApi({ referenceId: claim.referenceId, txHash });
      setMessage(`Claim paid: ${money(paid.amountUsd)} to ${walletShort(claim.destination)}.`);
      await refresh();
    } catch (error) {
      setMessage(userFacingTransactionError(error, "Claim request failed."));
    }
  }

  const primaryId = dashboard.user?.primaryIdName ?? dashboard.idNames.find((item) => item.isPrimary)?.name ?? "";
  const livePrimaryDomain = dashboard.user ? wallet.primaryDomainName : null;
  const storedPrimaryDomain = resolvePrimaryDomainName(dashboard.user);
  const displayDomain = primaryId ? `${stripIdSuffix(primaryId)}.id` : livePrimaryDomain ?? storedPrimaryDomain ?? "";
  const displayDomainBase = stripIdSuffix(displayDomain);
  const pendingPrimaryId = dashboard.idNames.find((item) => item.primaryOnchainRequired && item.status === "active" && item.name !== displayDomainBase);
  const identity = displayDomain || walletShort(dashboard.user?.walletAddress);
  const hasActiveId = Boolean(displayDomain);
  const letter = firstLetter(identity);
  const createdMarkets = dashboard.createdMarkets ?? [];
  const creatorVolume = createdMarkets.reduce((sum, market) => sum + market.volume, 0);
  const creatorFees = createdMarkets.reduce((sum, market) => sum + market.creatorFee, 0);
  const creatorClaimable = createdMarkets.reduce((sum, market) => sum + market.claimable, 0);
  const openPositions = dashboard.positions.filter((position) => position.status === "live" || position.status === "pending" || position.status === "partial_fill" || position.status === "filled");
  const limitOrders = dashboard.positions.filter((position) => position.orderType === "limit" && (position.status === "pending" || position.status === "live" || position.status === "partial_fill" || position.status === "filled"));
  const edgeRewards = hasActiveId
    ? dashboard.claimableBalance.edge.availableUsd
    : dashboard.claimableBalance.edge.lockedUsd || dashboard.claimableBalance.edge.usableForMintUsd;
  const referralRewards = dashboard.referralStats.paid + dashboard.referralStats.pending;
  const visibleEarnings = creatorClaimable + referralRewards + edgeRewards;
  const rank = rankValue(dashboard.points.rank);
  const weeklyMove = Math.round(dashboard.rewards.weeklyScore || 0);
  const nextLevel = dashboard.rewards.nextLevel;
  const gap = nextLevel ? Math.max(0, nextLevel.minPoints - dashboard.points.total) : 0;
  const progress = Math.max(0, Math.min(100, dashboard.rewards.progressPct || 0));
  const bestProof = dashboard.receipts[0]?.side ? toTitleLabel(dashboard.receipts[0].side) : "None";
  const alerts = useMemo(
    () => buildAlerts({ dashboard, createdMarkets, edgeRewards, creatorClaimable, hasActiveId }),
    [dashboard, createdMarkets, edgeRewards, creatorClaimable, hasActiveId]
  );
  const activeAlert = alerts.find((alert) => alert.id === activeAlertId) ?? alerts[0] ?? null;
  const unreadAlerts = alerts.filter((alert) => !openedAlerts.includes(alert.id)).length;

  function openAlert(id: string) {
    setOpenedAlerts((current) => current.includes(id) ? current : [...current, id]);
    setActiveAlertId(id);
  }

  function claimCreatorFees() {
    if (creatorClaimable <= 0) {
      setMessage("No creator fees are currently claimable.");
      return;
    }
    setMessage("Creator fee claim is recorded in the fee ledger; onchain withdrawal is not exposed in this build yet.");
  }

  async function updateAgentControl(agentId: string, input: {
    action?: "pause" | "resume" | "revoke" | "disable_launching" | "enable_launching";
    dailyLaunchLimit?: number;
    maxBondSpendUsdc?: number;
  }) {
    try {
      await updateAgentControlsApi(agentId, input);
      setMessage("Agent controls updated.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Agent control update failed.");
    }
  }

  async function connectTelegram() {
    try {
      const user = await wallet.ensureSignedIn();
      const connection = await connectTelegramAlertsApi({ walletAddress: user.walletAddress });
      setTelegramStartUrl(connection.startUrl);
      setMessage("Telegram link generated. Open Telegram and press Start to finish connection.");
      window.open(connection.startUrl, "_blank", "noopener,noreferrer");

      let attempts = 0;
      const interval = window.setInterval(() => {
        attempts += 1;
        void refreshTelegramStatus().then((connected) => {
          if (connected) {
            window.clearInterval(interval);
            setMessage("Telegram alerts connected.");
          }
          if (attempts >= 10) window.clearInterval(interval);
        }).catch(() => {
          if (attempts >= 10) window.clearInterval(interval);
        });
      }, 3000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Telegram connection failed.");
    }
  }

  return (
    <section id="dashboard" className="view active">
      <div className="d82">
        <Hero
          identity={identity}
          letter={letter}
          hasActiveId={hasActiveId}
          rank={rank}
          weeklyMove={weeklyMove}
          unreadAlerts={unreadAlerts}
          visibleEarnings={visibleEarnings}
          progress={progress}
          nextLabel={nextLevel?.level ?? "Top 10"}
          onAlerts={() => selectTab("alerts")}
        />
        <MobileTabs tab={tab} onTab={selectTab} />
        <div className="d82-layout">
          <Rail
            identity={identity}
            letter={letter}
            hasActiveId={hasActiveId}
            rank={rank}
            nextLabel={nextLevel?.level ?? "Top 10"}
            creatorFees={creatorFees}
            edgeRewards={edgeRewards}
            tab={tab}
            onTab={selectTab}
          />
          <main className="d82-main">
            {message ? <div className="wallet-note">{message}</div> : null}
            {pendingPrimaryId ? (
              <div className="wallet-note primary-onchain-note">
                <b>{pendingPrimaryId.label} is live, but it is not your onchain primary yet.</b> {pendingPrimaryId.primaryOnchainMessage ?? "It was minted through the relayer, so confirm it from your wallet later to set it as your primary .id onchain."}
              </div>
            ) : null}
            {tab === "overview" ? (
              <OverviewPanel
                openPositions={openPositions}
                createdMarkets={createdMarkets}
                creatorVolume={creatorVolume}
                creatorFees={creatorFees}
                creatorClaimable={creatorClaimable}
                edgeRewards={edgeRewards}
                rank={rank}
                weeklyMove={weeklyMove}
                nextLabel={nextLevel?.level ?? "Top 10"}
                gap={gap}
                bestProof={bestProof}
                onTab={selectTab}
              />
            ) : null}
            {tab === "markets" ? <MarketsPanel createdMarkets={createdMarkets} positions={dashboard.positions} /> : null}
            {tab === "agents" ? <AgentsPanel agents={dashboard.agents ?? []} onControl={updateAgentControl} /> : null}
            {tab === "alerts" ? (
              <AlertsPanel
                alerts={alerts}
                activeAlert={activeAlert}
                openedAlerts={openedAlerts}
                unreadAlerts={unreadAlerts}
                telegramConnected={telegramConnected}
                telegramStartUrl={telegramStartUrl}
                onOpenAlert={openAlert}
                onTab={selectTab}
                onTelegram={connectTelegram}
              />
            ) : null}
            {tab === "earnings" ? (
              <EarningsPanel
                createdMarkets={createdMarkets}
                creatorVolume={creatorVolume}
                creatorFees={creatorFees}
                creatorClaimable={creatorClaimable}
                referralRewards={referralRewards}
                edgeRewards={edgeRewards}
                hasActiveId={hasActiveId}
                visibleEarnings={visibleEarnings}
                onClaimCreatorFees={claimCreatorFees}
                onClaimEdgeRewards={claimBalance}
              />
            ) : null}
            {tab === "activity" ? <ActivityPanel dashboard={dashboard} limitOrders={limitOrders} creatorClaimable={creatorClaimable} /> : null}
            {tab === "id" ? <PassportPanel appBaseUrl={appBaseUrl} dashboard={dashboard} displayDomain={displayDomain} identity={identity} letter={letter} referralRewards={referralRewards} rank={rank} pendingPrimaryId={pendingPrimaryId ?? null} /> : null}
          </main>
        </div>
      </div>
    </section>
  );
}

function AlertBell({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button className="d82-alert-bell" onClick={onClick} title="Open alerts" aria-label="Open alerts" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      <span className="d82-alert-count">{count}</span>
    </button>
  );
}

function Hero({
  identity,
  letter,
  hasActiveId,
  rank,
  weeklyMove,
  unreadAlerts,
  visibleEarnings,
  progress,
  nextLabel,
  onAlerts
}: {
  identity: string;
  letter: string;
  hasActiveId: boolean;
  rank: string;
  weeklyMove: number;
  unreadAlerts: number;
  visibleEarnings: number;
  progress: number;
  nextLabel: string;
  onAlerts: () => void;
}) {
  return (
    <section className="d82-hero">
      <div>
        <span className="d82-kicker"><i className="d82-dot" /> Dashboard <AlertBell count={unreadAlerts} onClick={onAlerts} /></span>
        <h1>{identity}</h1>
        <p>This is where your trades, launches, alerts, earnings and .id record come together.</p>
        <div className="d82-hero-actions">
          <Link className="primary" href="/launch">Launch market</Link>
          <Link className="btn" href="/markets">Trade</Link>
          <Link className="btn" href="/edgeboard">Check rank</Link>
        </div>
        <div className="d82-rhythm">
          <div><span>Rank</span><b>{rank}</b></div>
          <div><span>This week</span><b>{signedNumber(weeklyMove)}</b></div>
          <div><span>Alerts</span><b>{unreadAlerts}</b></div>
          <div><span>Claimable</span><b>{money(visibleEarnings)}</b></div>
        </div>
      </div>
      <aside className="d82-passport-card">
        <div>
          <div className="d82-avatar-row"><div className="d82-avatar">{letter}</div><DashPill tone="gold">{hasActiveId ? "Active .id" : "Wallet"}</DashPill></div>
          <h3>{hasActiveId ? "Passport active" : "No .id yet"}</h3>
          <p>{hasActiveId ? "Receipts, rewards and referrals are attached to this identity." : "Mint .id when you want receipts, rewards and referrals attached to one name."}</p>
        </div>
        <div className="d82-scoreline">
          <div className="d82-scoreline-top"><span>Progress to {nextLabel}</span><b>{progress}%</b></div>
          <div className="d82-meter"><i style={{ width: `${progress}%` }} /></div>
        </div>
      </aside>
    </section>
  );
}

function MobileTabs({ tab, onTab }: { tab: DashboardTab; onTab: (tab: DashboardTab) => void }) {
  return (
    <nav className="d82-mobile-tabs">
      {tabs.map((item) => <button key={item[0]} className={tab === item[0] ? "active" : ""} onClick={() => onTab(item[0])} type="button">{item[1]}</button>)}
    </nav>
  );
}

function tabIcon(key: DashboardTab) {
  return { overview: "N", markets: "M", agents: "AI", alerts: "A", earnings: "$", activity: "R", id: "id" }[key];
}

function Rail({
  identity,
  letter,
  hasActiveId,
  rank,
  nextLabel,
  creatorFees,
  edgeRewards,
  tab,
  onTab
}: {
  identity: string;
  letter: string;
  hasActiveId: boolean;
  rank: string;
  nextLabel: string;
  creatorFees: number;
  edgeRewards: number;
  tab: DashboardTab;
  onTab: (tab: DashboardTab) => void;
}) {
  return (
    <aside className="d82-rail">
      <div className="d82-rail-card">
        <div className="d82-rail-user">
          <div className="d82-small-avatar">{letter}</div>
          <div><h3>{identity}</h3><DashPill tone="gold">{hasActiveId ? "Active" : "Wallet"}</DashPill></div>
        </div>
        <p>Your record is built from what you trade, launch and settle.</p>
        <div className="d82-rail-stats">
          <div className="d82-mini"><span>Rank</span><b>{rank}</b></div>
          <div className="d82-mini"><span>Next</span><b>{nextLabel}</b></div>
          <div className="d82-mini"><span>Fees</span><b>{money(creatorFees)}</b></div>
          <div className="d82-mini"><span>Rewards</span><b>{money(edgeRewards)}</b></div>
        </div>
      </div>
      <nav className="d82-tabs">
        {tabs.map((item) => (
          <button key={item[0]} className={tab === item[0] ? "active" : ""} onClick={() => onTab(item[0])} type="button">
            <span><i>{tabIcon(item[0])}</i>{item[1]}</span>
            <small>{item[2]}</small>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function OverviewPanel({
  openPositions,
  createdMarkets,
  creatorVolume,
  creatorFees,
  creatorClaimable,
  edgeRewards,
  rank,
  weeklyMove,
  nextLabel,
  gap,
  bestProof,
  onTab
}: {
  openPositions: Position[];
  createdMarkets: CreatedMarketSummary[];
  creatorVolume: number;
  creatorFees: number;
  creatorClaimable: number;
  edgeRewards: number;
  rank: string;
  weeklyMove: number;
  nextLabel: string;
  gap: number;
  bestProof: string;
  onTab: (tab: DashboardTab) => void;
}) {
  const firstPosition = openPositions[0];
  return (
    <section className="d82-panel">
      <div className="d82-title">
        <div><h2>My Edge.</h2><p>Your weekly position, open work and strongest proof.</p></div>
        <div className="d82-actions"><Link className="primary" href="/edgeboard">Open EdgeBoard</Link><button className="btn" onClick={() => onTab("alerts")} type="button">Open alerts</button></div>
      </div>
      <div className="d82-grid4">
        <Stat label="Open positions" value={String(openPositions.length)} sub="Current market exposure" />
        <Stat label="Markets launched" value={String(createdMarkets.length)} sub={`${shortMoney(creatorVolume)} volume`} />
        <Stat label="Creator fees" value={money(creatorFees)} sub={`${money(creatorClaimable)} claimable`} />
        <Stat label="EdgeBoard" value={rank} sub={`${signedNumber(weeklyMove)} this week`} />
      </div>
      <div className="d82-grid2" style={{ marginTop: 12 }}>
        <article className="d82-edge-card">
          <div className="d82-rank-line"><DashPill tone="gold">This week</DashPill><DashPill tone="green">{signedNumber(weeklyMove)}</DashPill></div>
          <div><div className="d82-rank-big">{rank}</div><h3>{nextLabel} is close.</h3><p>{bestProof === "None" ? "Trade or launch a market to start building proof." : `${bestProof} proof is carrying the current record.`}</p></div>
          <div className="d82-card-stats"><div><span>Next</span><b>{nextLabel}</b></div><div><span>Gap</span><b>{gap.toLocaleString()} pts</b></div><div><span>Best proof</span><b>{bestProof}</b></div></div>
        </article>
        <section className="d82-panel" style={{ boxShadow: "none", padding: 16 }}>
          <h3 style={{ color: "var(--ink)", fontSize: 30, letterSpacing: "-.075em", margin: "0 0 10px" }}>Needs attention</h3>
          {firstPosition ? (
            <D82Row title="Position active" body={`${toTitleLabel(firstPosition.side)} - entry ${cents(firstPosition.entryPrice)} - ${positionStatusLabel(firstPosition.status)}.`} meta={<DashPill tone="gold">{money(firstPosition.amount)}</DashPill>} action={firstPosition.marketId ? <Link className="btn" href={`/market/${firstPosition.marketId}`}>Open</Link> : null} />
          ) : (
            <D82Row title="No open position" body="Trade a market to create the first active dashboard item." meta={<DashPill>Idle</DashPill>} />
          )}
          <D82Row title={edgeRewards > 0 ? "EdgeBoard rewards visible" : "No EdgeBoard reward balance"} body={edgeRewards > 0 ? "EdgeBoard rewards stay reserved for .id unless your passport is active." : "Rewards will appear here after allocations are earned."} meta={<DashPill tone={edgeRewards > 0 ? "green" : "gold"}>{money(edgeRewards)}</DashPill>} action={<button className="btn" onClick={() => onTab("earnings")} type="button">Open earnings</button>} />
          <D82Row title="Rank card ready" body="Your EdgeBoard card can be shared from the board." meta={<DashPill>Card</DashPill>} action={<Link className="btn" href="/edgeboard">View</Link>} />
        </section>
      </div>
    </section>
  );
}

function MarketsPanel({ createdMarkets, positions }: { createdMarkets: CreatedMarketSummary[]; positions: Position[] }) {
  return (
    <section className="d82-panel">
      <div className="d82-title">
        <div><h2>My Markets.</h2><p>Created routes, live positions and what needs review.</p></div>
        <div className="d82-actions"><Link className="primary" href="/launch">Launch another</Link><Link className="btn" href="/markets">Find markets</Link></div>
      </div>
      {createdMarkets.length ? (
        <div className="d82-grid3">
          {createdMarkets.map((market) => (
            <article className="d82-market-card" key={market.id}>
              <div><DashPill tone={market.status === "Live" ? "green" : "gold"}>{market.status}</DashPill><h3>{market.title}</h3><p>{market.category} - {market.close} - {market.settlement}</p></div>
              <div className="d82-card-stats"><div><span>Volume</span><b>{shortMoney(market.volume)}</b></div><div><span>Traders</span><b>{market.traders.toLocaleString()}</b></div><div><span>Fees</span><b>{money(market.creatorFee)}</b></div></div>
              <div className="d82-actions"><Link className="btn" href={market.publicUrl}>Open</Link><Link className="primary" href={market.publicUrl}>Card</Link></div>
            </article>
          ))}
        </div>
      ) : (
        <D82Row title="No launched markets yet" body="Markets you create will appear here with real volume, traders, fees, bond and settlement state." meta={<DashPill>Empty</DashPill>} action={<Link className="btn" href="/launch">Launch</Link>} />
      )}
      <div className="d82-panel" style={{ boxShadow: "none", marginTop: 12, padding: 16 }}>
        <h3 style={{ color: "var(--ink)", fontSize: 28, letterSpacing: "-.075em", margin: "0 0 10px" }}>Live positions</h3>
        {positions.length ? positions.map((position) => {
          const pnl = positionPnl(position);
          return (
            <D82Row
              key={position.id}
              title={position.narrativeName}
              body={`${toTitleLabel(position.side)} - entry ${cents(position.entryPrice)} - ${positionStatusLabel(position.status)}`}
              meta={<DashPill tone={rowTone(pnl)}>{typeof pnl === "number" ? money(pnl) : money(position.amount)}</DashPill>}
              action={position.marketId ? <Link className="btn" href={`/market/${position.marketId}`}>View</Link> : null}
            />
          );
        }) : <D82Row title="No live positions" body="Open a market position to populate this list." meta={<DashPill>Empty</DashPill>} />}
      </div>
    </section>
  );
}

function AgentsPanel({
  agents,
  onControl
}: {
  agents: AgentDashboardSummary[];
  onControl: (agentId: string, input: {
    action?: "pause" | "resume" | "revoke" | "disable_launching" | "enable_launching";
    dailyLaunchLimit?: number;
    maxBondSpendUsdc?: number;
  }) => void | Promise<void>;
}) {
  return (
    <section className="d82-panel d82-agents-panel">
      <div className="d82-title">
        <div><h2>Agents.</h2><p>Launch-only agents, public .id status, limits, receipts and controls.</p></div>
        <div className="d82-actions"><Link className="primary" href="/launch">Open launch flow</Link></div>
      </div>
      {agents.length ? (
        <div className="d82-agent-list">
          {agents.map((agent) => <AgentCard key={agent.id} agent={agent} onControl={onControl} />)}
        </div>
      ) : (
        <D82Row
          title="No launch agents yet"
          body="Create an agent API key with launch scopes, then mint or register an agent .id before public launches."
          meta={<DashPill>Empty</DashPill>}
        />
      )}
    </section>
  );
}

function compactDate(value?: string | null) {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function detailLabel(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value).slice(0, 180);
  return "Validation failed.";
}

function pctLabel(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function trustTone(tier?: string): "gold" | "green" | "red" | undefined {
  if (tier === "trusted" || tier === "clean") return "green";
  if (tier === "restricted" || tier === "watch") return "red";
  return "gold";
}

function AgentCard({
  agent,
  onControl
}: {
  agent: AgentDashboardSummary;
  onControl: (agentId: string, input: {
    action?: "pause" | "resume" | "revoke" | "disable_launching" | "enable_launching";
    dailyLaunchLimit?: number;
    maxBondSpendUsdc?: number;
  }) => void | Promise<void>;
}) {
  const [dailyLimit, setDailyLimit] = useState(String(agent.dailyLaunchLimit));
  const [maxBondSpend, setMaxBondSpend] = useState(String(agent.maxBondSpendUsdc));
  const paused = agent.status === "paused";
  const revoked = agent.status === "revoked";
  const bondRemaining = Math.max(0, agent.maxBondSpendUsdc - agent.bondSpentTodayUsdc);
  const reputation = agent.reputation;
  const policy = agent.policy;
  const effectiveDailyLimit = policy?.effectiveDailyLaunchLimit ?? agent.dailyLaunchLimit;
  const profileHref = `/agents/${encodeURIComponent(agent.agentId ?? agent.id)}`;

  async function saveLimits() {
    await onControl(agent.id, {
      dailyLaunchLimit: Number(dailyLimit),
      maxBondSpendUsdc: Number(maxBondSpend)
    });
  }

  return (
    <article className="d82-agent-card">
      <div className="d82-agent-head">
        <div>
          <div className="d82-agent-status-row">
            <DashPill tone={revoked ? "red" : paused || agent.launchingDisabled ? "gold" : "green"}>{toTitleLabel(agent.status)}</DashPill>
            {reputation ? <DashPill tone={trustTone(reputation.trustTier)}>{toTitleLabel(reputation.trustTier)}</DashPill> : null}
            {policy && !policy.canLaunch ? <DashPill tone="red">Launch restricted</DashPill> : null}
          </div>
          <h3><Link href={profileHref}>{agent.agentIdLabel ?? "Agent .id required"}</Link></h3>
          <p>{agent.name} - owner {walletShort(agent.ownerAccount)} - joined {compactDate(agent.joinDate ?? agent.createdAt)}</p>
        </div>
        <div className="d82-agent-actions">
          <button className="btn" disabled={revoked} type="button" onClick={() => onControl(agent.id, { action: paused ? "resume" : "pause" })}>{paused ? "Resume" : "Pause"}</button>
          <button className="btn" disabled={revoked} type="button" onClick={() => onControl(agent.id, { action: agent.launchingDisabled ? "enable_launching" : "disable_launching" })}>{agent.launchingDisabled ? "Enable launches" : "Disable launches"}</button>
          <button className="btn danger" disabled={revoked} type="button" onClick={() => onControl(agent.id, { action: "revoke" })}>Revoke</button>
        </div>
      </div>

      <div className="d82-agent-scopes">
        {agent.scopes.map((scope) => <span key={scope}>{scope}</span>)}
      </div>

      {reputation ? (
        <div className="d82-agent-repstrip">
          <div><span>Trust score</span><b>{Math.round(reputation.communityTrustScore)}</b></div>
          <div><span>Success</span><b>{pctLabel(reputation.launchSuccessRate)}</b></div>
          <div><span>Invalid</span><b>{reputation.invalidMarkets}</b></div>
          <div><span>Disputed</span><b>{reputation.disputedMarkets}</b></div>
          <div><span>Fees earned</span><b>{money(reputation.creatorFeesEarned)}</b></div>
        </div>
      ) : null}

      {agent.badges?.length ? (
        <div className="d82-agent-badges">
          {agent.badges.slice(0, 6).map((badge) => <span className={badge.tier} key={badge.code}>{badge.label}</span>)}
        </div>
      ) : null}

      {policy?.restrictionReason ? <div className="d82-agent-warning">{policy.restrictionReason}</div> : null}

      <div className="d82-grid4">
        <Stat label="Daily launches" value={`${agent.launchesToday}/${effectiveDailyLimit}`} sub={effectiveDailyLimit !== agent.dailyLaunchLimit ? `Policy limit from ${agent.dailyLaunchLimit}` : `Reset ${compactDate(agent.limitsResetAt)}`} />
        <Stat label="Bond usage" value={money(agent.bondSpentTodayUsdc)} sub={`${money(bondRemaining)} remaining`} />
        <Stat label="Drafts" value={String(agent.drafts.length)} sub="Launch-only drafts" />
        <Stat label="Receipts" value={String(agent.receipts.length)} sub="Public actions" />
      </div>

      <div className="d82-agent-limits">
        <label><span>Daily launch limit</span><input value={dailyLimit} inputMode="numeric" onChange={(event) => setDailyLimit(event.target.value)} /></label>
        <label><span>Max bond spend</span><input value={maxBondSpend} inputMode="decimal" onChange={(event) => setMaxBondSpend(event.target.value)} /></label>
        <button className="primary" type="button" onClick={() => void saveLimits()}>Save limits</button>
      </div>

      <div className="d82-agent-sections">
        <AgentMiniList title="Launch history" empty="No public launches yet.">
          {agent.launchHistory.slice(0, 4).map((launch) => (
            <D82Row key={launch.id} title={launch.title} body={`${toTitleLabel(launch.status)} - ${compactDate(launch.createdAt)} - bond ${launch.bond}`} meta={<DashPill tone="gold">Launch</DashPill>} action={<Link className="btn" href={launch.publicUrl}>Open</Link>} />
          ))}
        </AgentMiniList>
        <AgentMiniList title="Drafts" empty="No drafts yet.">
          {agent.drafts.slice(0, 4).map((draft) => (
            <D82Row key={draft.id} title={draft.title} body={`${toTitleLabel(draft.riskStatus)} - ${compactDate(draft.createdAt)}`} meta={<DashPill>Draft</DashPill>} />
          ))}
        </AgentMiniList>
        <AgentMiniList title="Validation failures" empty="No validation failures.">
          {agent.validationFailures.slice(0, 4).map((failure) => (
            <D82Row key={failure.id} title={toTitleLabel(failure.action)} body={`${detailLabel(failure.detail)} - ${compactDate(failure.createdAt)}`} meta={<DashPill tone="red">Failed</DashPill>} />
          ))}
        </AgentMiniList>
        <AgentMiniList title="Receipts" empty="No agent receipts yet.">
          {agent.receipts.slice(0, 4).map((receipt) => (
            <D82Row key={receipt.id} title={receipt.title} body={`${receipt.proof} - ${compactDate(receipt.createdAt)}`} meta={<DashPill tone="green">Receipt</DashPill>} action={receipt.publicUrl ? <Link className="btn" href={receipt.publicUrl}>Open</Link> : null} />
          ))}
        </AgentMiniList>
      </div>
    </article>
  );
}

function AgentMiniList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="d82-agent-mini">
      <h4>{title}</h4>
      {hasRows ? children : <D82Row title={empty} body="Agent launch activity will appear here." meta={<DashPill>Empty</DashPill>} />}
    </section>
  );
}

function AlertsPanel({
  alerts,
  activeAlert,
  openedAlerts,
  unreadAlerts,
  telegramConnected,
  telegramStartUrl,
  onOpenAlert,
  onTab,
  onTelegram
}: {
  alerts: AlertItem[];
  activeAlert: AlertItem | null;
  openedAlerts: string[];
  unreadAlerts: number;
  telegramConnected: boolean;
  telegramStartUrl: string | null;
  onOpenAlert: (id: string) => void;
  onTab: (tab: DashboardTab) => void;
  onTelegram: () => void | Promise<void>;
}) {
  return (
    <section className="d82-panel">
      <div className="d82-title">
        <div><h2>Alerts.</h2><p>Creator messages for source health, close warnings, fee claims and settlement evidence. Latest 10 messages only.</p></div>
        <DashPill tone="gold">{unreadAlerts} unread</DashPill>
      </div>
      <div className="d82-alert-prompt">
        <div><b>{telegramConnected ? "Telegram alerts are on" : telegramStartUrl ? "Telegram link is ready" : "Turn on Telegram alerts"}</b><p>{telegramConnected ? "You will receive real-time creator alerts in Telegram. Email remains optional as a backup." : telegramStartUrl ? "Open Telegram and press Start to finish the connection." : "Do not miss source breaks, close warnings or fee claims. Telegram is recommended; email is optional backup."}</p></div>
        <div className="d82-actions"><button className="primary" onClick={onTelegram} type="button">{telegramConnected ? "Telegram connected" : telegramStartUrl ? "Generate new link" : "Connect Telegram"}</button>{telegramStartUrl && !telegramConnected ? <a className="btn" href={telegramStartUrl} target="_blank" rel="noreferrer">Open Telegram</a> : <button className="btn" type="button">Add email backup</button>}</div>
      </div>
      {alerts.length ? (
        <div className="d82-alert-list">
          {alerts.map((alert) => {
            const read = openedAlerts.includes(alert.id);
            const open = activeAlert?.id === alert.id;
            return (
              <article className={`d82-alert-item ${read ? "opened" : "unread"}`} key={alert.id}>
                <button className="d82-alert-head" onClick={() => onOpenAlert(alert.id)} type="button">
                  <i className="d82-alert-dot" />
                  <span className="d82-alert-title"><b>{alert.title}</b><span>{alert.type} - {alert.market} - {alert.time}</span></span>
                  <span className="d82-alert-state">{read ? "Opened" : "Unread"}</span>
                </button>
                {open ? (
                  <div className="d82-alert-detail">
                    <p>{alert.detail}</p>
                    <div className="d82-alert-actions">
                      {alert.href ? <Link className="btn" href={alert.href}>{alert.action}</Link> : alert.tab ? <button className="btn" onClick={() => onTab(alert.tab as DashboardTab)} type="button">{alert.action}</button> : null}
                      <button className="btn" type="button">Keep message</button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <D82Row title="No dashboard alerts yet" body="Source, close, receipt, fee and reward messages will appear here when real account activity creates them." meta={<DashPill>Empty</DashPill>} />
      )}
      <div className="d82-alert-note">Opened messages stay available here while they are part of the latest 10-message inbox.</div>
    </section>
  );
}

function EarningsPanel({
  createdMarkets,
  creatorVolume,
  creatorFees,
  creatorClaimable,
  referralRewards,
  edgeRewards,
  hasActiveId,
  visibleEarnings,
  onClaimCreatorFees,
  onClaimEdgeRewards
}: {
  createdMarkets: CreatedMarketSummary[];
  creatorVolume: number;
  creatorFees: number;
  creatorClaimable: number;
  referralRewards: number;
  edgeRewards: number;
  hasActiveId: boolean;
  visibleEarnings: number;
  onClaimCreatorFees: () => void;
  onClaimEdgeRewards: () => void;
}) {
  return (
    <section className="d82-panel">
      <div className="d82-title"><div><h2>Earnings.</h2><p>Creator fees claim normally. Only EdgeBoard rewards require a NexID .id.</p></div></div>
      <div className="d82-grid2">
        <article className="d82-money-flow">
          <div><DashPill tone="gold">Available</DashPill><h3 style={{ color: "#fff", fontSize: 52, lineHeight: ".86", letterSpacing: "-.1em", margin: "18px 0 6px" }}>{money(visibleEarnings)}</h3><p style={{ color: "#c7bba8", margin: 0 }}>Creator fees, referral earnings and reserved EdgeBoard rewards stay separated.</p></div>
          <div className="d82-flow-line"><div className="d82-flow-orb"><i /></div><div className="d82-flow-track"><i /><i /><i /></div><div className="d82-deposit"><b>{money(visibleEarnings)}</b><span>visible</span></div></div>
        </article>
        <div className="d82-grid2">
          <MoneyBox label="Creator volume" value={shortMoney(creatorVolume)} sub="Across created markets" />
          <MoneyBox label="Creator fees" value={money(creatorFees)} sub={`${money(creatorClaimable)} claimable`} />
          <MoneyBox label="Referral rewards" value={money(referralRewards)} sub="Paid instantly" />
          <MoneyBox label="EdgeBoard rewards" value={money(edgeRewards)} sub={hasActiveId ? "Ready to claim" : "Reserved for .id"} />
        </div>
      </div>
      <div className="d83-claim-grid">
        <article className="d83-claim-card">
          <div><DashPill tone="green">Wallet claim</DashPill><h3>Creator fees</h3><p>Fees earned from markets you created. Claimable to your connected wallet. No .id required.</p></div>
          <div className="d83-claim-foot"><b>{money(creatorClaimable)}</b><button className="primary" disabled={creatorClaimable <= 0} onClick={onClaimCreatorFees} type="button">Claim creator fees</button></div>
        </article>
        <article className="d83-claim-card edge">
          <div><DashPill tone="gold">{hasActiveId ? "Ready" : "Reserved"}</DashPill><h3>EdgeBoard rewards</h3><p>{hasActiveId ? "Paid into your active .id address." : "Your rewards are reserved. EdgeBoard rewards are paid into .id addresses only."}</p></div>
          <div className="d83-claim-foot"><b>{money(edgeRewards)}</b>{hasActiveId ? <button className="primary" disabled={edgeRewards <= 0} onClick={onClaimEdgeRewards} type="button">Claim EdgeBoard rewards</button> : <Link className="primary" href="/mint">Mint .id to claim</Link>}</div>
        </article>
      </div>
      <div className="d82-panel" style={{ boxShadow: "none", marginTop: 12, padding: 16 }}>
        <h3 style={{ color: "var(--ink)", fontSize: 28, letterSpacing: "-.075em", margin: "0 0 10px" }}>Fee ledger</h3>
        {createdMarkets.length ? createdMarkets.map((market) => <D82Row key={market.id} title={market.title} body={`${market.category} - ${shortMoney(market.volume)} volume - ${market.settlement}`} meta={<DashPill tone="gold">{money(market.creatorFee)}</DashPill>} />) : <D82Row title="No creator fee ledger yet" body="Creator fees will appear after trades occur on your launched markets." meta={<DashPill>Empty</DashPill>} />}
      </div>
    </section>
  );
}

function ActivityPanel({ dashboard, limitOrders, creatorClaimable }: { dashboard: DashboardSnapshot; limitOrders: Position[]; creatorClaimable: number }) {
  const pointEvents = dashboard.points.events.slice(0, 4);
  return (
    <section className="d82-panel">
      <div className="d82-title"><div><h2>Activity.</h2><p>A clean record of what changed and when.</p></div><Link className="btn" href="/proofops">ProofOps</Link></div>
      <div className="d82-grid2">
        <div className="d82-panel" style={{ boxShadow: "none", padding: 16 }}>
          <h3 style={{ color: "var(--ink)", fontSize: 28, letterSpacing: "-.075em", margin: "0 0 12px" }}>Today</h3>
          <div className="d82-timeline">
            {pointEvents.length ? pointEvents.map((event) => <TimeRow key={event.id} title={toTitleLabel(event.reason)} body={`${event.points} points`} />) : null}
            {dashboard.receipts.slice(0, 2).map((receipt) => <TimeRow key={receipt.id} title="Receipt generated" body={`${receiptVerb(receipt)} ${receipt.narrativeName}`} />)}
            {creatorClaimable > 0 ? <TimeRow title="Fee became claimable" body={`${money(creatorClaimable)} creator fees`} /> : null}
            {!pointEvents.length && !dashboard.receipts.length && creatorClaimable <= 0 ? <TimeRow title="No activity yet" body="Trades, receipts, points and fee events will appear here." /> : null}
          </div>
        </div>
        <div className="d82-panel" style={{ boxShadow: "none", padding: 16 }}>
          <h3 style={{ color: "var(--ink)", fontSize: 28, letterSpacing: "-.075em", margin: "0 0 12px" }}>Open orders</h3>
          {limitOrders.length ? limitOrders.map((order) => <D82Row key={order.id} title={order.narrativeName} body={`${toTitleLabel(order.side)} limit at ${cents(order.entryPrice)} - ${positionStatusLabel(order.status)}`} meta={<DashPill tone="gold">{money(order.amount)}</DashPill>} />) : <D82Row title="No open limit orders" body="Limit orders will appear here when recorded by the trading flow." meta={<DashPill>Empty</DashPill>} />}
        </div>
      </div>
    </section>
  );
}

function PassportPanel({
  appBaseUrl,
  dashboard,
  displayDomain,
  identity,
  letter,
  pendingPrimaryId,
  referralRewards,
  rank
}: {
  appBaseUrl: string;
  dashboard: DashboardSnapshot;
  displayDomain: string;
  identity: string;
  letter: string;
  pendingPrimaryId: DashboardSnapshot["idNames"][number] | null;
  referralRewards: number;
  rank: string;
}) {
  const base = stripIdSuffix(displayDomain);
  const referralUrl = base ? displayReferralUrl(base, appBaseUrl) : "";
  return (
    <section className="d82-panel">
      <div className="d82-title"><div><h2>My .id.</h2><p>Your name for receipts, referrals, rewards and rank cards.</p></div><Link className="primary" href="/mint">{displayDomain ? "Manage .id" : "Mint .id"}</Link></div>
      <div className="d82-grid2">
        <article className="d82-passport-card" style={{ minHeight: 420 }}>
          <div><div className="d82-avatar-row"><div className="d82-avatar">{letter}</div><DashPill tone="gold">{displayDomain ? "Active" : "Not minted"}</DashPill></div><h3>{identity}</h3><p>{displayDomain ? "This .id is attached to your dashboard record." : "Mint when you want one public name for your record."}</p></div>
          <div className="d82-card-stats"><div><span>Receipts</span><b>{dashboard.receipts.length}</b></div><div><span>Referral</span><b>{money(referralRewards)}</b></div><div><span>Rank</span><b>{rank}</b></div></div>
        </article>
        <section className="d82-panel" style={{ boxShadow: "none", padding: 16 }}>
          <h3 style={{ color: "var(--ink)", fontSize: 30, letterSpacing: "-.075em", margin: "0 0 12px" }}>What it carries</h3>
          {pendingPrimaryId ? <D82Row title="Primary name" body={`${pendingPrimaryId.label} was minted through the relayer and still needs your wallet to confirm it as the primary name onchain.`} meta={<DashPill tone="gold">Action needed</DashPill>} action={<Link className="btn" href="/mint">Open .id page</Link>} /> : null}
          <D82Row title="Receipts" body="Trade, launch and rank cards carry the same name." meta={<DashPill tone="gold">Cards</DashPill>} />
          <D82Row title="Referrals" body={referralUrl || "Mint .id to activate your referral link."} meta={<DashPill tone="green">Rewards</DashPill>} />
          <D82Row title="Creator record" body="Created markets, clean settlements and fees build one record." meta={<DashPill>Record</DashPill>} />
        </section>
      </div>
    </section>
  );
}
