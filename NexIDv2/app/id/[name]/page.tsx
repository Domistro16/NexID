import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { shortWalletAddress } from "@/lib/identity";
import { getPublicPassportProfile } from "@/lib/services/passportProfileService";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const profile = await getPublicPassportProfile(name);
  return {
    title: profile ? `${profile.name} | NexMarkets Passport` : "Passport | NexMarkets",
    description: profile ? `${profile.identity} NexMarkets public passport.` : "Public NexMarkets .id passport."
  };
}

export default async function PublicPassportPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const profile = await getPublicPassportProfile(name);
  if (!profile) notFound();
  const firstLetter = profile.name.replace(/[^a-z0-9]/gi, "").slice(0, 1).toUpperCase() || "N";
  const volumeLabel = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Math.max(profile.edgeScoreTotal, profile.pointsTotal) * 100);

  return (
    <NexidAppShell>
      <section id="profile" className="view active">
        <div className="nx90-profile">
          <section className="nx90-hero">
            <div>
              <div className="nx90-backline">
                <Link className="btn" href="/markets">Back to markets</Link>
                <span className="nx90-kicker">Public Passport</span>
              </div>
              <h1>{profile.name}</h1>
              <p>{profile.identity} carries receipts, EdgeBoard performance, creator reputation and referral history through NexMarkets.</p>
              <div className="nx90-hero-actions">
                <Link className="primary" href="/mint">Mint .id</Link>
                <Link className="btn" href="/edgeboard">Open EdgeBoard</Link>
              </div>
              <div className="nx90-stat-grid">
                <div className="nx90-stat"><span>Wallet</span><b>{shortWalletAddress(profile.walletAddress) || "-"}</b></div>
                <div className="nx90-stat"><span>Points</span><b>{profile.pointsTotal.toLocaleString()}</b></div>
                <div className="nx90-stat"><span>Edge</span><b>{profile.edgeScoreTotal.toLocaleString()}</b></div>
                <div className="nx90-stat"><span>Badge</span><b>{profile.rewardBadge}</b></div>
              </div>
            </div>
            <aside className="nx90-identity-card">
              <div className="nx90-avatar">{firstLetter}</div>
              <h3>{profile.identity}</h3>
              <p>Public trust record for trade history, market receipts and board status.</p>
              <div className="nx90-id-stats">
                <div><span>Receipts</span><b>{profile.receipts.length}</b></div>
                <div><span>Volume</span><b>${volumeLabel}</b></div>
                <div><span>Rank</span><b>{profile.pointsTotal ? "Active" : "Building"}</b></div>
              </div>
            </aside>
          </section>

          <div className="nx90-layout">
            <main>
              <section className="nx90-panel">
                <div className="nx90-tabs">
                  <button className="active">Overview</button>
                  <button>Receipts</button>
                  <button>Edge</button>
                </div>
                <h2>Public proof.</h2>
                <p className="nx90-sub">A visible record of market actions connected to this .id.</p>
                <div className="nx90-chart">
                  <div className="nx90-chart-live"><span>Edge score</span><b>{profile.edgeScoreTotal.toLocaleString()}</b></div>
                  <svg viewBox="0 0 600 220" preserveAspectRatio="none" aria-label="Public profile edge history">
                    <defs>
                      <linearGradient id="nx90Line" x1="0" x2="1" y1="0" y2="0">
                        <stop stopColor="#16c784" />
                        <stop offset="1" stopColor="#ffb000" />
                      </linearGradient>
                    </defs>
                    <g className="grid">
                      <line x1="0" x2="600" y1="60" y2="60" />
                      <line x1="0" x2="600" y1="120" y2="120" />
                      <line x1="0" x2="600" y1="180" y2="180" />
                    </g>
                    <path className="line-shadow" d="M0 172 C80 160 120 148 180 154 S285 116 345 126 455 80 600 54" />
                    <path className="line" d="M0 172 C80 160 120 148 180 154 S285 116 345 126 455 80 600 54" />
                    <circle className="end" cx="600" cy="54" r="7" />
                  </svg>
                </div>
              </section>

              <section className="nx90-panel">
                <h2>Receipts.</h2>
                <p className="nx90-sub">The latest public proof cards attached to this account.</p>
                {profile.receipts.length ? (
                  <div className="nx90-card-grid">
                    {profile.receipts.map((receipt) => (
                      <article className="nx90-proof-card" key={receipt.id}>
                        <div><span className="nx90-pill gold">{receipt.result}</span><h4>{receipt.title}</h4><p>{receipt.points.toLocaleString()} points recorded on this passport.</p></div>
                        <div className="nx90-card-stats"><div><span>Proof</span><b>{receipt.result}</b></div><div><span>Points</span><b>{receipt.points}</b></div></div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="nx90-row"><div><h4>No public receipts yet</h4><p>Receipts will appear after real market activity is saved.</p></div><span className="nx90-pill">Building</span></div>
                )}
              </section>
            </main>
            <aside className="nx90-panel">
              <h3>What this carries</h3>
              <div className="nx90-row"><div><h4>Trading record</h4><p>Positions and receipts connected to this public account.</p></div><span className="nx90-pill green">Public</span></div>
              <div className="nx90-row"><div><h4>Creator proof</h4><p>Launched markets and clean settlement history when available.</p></div><span className="nx90-pill gold">Market</span></div>
              <div className="nx90-row"><div><h4>Reward identity</h4><p>Badges, points and EdgeBoard movement travel with one name.</p></div><span className="nx90-pill">{profile.rewardBadge}</span></div>
            </aside>
          </div>
        </div>
      </section>
    </NexidAppShell>
  );
}
