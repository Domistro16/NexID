"use client";

import { useEffect, useState } from "react";
import AdminShell from "../_components/AdminShell";

interface LeaderboardRow {
  rank: number;
  walletAddress: string;
  totalPoints: number;
  campaignsFinished: number;
  usdcClaimed: string;
  totalScore: number;
}

interface Summary {
  totalRegistered: number;
  totalDistributedUsdc: string;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function rankColor(rank: number) {
  if (rank === 1) return "text-[#FFD700]";
  if (rank === 2) return "text-[#C0C0C0]";
  if (rank === 3) return "text-[#CD7F32]";
  return "text-nexid-muted";
}

export default function AdminMatrixPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/leaderboard", { headers: authHeaders() })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setRows(data.leaderboard ?? []);
          setSummary(data.summary ?? null);
        }
      })
      .catch((err) => console.error("Leaderboard fetch error:", err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = search.trim()
    ? rows.filter((r) => r.walletAddress.toLowerCase().includes(search.toLowerCase()))
    : rows;

  return (
    <AdminShell active="matrix">
      <section className="max-w-[1400px] mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="admin-panel p-4 flex justify-between items-center bg-[#0a0a0a]">
            <div>
              <div className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-1">Total Registered Users</div>
              <div className="text-2xl font-display text-white">
                {loading ? "..." : (summary?.totalRegistered ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="w-10 h-10 rounded-full border border-[#222] flex items-center justify-center bg-[#111]">LB</div>
          </div>
          <div className="admin-panel p-4 flex justify-between items-center bg-[#0a0a0a]">
            <div>
              <div className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-1">Total USDC Distributed</div>
              <div className="text-2xl font-display text-green-400">
                {loading ? "..." : `$${Number(summary?.totalDistributedUsdc ?? 0).toLocaleString()}`}
              </div>
            </div>
            <div className="w-10 h-10 rounded-full border border-[#222] flex items-center justify-center bg-[#111] text-green-400">US</div>
          </div>
          <div className="admin-panel p-4 flex justify-between items-center bg-[#0a0a0a]">
            <div>
              <div className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-1">Leaderboard Entries</div>
              <div className="text-2xl font-display text-white">
                {loading ? "..." : rows.length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-full border border-[#222] flex items-center justify-center bg-[#111] text-nexid-muted">#</div>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <input
            type="text"
            placeholder="Search wallet address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="admin-input w-64"
          />
          <div className="text-[10px] font-mono text-nexid-muted">
            Top 100 by total points
          </div>
        </div>

        <div className="admin-panel overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-nexid-muted text-sm">Loading leaderboard...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-nexid-muted text-sm">
              {rows.length === 0 ? "No users yet" : "No results match your search"}
            </div>
          ) : (
            <table className="linear-table">
              <thead>
                <tr>
                  <th className="w-12 text-center">Rank</th>
                  <th className="w-auto">Wallet Address</th>
                  <th className="w-32 text-right">Total Points</th>
                  <th className="w-32 text-right">Campaigns Finished</th>
                  <th className="w-32 text-right">USDC Claimed</th>
                  <th className="w-32 text-right">Campaign Score</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.rank}>
                    <td className={`text-center font-mono font-bold ${rankColor(row.rank)}`}>{row.rank}</td>
                    <td className="font-medium text-white font-mono">
                      {row.walletAddress.slice(0, 6)}...{row.walletAddress.slice(-4)}
                    </td>
                    <td className="font-mono text-right text-nexid-gold">{row.totalPoints.toLocaleString()}</td>
                    <td className="font-mono text-right text-white/80">{row.campaignsFinished}</td>
                    <td className="font-mono text-right text-green-400">
                      ${Number(row.usdcClaimed).toLocaleString()}
                    </td>
                    <td className="font-mono text-right text-nexid-muted">{row.totalScore.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
