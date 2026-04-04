"use client";

import { useEffect, useRef, useState } from "react";
import AdminShell from "../_components/AdminShell";

interface Stats {
  escrowTvlUsdc: number;
  escrowError: string | null;
  totalPrizePoolUsdc: string;
  totalCampaigns: number;
  liveCampaigns: number;
  pendingCampaignRequests: number;
  totalCampaignParticipants: number;
  totalCompletedParticipants: number;
  recentEnrollments: number;
  recentCompletions: number;
  campaignStats: Array<{
    campaignId: number;
    title: string;
    status: string;
    participants: number;
    completions: number;
  }>;
}

interface ActivityEvent {
  type: string;
  label: string;
  createdAt: string;
}

interface PointsSyncResult {
  synced: true;
  campaignsProcessed: number;
  results: Array<{
    campaignId: number;
    title: string;
    usersUpdated: number;
    txHash?: string;
    error?: string;
  }>;
}

const EVENT_COLORS: Record<string, string> = {
  ENROLLMENT: "text-blue-500",
  COMPLETION: "text-green-500",
  CAMPAIGN_REQUEST: "text-nexid-gold",
  DISTRIBUTION: "text-purple-500",
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingPoints, setSyncingPoints] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const headers = authHeaders();

    Promise.all([
      fetch("/api/admin/stats", { headers }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/activity", { headers }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([statsData, activityData]) => {
        if (statsData) setStats(statsData);
        if (activityData?.events) setEvents(activityData.events);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events]);

  async function handleSyncPoints() {
    const headers = authHeaders();
    setSyncingPoints(true);
    setSyncMessage(null);

    try {
      const response = await fetch("/api/admin/sync-points", {
        method: "POST",
        headers,
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Failed to sync points");
      }

      const result = body as PointsSyncResult;
      const updatedUsers = result.results.reduce((sum, row) => sum + row.usersUpdated, 0);
      const failedCampaigns = result.results.filter((row) => row.error).length;
      setSyncMessage(
        `Synced ${updatedUsers} user point updates across ${result.campaignsProcessed} campaigns${failedCampaigns > 0 ? `, ${failedCampaigns} failed` : ""}.`,
      );
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Failed to sync points");
    } finally {
      setSyncingPoints(false);
    }
  }

  const tvlDisplay = stats
    ? stats.escrowTvlUsdc > 0
      ? `$${stats.escrowTvlUsdc.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
      : "$0"
    : "...";

  const prizePoolDisplay = stats
    ? `$${Number(stats.totalPrizePoolUsdc).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "...";

  return (
    <AdminShell active="overview">
      <section className="space-y-6 max-w-[1600px] mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-nexid-muted text-sm">Loading stats...</div>
        ) : (
          <>
            <div className="admin-panel p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-mono text-nexid-gold uppercase tracking-widest">Manual Jobs</div>
                <div className="text-sm text-white font-medium">Push partner campaign scores to the on-chain points contracts.</div>
                {syncMessage ? (
                  <div className="text-[11px] font-mono text-nexid-muted mt-1">{syncMessage}</div>
                ) : (
                  <div className="text-[11px] font-mono text-nexid-muted mt-1">Uses the same sync path as the cron job.</div>
                )}
              </div>
              <button
                type="button"
                onClick={handleSyncPoints}
                disabled={syncingPoints}
                className="text-[11px] font-display font-bold px-4 py-2 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {syncingPoints ? "Syncing..." : "Sync Points"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="admin-panel p-4 flex flex-col justify-between h-28 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-[radial-gradient(circle_at_top_right,rgba(255,176,0,0.15),transparent_70%)] pointer-events-none" />
                <div className="text-[10px] font-mono text-nexid-gold uppercase tracking-widest">Escrow Treasury (TVL)</div>
                <div>
                  <div className="text-3xl font-display text-white tracking-tight">{tvlDisplay}</div>
                  {stats?.escrowError ? (
                    <div className="text-[10px] font-mono text-red-500">{stats.escrowError}</div>
                  ) : (
                    <div className="text-[10px] font-mono text-nexid-muted">On-chain USDC balance</div>
                  )}
                </div>
              </div>
              <div className="admin-panel p-4 flex flex-col justify-between h-28">
                <div className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest">Total Prize Pools (DB)</div>
                <div>
                  <div className="text-3xl font-display text-white tracking-tight">{prizePoolDisplay}</div>
                  <div className="text-[10px] font-mono text-nexid-muted">Live + Draft campaigns</div>
                </div>
              </div>
              <div className="admin-panel p-4 flex flex-col justify-between h-28">
                <div className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest">Active Partner Campaigns</div>
                <div>
                  <div className="text-3xl font-display text-white tracking-tight">
                    {stats?.totalCampaigns ?? 0}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-green-400">{stats?.liveCampaigns ?? 0} Live</span>
                    {(stats?.pendingCampaignRequests ?? 0) > 0 ? (
                      <span className="text-[10px] font-mono text-nexid-gold border border-nexid-gold/30 px-1.5 py-0.5 rounded inline-block bg-nexid-gold/10">
                        {stats!.pendingCampaignRequests} Pending
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="admin-panel p-4 flex flex-col justify-between h-28">
                <div className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest">Global Enrollments</div>
                <div>
                  <div className="text-3xl font-display text-white tracking-tight">
                    {(stats?.totalCampaignParticipants ?? 0).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-mono text-green-400">
                      {stats?.totalCompletedParticipants ?? 0} completed
                    </span>
                    <span className="text-[10px] font-mono text-nexid-muted">
                      +{stats?.recentEnrollments ?? 0} this week
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 admin-panel p-5 flex flex-col h-[350px]">
                <div className="flex justify-between items-center mb-4 shrink-0">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-nexid-muted">Campaign Performance</h3>
                </div>
                <div className="flex-1 overflow-y-auto custom-scroll">
                  {stats?.campaignStats && stats.campaignStats.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#222] text-nexid-muted font-mono text-[10px] uppercase tracking-widest">
                          <th className="text-left py-2 px-2">Campaign</th>
                          <th className="text-center py-2 px-2">Status</th>
                          <th className="text-right py-2 px-2">Enrolled</th>
                          <th className="text-right py-2 px-2">Completed</th>
                          <th className="text-right py-2 px-2">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.campaignStats.map((c) => (
                          <tr key={c.campaignId} className="border-b border-[#111]">
                            <td className="py-2 px-2 text-white">{c.title}</td>
                            <td className="py-2 px-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase ${c.status === "LIVE" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-[#222] text-nexid-muted border border-[#333]"}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-nexid-muted">{c.participants}</td>
                            <td className="py-2 px-2 text-right font-mono text-green-400">{c.completions}</td>
                            <td className="py-2 px-2 text-right font-mono text-nexid-gold">
                              {c.participants > 0 ? `${Math.round((c.completions / c.participants) * 100)}%` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex items-center justify-center h-full text-nexid-muted text-sm">No campaigns yet</div>
                  )}
                </div>
              </div>

              <div className="admin-panel p-5 flex flex-col h-[350px]">
                <h3 className="text-xs font-mono uppercase tracking-widest text-nexid-muted mb-4 shrink-0 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-nexid-success rounded-full animate-pulse" /> Activity Feed
                </h3>
                <div
                  ref={logRef}
                  className="flex-1 overflow-y-auto custom-scroll bg-[#030303] border border-[#111] rounded p-3 matrix-log space-y-2"
                >
                  {events.length === 0 ? (
                    <div className="text-nexid-muted text-xs text-center py-8">No recent activity</div>
                  ) : (
                    events.map((evt, i) => (
                      <div key={i} className="text-xs">
                        <span className={EVENT_COLORS[evt.type] ?? "text-nexid-muted"}>
                          [{formatTime(evt.createdAt)}]
                        </span>{" "}
                        {evt.label}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </AdminShell>
  );
}
