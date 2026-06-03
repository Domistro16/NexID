import Link from "next/link";
import { displayReferralUrl, getAppBaseUrl } from "@/lib/appBaseUrl";
import { resolveIdentityLabel, shortWalletAddress, stripIdSuffix } from "@/lib/identity";
import type { DashboardSnapshot } from "@/lib/types/nexid";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function firstLetter(value: string) {
  return (value.replace(/[^a-z0-9]/gi, "").slice(0, 1) || "N").toUpperCase();
}

export function PassportPage({ dashboard }: { dashboard: DashboardSnapshot }) {
  const identity = resolveIdentityLabel(dashboard.user);
  const hasIdentity = Boolean(dashboard.user);
  const primaryId = dashboard.user?.primaryIdName ?? dashboard.idNames.find((item) => item.isPrimary)?.name ?? dashboard.idNames[0]?.name ?? "";
  const displayDomain = primaryId ? `${stripIdSuffix(primaryId)}.id` : dashboard.user?.primaryDomainName ?? "";
  const referralBase = stripIdSuffix(displayDomain);
  const referralUrl = referralBase ? displayReferralUrl(referralBase, getAppBaseUrl()) : "";
  const rewardAmount = displayDomain ? dashboard.claimableBalance.totalAvailableUsd : dashboard.claimableBalance.totalLockedUsd;

  return (
    <section id="dashboard" className="view active">
      <div className="d82">
        <section className="d82-hero">
          <div>
            <span className="d82-kicker"><i className="d82-dot" /> Passport</span>
            <h1>{hasIdentity ? identity : "NexMarkets Passport"}</h1>
            <p>Your portable record for trades, receipts, creator history, referrals and weekly reward eligibility.</p>
            <div className="d82-hero-actions">
              <Link className="primary" href="/mint">{displayDomain ? "Manage .id" : "Mint .id"}</Link>
              <Link className="btn" href="/my-edge">Open dashboard</Link>
              <Link className="btn" href="/edgeboard">Check rank</Link>
            </div>
            <div className="d82-rhythm">
              <div><span>Wallet</span><b>{shortWalletAddress(dashboard.user?.walletAddress) || "-"}</b></div>
              <div><span>Points</span><b>{dashboard.points.total.toLocaleString()}</b></div>
              <div><span>Receipts</span><b>{dashboard.receipts.length}</b></div>
              <div><span>Reward</span><b>{dashboard.rewards.level}</b></div>
            </div>
          </div>
          <aside className="d82-passport-card">
            <div>
              <div className="d82-avatar-row"><div className="d82-avatar">{firstLetter(identity)}</div><span className="d82-pill gold">{displayDomain ? "Active .id" : "Wallet"}</span></div>
              <h3>{displayDomain || "No .id yet"}</h3>
              <p>{displayDomain ? "Receipts, rewards and referrals are attached to this name." : "Mint .id when you want one public name for your record."}</p>
            </div>
            <div className="d82-card-stats">
              <div><span>Badge</span><b>{dashboard.rewards.badge}</b></div>
              <div><span>{displayDomain ? "Claimable" : "Reserved"}</span><b>{money(rewardAmount)}</b></div>
              <div><span>Mints</span><b>{dashboard.referralStats.mints}</b></div>
            </div>
          </aside>
        </section>

        <div className="d82-grid2">
          <section className="d82-panel">
            <div className="d82-title"><div><h2>What it carries.</h2><p>The parts of your public NexMarkets record that should travel with one identity.</p></div></div>
            <div className="d82-row"><div><h4>Receipts</h4><p>Trades, launches and settlements carry the same account name.</p></div><div className="d82-row-meta"><span className="d82-pill gold">{dashboard.receipts.length} saved</span></div></div>
            <div className="d82-row"><div><h4>Rewards</h4><p>Weekly reward status and badge are attached to your dashboard record.</p></div><div className="d82-row-meta"><span className="d82-pill green">{dashboard.rewards.badge}</span></div></div>
            <div className="d82-row"><div><h4>Referral trail</h4><p>{referralUrl || "Mint .id to activate your referral link."}</p></div><div className="d82-row-meta"><span className="d82-pill">{dashboard.referralStats.clicks} clicks</span></div></div>
          </section>

          <section className="d82-panel">
            <div className="d82-title"><div><h2>Proof.</h2><p>Your latest receipt records.</p></div><Link className="btn" href="/receipts">Open archive</Link></div>
            {dashboard.receipts.slice(0, 5).map((receipt) => (
              <div className="d82-row" key={receipt.id}>
                <div><h4>{receipt.narrativeName}</h4><p>{receipt.proofLevel}</p></div>
                <div className="d82-row-meta"><span className="d82-pill gold">{receipt.edgePoints} pts</span></div>
              </div>
            ))}
            {!dashboard.receipts.length ? <div className="d82-row"><div><h4>No receipts yet</h4><p>Trade or launch a market to create proof.</p></div><div className="d82-row-meta"><span className="d82-pill">Empty</span></div></div> : null}
          </section>
        </div>
      </div>
    </section>
  );
}
