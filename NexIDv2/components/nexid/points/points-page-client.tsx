"use client";

import { useEffect, useState } from "react";
import { fetchDashboardApi, fetchBoardApi } from "@/lib/services/nexid-client";
import type { BoardEntry, DashboardSnapshot } from "@/lib/types/nexid";
import { BoardList } from "@/components/nexid/shared/board-list";

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
    <section id="points" className="view active">
      <div className="global-hero"><div><div className="eyebrow"><i className="dot" /> Global Points</div><h2>{points.toLocaleString()}</h2><p>Your live season rank is {rank}. Points unlock reward levels, while weekly score determines reward share.</p></div><div className="points-orb"><div><b>{rank}</b><span style={{ display: "block", textAlign: "center", color: "#b8ad9d", fontWeight: 950, textTransform: "uppercase", letterSpacing: ".08em" }}>Rank</span></div></div></div>
      {rewards ? <div className="reward-brief points-reward-brief"><div><div className="eyebrow"><i className="dot" /> .id Rewards</div><h3>{rewards.badge}</h3><p>Weekly score {Math.round(rewards.weeklyScore).toLocaleString()} - projected ${rewards.projectedUsd.toFixed(2)} from a ${rewards.rewardPoolUsd.toFixed(2)} pool.</p></div><div className="reward-meter"><span style={{ width: `${rewards.progressPct}%` }} /></div></div> : null}
      <div className="points-timeline">{dashboard?.points.events.length ? dashboard.points.events.map((event) => <div className="points-event" key={event.id}><time>{new Date(event.createdAt).toLocaleDateString()}</time><b>{event.reason}</b><span>{event.points}</span></div>) : <div className="points-event"><time>Season</time><b>No point events yet</b><span>0</span></div>}</div>
      <section className="section"><div className="section-head"><div><div className="eyebrow"><i className="dot" /> Global board</div><h2>Current leaders.</h2></div></div><BoardList rows={globalBoard} /></section>
    </section>
  );
}
