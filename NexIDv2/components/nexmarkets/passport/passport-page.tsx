import Link from "next/link";
import { toTitleLabel } from "@/components/nexmarkets/copy";
import { resolveIdentityLabel, shortWalletAddress } from "@/lib/identity";
import type { DashboardSnapshot } from "@/lib/types/nexid";

export function PassportPage({ dashboard }: { dashboard: DashboardSnapshot }) {
  const identity = resolveIdentityLabel(dashboard.user);
  const hasIdentity = Boolean(dashboard.user);
  const primaryId = dashboard.idNames.find((item) => item.isPrimary) ?? dashboard.idNames[0] ?? null;

  return (
    <section className="view active">
      <div className="card-grid">
        <div className="receipt-card">
          <div className="rc-top">
            <div className="rc-logo">NexMarkets Passport</div>
            <div className="rc-kicker">{hasIdentity ? "Live Identity" : "Connect Wallet"}</div>
          </div>
          <div className="rc-main">
            <h2>{hasIdentity ? identity : ".id"}</h2>
            <p>
              {hasIdentity
                ? "This passport carries trading receipts, creator history, EdgeBoard status, referrals, and rewards."
                : "Connect a wallet to load your portable NexMarkets passport."}
            </p>
          </div>
          <div className="rc-metrics">
            <div className="rc-metric"><span>Wallet</span><b>{shortWalletAddress(dashboard.user?.walletAddress) || "-"}</b></div>
            <div className="rc-metric"><span>Points</span><b>{dashboard.points.total}</b></div>
            <div className="rc-metric"><span>Receipts</span><b>{dashboard.receipts.length}</b></div>
            <div className="rc-metric"><span>Reward</span><b>{dashboard.rewards.badge}</b></div>
          </div>
        </div>
        <div className="small-stack">
          <div className="small-card">
            <h3>{primaryId ? primaryId.label : "No .id yet"}</h3>
            <p>{primaryId ? `Your .id is ${toTitleLabel(primaryId.status)}.` : "Mint or connect a primary .id to unlock creator identity and referral economics."}</p>
            <Link className="primary" href="/mint">Mint .id</Link>
          </div>
          <div className="small-card">
            <h3>Referral engine</h3>
            <p>{dashboard.referralStats.mints} mints, {dashboard.referralStats.clicks} clicks, ${dashboard.referralStats.paid.toFixed(2)} paid.</p>
            <Link className="btn" href="/my-edge">Open My Edge</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
