"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "./useAdminFetch";

interface ParticipantRow {
  userId: string;
  walletAddress: string;
  domainName: string | null;
  campaignCount: number;
  totalScore: number;
  bestRank: number | null;
  flagCount: number;
  joinedAt: string;
  verificationTier: string;
}

export default function UsersView() {
  const { authFetch } = useAdminFetch();
  const [users, setUsers] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      // Use campaigns endpoint to build a participant summary
      const res = await authFetch("/api/admin/campaigns");
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();

      // For now, show campaign-level data since we don't have a dedicated users endpoint
      // In production this would be a dedicated /api/admin/users endpoint
      const campaigns = data.campaigns ?? [];
      const userMap = new Map<string, ParticipantRow>();

      // Create placeholder data from campaign metrics
      for (const c of campaigns) {
        if (c.participantCount > 0) {
          const key = `campaign-${c.id}`;
          userMap.set(key, {
            userId: key,
            walletAddress: "—",
            domainName: null,
            campaignCount: 1,
            totalScore: c.topScore,
            bestRank: 1,
            flagCount: 0,
            joinedAt: c.createdAt,
            verificationTier: "BASIC",
          });
        }
      }

      setUsers(Array.from(userMap.values()));
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = search
    ? users.filter((u) =>
        (u.domainName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        u.walletAddress.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-1.5">Participants</div>
          <div className="font-display font-bold text-lg text-white tracking-tight">All Verified Users</div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search .id or wallet..."
            className="bg-[#0a0a0a] border border-white/[.06] rounded-lg px-3 py-1.5 text-[11px] text-white outline-none focus:border-nexid-gold/40 w-48 placeholder:text-neutral-600"
          />
          <button className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:text-white transition-colors">
            ↓ Export CSV
          </button>
        </div>
      </div>

      <div className="bg-[#060606] border border-white/[.06] rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                {["Participant", "Score", "Campaigns", "Tier", "Flags", "Joined"].map((h) => (
                  <th key={h} className="text-[9px] font-mono font-medium tracking-wider uppercase text-neutral-500 px-3 py-2 border-b border-white/[.06] text-left bg-[#0a0a0a] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500 font-mono">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500 font-mono">No participants found</td></tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.userId} className="hover:bg-white/[.01]">
                    <td className="px-3 py-2 border-b border-white/[.03] font-medium text-white">
                      {u.domainName ? (
                        <>{u.domainName.replace(".id", "")}<span className="text-nexid-gold">.id</span></>
                      ) : (
                        <span className="font-mono text-[10px] text-neutral-400">{u.walletAddress}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border-b border-white/[.03] font-mono text-nexid-gold">{u.totalScore}</td>
                    <td className="px-3 py-2 border-b border-white/[.03] font-mono text-neutral-300">{u.campaignCount}</td>
                    <td className="px-3 py-2 border-b border-white/[.03]">
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/[.08]">{u.verificationTier}</span>
                    </td>
                    <td className={`px-3 py-2 border-b border-white/[.03] font-mono ${u.flagCount ? "text-red-400" : "text-green-400"}`}>
                      {u.flagCount ? `${u.flagCount} flag` : "Clean"}
                    </td>
                    <td className="px-3 py-2 border-b border-white/[.03] font-mono text-[10px] text-neutral-500">
                      {new Date(u.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
