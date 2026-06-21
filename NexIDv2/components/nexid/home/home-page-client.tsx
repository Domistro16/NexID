"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBoardsApi, fetchNarrativesApi } from "@/lib/services/nexid-client";
import type { BoardEntry, BoardKey, Narrative } from "@/lib/types/nexid";
import { BoardList } from "@/components/nexid/shared/board-list";
import { Logo } from "@/components/nexid/shared/logo";
import { MarketTable } from "@/components/nexid/shared/market-table";
import { emptyBoards, fmtCurrency } from "@/components/nexid/shared/utils";

export function HomePageClient() {
  const [narratives, setNarratives] = useState<Narrative[]>([]);
  const [boards, setBoards] = useState<Record<BoardKey, BoardEntry[]>>(emptyBoards);

  useEffect(() => {
    void Promise.all([fetchNarrativesApi(), fetchBoardsApi()]).then(([nextNarratives, nextBoards]) => {
      setNarratives(nextNarratives);
      setBoards(nextBoards);
    }).catch(() => undefined);
  }, []);

  const top = narratives.slice(0, 3);
  const leader = boards.faders[0] ?? boards.riders[0] ?? boards.global[0];
  const receipt = boards.receipts[0];
  const hasLiveActivity = Boolean(leader || receipt || top.length);

  return (
    <section id="home" className="view active">
      <div className="hero">
        <div className="hero-main">
          <div className="hero-copy">
            <div className="eyebrow"><i className="dot" /> Live CT edge</div>
            <h1>Trade the timeline. Prove your edge.</h1>
            <p>Ride or fade live narratives. Turn positions into receipts, Edge Points, ranks and a portable .id edge profile.</p>
            <div className="hero-ctas">
              <Link className="primary" href="/markets">Explore live markets</Link>
              <Link className="btn" href="/markets">{top[0] ? "Open top heat" : "Open Pulse"}</Link>
            </div>
          </div>
          <div className="live-strip">
            {top.map((item) => (
              <div className="strip-card" key={item.id}>
                <b>{item.name}</b>
                <span>{item.heat} heat - {item.move7d > 0 ? "+" : ""}{item.move7d}% - {fmtCurrency(item.liquidity)}</span>
              </div>
            ))}
          </div>
        </div>
        <aside className="hero-side">
          <div className="pulse-card">
            <div className="pulse-top"><span className="pill">Dominating now</span><span className="pill">Live</span></div>
            <h2>{leader ? leader.rank : "No leader yet"}</h2>
            <p>{leader ? `${leader.identity} leads with ${leader.thesis}.` : "No wallet has earned board-eligible points yet."}</p>
          </div>
          <div className="ticker">
            {receipt ? <div className="ticker-row"><div><b>{receipt.identity} generated a receipt</b><span>{receipt.thesis}</span></div><strong className="move up">{receipt.points}</strong></div> : null}
            {top.map((item) => (
              <div className="ticker-row" key={item.id}>
                <div><b>{item.name}</b><span>{item.riders.toLocaleString()} riders - {fmtCurrency(item.liquidity)} liquidity</span></div>
                <strong className={item.move7d >= 0 ? "move up" : "move down"}>{item.move7d > 0 ? "+" : ""}{item.move7d}%</strong>
              </div>
            ))}
            {!hasLiveActivity ? <div className="ticker-row"><div><b>No live activity yet</b><span>Board data will appear after real positions, receipts or positive points exist.</span></div><strong>-</strong></div> : null}
          </div>
        </aside>
      </div>
      <MarketTable narratives={narratives} title="Live board" />
      <section className="section card-grid">
        <div className="receipt-card">
          <div className="rc-top"><div className="rc-logo"><Logo /> NexID</div><div className="rc-kicker">Receipt</div></div>
          <div className="rc-main"><h2>{receipt?.result ?? "No receipt"}</h2><p>{receipt ? `${receipt.identity} ${receipt.thesis} and moved to ${receipt.rank}.` : "Verified receipts will appear here after real positions are generated."}</p></div>
          <div className="rc-metrics">
            {[["Board", receipt?.rank ?? "-"], ["Result", receipt?.result ?? "-"], ["Points", receipt?.points ?? "0"], ["Source", "Live"]].map(([label, value]) => <div className="rc-metric" key={label}><span>{label}</span><b>{value}</b></div>)}
          </div>
        </div>
        <div className="small-stack">
          <div className="small-card"><h3>Receipts, not talk.</h3><p>Every filled position can become a card, rank movement and reputation event.</p><Link className="btn" href="/boards">Open EdgeBoards</Link></div>
          <div className="small-card"><h3>Own the history.</h3><p>.id turns receipts, board identity and referrals into one portable edge profile.</p><Link className="primary" href="/mint">Mint .id</Link></div>
        </div>
      </section>
      <section className="home75-section">
        <div className="home75-section-head">
          <div>
            <span className="home75-kicker">
              <i className="home75-dot" /> EdgeBoard
            </span>
            <h2>Rise when your trades hit.</h2>
          </div>
          <p>Valid launches, trades and settled receipts can raise your rank.</p>
        </div>
        <div className="home75-edge-visual-grid">
          <Link
            href="/boards"
            className="home75-edge-visual home75-edge-v-rank"
            aria-label="Open EdgeBoard"
          >
            <div className="home75-v-rank-stage">
              <span className="home75-v-rank-main">#3</span>
              <span className="home75-v-rank-move">+18</span>
              <div className="home75-v-ladder">
                <i />
                <i />
                <i />
                <i />
              </div>
              <svg className="home75-v-path" viewBox="0 0 260 120">
                <path d="M16 96 C 64 86, 75 54, 116 62 S 175 34, 244 20" />
                <circle cx="244" cy="20" r="5" />
              </svg>
            </div>
          </Link>
          <Link
            href="/dashboard"
            className="home75-edge-visual home75-edge-v-card"
            aria-label="Open Dashboard"
          >
            <div className="home75-v-card-stack">
              <div className="home75-v-card-shadow" />
              <div className="home75-v-card-face">
                <div className="home75-v-card-brand">
                  <i />
                  <span />
                </div>
                <b>#15</b>
                <div className="home75-v-card-lines">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="home75-v-card-stats">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </Link>
          <Link
            href="/launch"
            className="home75-edge-visual home75-edge-v-record"
            aria-label="Open Launch"
          >
            <div className="home75-v-orbit">
              <span />
              <span />
              <span />
              <span />
              <div className="home75-v-core">
                <i />
              </div>
              <div className="home75-v-ring one" />
              <div className="home75-v-ring two" />
            </div>
          </Link>
        </div>
      </section>
    </section>
  );
}
