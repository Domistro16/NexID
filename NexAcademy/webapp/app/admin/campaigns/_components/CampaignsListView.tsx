"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "./useAdminFetch";
import type { CampaignRow } from "./types";
import { IconChevronDown } from "./icons";

type StatusFilter = "all" | "LIVE" | "DRAFT" | "ENDED";

interface Props {
  onEditCampaign: (id: number) => void;
  onViewQuestions: (id: number) => void;
}

export default function CampaignsListView({ onEditCampaign, onViewQuestions }: Props) {
  const { authFetch } = useAdminFetch();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/campaigns");
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns ?? []);
      }
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const filtered = filter === "all" ? campaigns : campaigns.filter((c) => c.status === filter);
  const countByStatus = (s: string) => campaigns.filter((c) => c.status === s).length;

  const statusPill = (status: string) => {
    const map: Record<string, string> = {
      LIVE: "bg-green-500/10 text-green-400 border-green-500/25",
      ENDED: "bg-blue-400/10 text-blue-400 border-blue-400/20",
      DRAFT: "bg-white/5 text-neutral-400 border-white/10",
      ARCHIVED: "bg-white/5 text-neutral-500 border-white/10",
    };
    const label: Record<string, string> = { LIVE: "Live", ENDED: "Done", DRAFT: "Draft", ARCHIVED: "Archived" };
    return (
      <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${map[status] ?? map.DRAFT}`}>
        {status === "LIVE" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1 animate-pulse" />}
        {label[status] ?? status}
      </span>
    );
  };

  return (
    <div>
      {/* Stats */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-2">Campaign Management</div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Total", value: campaigns.length, color: "text-white" },
              { label: "Live", value: countByStatus("LIVE"), color: "text-green-400" },
              { label: "Draft", value: countByStatus("DRAFT"), color: "text-amber-400" },
              { label: "Completed", value: countByStatus("ENDED"), color: "text-blue-400" },
            ].map((s) => (
              <div key={s.label} className="bg-[#0a0a0a] border border-white/[.06] rounded-lg px-3 py-2.5">
                <div className="text-[9px] font-mono uppercase text-neutral-500 mb-1">{s.label}</div>
                <div className={`font-display font-extrabold text-lg ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 mb-3">
        {(["all", "LIVE", "DRAFT", "ENDED"] as StatusFilter[]).map((f) => {
          const labels: Record<StatusFilter, string> = { all: `All (${campaigns.length})`, LIVE: `Live (${countByStatus("LIVE")})`, DRAFT: `Draft (${countByStatus("DRAFT")})`, ENDED: `Done (${countByStatus("ENDED")})` };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] font-mono px-2.5 py-1 rounded-md border transition-all ${
                filter === f
                  ? "bg-nexid-gold text-black border-nexid-gold font-bold"
                  : "bg-transparent text-neutral-400 border-white/10 hover:border-white/20 hover:text-white"
              }`}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Campaign list */}
      {loading ? (
        <div className="text-center py-12 text-neutral-500 text-xs font-mono">Loading campaigns...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-neutral-500 text-xs font-mono">No campaigns found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div key={c.id} className="bg-[#060606] border border-white/[.06] rounded-xl overflow-hidden hover:border-white/10 transition-colors">
              {/* Header row */}
              <div
                className="flex items-center gap-3 px-3.5 py-3 cursor-pointer"
                onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-[13px] text-white truncate">{c.title}</div>
                  <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                    {c.sponsorName} · {c.tier.replace("_", " ")} · {c.participantCount.toLocaleString()} entrants
                  </div>
                </div>
                {statusPill(c.status)}
                <div className="font-display font-extrabold text-sm text-nexid-gold mx-2">
                  ${Number(c.prizePoolUsdc).toLocaleString()}
                </div>
                <IconChevronDown className={`w-3 h-3 text-neutral-500 transition-transform ${expandedId === c.id ? "rotate-180" : ""}`} />
              </div>

              {/* Expanded body */}
              {expandedId === c.id && (
                <div className="px-3.5 pb-3.5 border-t border-white/[.06] animate-in fade-in duration-200">
                  {/* Metric cards */}
                  <div className="grid grid-cols-4 gap-2 mt-3 mb-3">
                    {[
                      { label: "Entrants", value: c.participantCount.toLocaleString(), color: "text-white" },
                      { label: "Top Score", value: String(c.topScore), color: "text-nexid-gold" },
                      { label: "On-Chain", value: c.onChainStatus ?? (c.onChainCampaignId ? "Deployed" : "Not deployed"), color: c.onChainCampaignId ? "text-green-400" : "text-neutral-500" },
                      { label: "Escrow", value: c.escrowAddress ? "Verified" : "None", color: c.escrowAddress ? "text-green-400" : "text-neutral-500" },
                    ].map((m) => (
                      <div key={m.label} className="bg-[#0a0a0a] border border-white/[.06] rounded-lg px-2.5 py-2">
                        <div className="text-[9px] font-mono uppercase text-neutral-500 mb-0.5">{m.label}</div>
                        <div className={`font-mono font-semibold text-xs ${m.color}`}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Request info */}
                  {c.requestId && (
                    <div className="bg-[#0a0a0a] border border-white/[.06] rounded-lg px-3 py-2 mb-3 text-[10px] font-mono text-neutral-400">
                      Linked to request from <span className="text-nexid-gold">{c.requestPartnerName}</span> · Status: <span className="text-white">{c.requestStatus}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button onClick={() => onEditCampaign(c.id)} className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-nexid-gold bg-nexid-gold text-black hover:bg-yellow-400 transition-colors">
                      Open Builder
                    </button>
                    <button onClick={() => onViewQuestions(c.id)} className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:border-white/20 hover:text-white transition-colors">
                      Questions
                    </button>
                    {c.status === "LIVE" && (
                      <button className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:text-white transition-colors">
                        Live Analytics
                      </button>
                    )}
                    {c.status === "ENDED" && (
                      <button className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">
                        Payout
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
