"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBoardApi, fetchDashboardApi } from "@/lib/services/nexid-client";
import type { BoardEntry, DashboardSnapshot } from "@/lib/types/nexid";
import { toTitleLabel } from "@/components/nexmarkets/copy";

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

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function initials(value: string) {
  return (value.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "NX").toUpperCase();
}

export function PointsPageClient() {
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [globalBoard, setGlobalBoard] = useState<BoardEntry[]>([]);

  useEffect(() => {
    void Promise.all([fetchDashboardApi().catch(() => null), fetchBoardApi("global")]).then(([snapshot, board]) => {
      setDashboard(snapshot);
      setGlobalBoard(board);
    }).catch(() => undefined);
  }, []);

  const points = dashboard?.points.total ?? 0;
  const rank = dashboard?.points.rank ?? "Unranked";
  const rewards = dashboard?.rewards;

  return (
    <section id="dashboard" className="view active">
      <div className="d82">
        <section className="d82-hero">
          <div>
            <span className="d82-kicker"><i className="d82-dot" /> Global Points</span>
            <h1>{points.toLocaleString()}</h1>
            <p>Your live season rank is {rank}. Points unlock reward levels, while weekly score determines reward share.</p>
            <div className="d82-hero-actions"><Link className="primary" href="/edgeboard">Open EdgeBoard</Link><Link className="btn" href="/my-edge">Dashboard</Link></div>
            <div className="d82-rhythm">
              <div><span>Rank</span><b>{rank}</b></div>
              <div><span>Level</span><b>{rewards?.level ?? "Scout"}</b></div>
              <div><span>Weekly</span><b>{Math.round(rewards?.weeklyScore ?? 0).toLocaleString()}</b></div>
              <div><span>Projected</span><b>{money(rewards?.projectedUsd ?? 0)}</b></div>
            </div>
          </div>
          <aside className="d82-passport-card">
            <div>
              <div className="d82-avatar-row"><div className="d82-avatar">P</div><span className="d82-pill gold">{rewards?.badge ?? "Signal Scout"}</span></div>
              <h3>{rank}</h3>
              <p>{rewards ? `${rewards.badge}. ${rewards.nextLevel ? `${rewards.nextLevel.minPoints.toLocaleString()} points unlock ${rewards.nextLevel.level}.` : "Top level reached."}` : "Connect a wallet to load reward progress."}</p>
            </div>
            <div className="d82-scoreline"><div className="d82-scoreline-top"><span>Reward progress</span><b>{Math.round(rewards?.progressPct ?? 0)}%</b></div><div className="d82-meter"><i style={{ width: `${Math.max(0, Math.min(100, rewards?.progressPct ?? 0))}%` }} /></div></div>
          </aside>
        </section>

        <div className="d82-layout">
          <main className="d82-main">
            <section className="d82-panel">
              <div className="d82-title"><div><h2>Point events.</h2><p>Season points from trades, launches, receipts and referrals.</p></div></div>
              <div className="d82-timeline">
                {dashboard?.points.events.length ? dashboard.points.events.map((event) => (
                  <div className="d82-time-row" key={event.id}><i /><b>{pointReasonLabel(event.reason)}</b><span>{event.points} points - {new Date(event.createdAt).toLocaleDateString()}</span></div>
                )) : <div className="d82-time-row"><i /><b>No point events yet</b><span>Your first scored action appears here.</span></div>}
              </div>
            </section>
          </main>
          <aside className="edge65-side">
            <section className="edge65-me edge65-reveal">
              <span className="edge65-pill gold"><i className="edge65-dot" /> Global board</span>
              <h3>{globalBoard[0] ? `${globalBoard[0].identity} leads.` : "No leader yet."}</h3>
              <p>{globalBoard[0]?.thesis ?? "The board stays empty until earned activity qualifies for a rank."}</p>
              <div className="edge65-mini-grid" style={{ marginTop: 16 }}>
                {globalBoard.slice(0, 4).map((row) => (
                  <div className="edge65-mini" key={row.id}><span>{row.rank}</span><b>{initials(row.identity)}</b></div>
                ))}
                {!globalBoard.length ? <div className="edge65-mini"><span>Entries</span><b>0</b></div> : null}
              </div>
              <div className="edge65-actions" style={{ marginTop: 14 }}><Link className="primary" href="/edgeboard">Open board</Link></div>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}
