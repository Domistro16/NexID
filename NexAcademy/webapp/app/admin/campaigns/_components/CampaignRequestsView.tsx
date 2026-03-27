"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "./useAdminFetch";
import type { CampaignRequestRow } from "./types";

interface Props {
  onCreateFromRequest: (request: CampaignRequestRow) => void;
}

type ReqFilter = "all" | "PENDING" | "APPROVED" | "REJECTED";

export default function CampaignRequestsView({ onCreateFromRequest }: Props) {
  const { authFetch } = useAdminFetch();
  const [requests, setRequests] = useState<CampaignRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReqFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/campaign-requests");
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests ?? []);
      }
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleDecision = async (id: string, decision: "APPROVE" | "REJECT", createCampaign: boolean) => {
    setActing(id);
    try {
      const res = await authFetch(`/api/admin/campaign-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          decision,
          reviewNotes: reviewNotes[id] || null,
          createCampaign,
        }),
      });
      if (res.ok) {
        await fetchRequests();
        setExpandedId(null);
      }
    } catch {
      /* handled */
    } finally {
      setActing(null);
    }
  };

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);
  const countByStatus = (s: string) => requests.filter((r) => r.status === s).length;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/25",
      APPROVED: "bg-green-500/10 text-green-400 border-green-500/25",
      REJECTED: "bg-red-500/10 text-red-400 border-red-500/25",
    };
    return (
      <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${map[status] ?? ""}`}>
        {status}
      </span>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-2">Partner Campaign Requests</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Pending", value: countByStatus("PENDING"), color: "text-amber-400" },
              { label: "Approved", value: countByStatus("APPROVED"), color: "text-green-400" },
              { label: "Rejected", value: countByStatus("REJECTED"), color: "text-red-400" },
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
        {(["all", "PENDING", "APPROVED", "REJECTED"] as ReqFilter[]).map((f) => {
          const labels: Record<ReqFilter, string> = {
            all: `All (${requests.length})`,
            PENDING: `Pending (${countByStatus("PENDING")})`,
            APPROVED: `Approved (${countByStatus("APPROVED")})`,
            REJECTED: `Rejected (${countByStatus("REJECTED")})`,
          };
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

      {/* Requests list */}
      {loading ? (
        <div className="text-center py-12 text-neutral-500 text-xs font-mono">Loading requests...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-neutral-500 text-xs font-mono">No requests found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="bg-[#060606] border border-white/[.06] rounded-xl overflow-hidden hover:border-white/10 transition-colors">
              <div
                className="flex items-center gap-3 px-3.5 py-3 cursor-pointer"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-[13px] text-white truncate">{r.campaignTitle}</div>
                  <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                    {r.partnerName} · {r.tier.replace("_", " ")} · ${Number(r.prizePoolUsdc).toLocaleString()} USDC
                  </div>
                </div>
                {statusBadge(r.status)}
                {r.linkedCampaignId && (
                  <span className="text-[9px] font-mono text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                    Campaign #{r.linkedCampaignId}
                  </span>
                )}
              </div>

              {expandedId === r.id && (
                <div className="px-3.5 pb-3.5 border-t border-white/[.06]">
                  {/* Request details */}
                  <div className="grid grid-cols-2 gap-3 mt-3 mb-3">
                    <div>
                      <div className="text-[9px] font-mono uppercase text-neutral-500 mb-1">Objective</div>
                      <div className="text-[11px] text-neutral-300 leading-relaxed">{r.primaryObjective}</div>
                    </div>
                    <div className="space-y-2">
                      {r.callBookedFor && (
                        <div>
                          <div className="text-[9px] font-mono uppercase text-neutral-500 mb-0.5">Call Booked</div>
                          <div className="text-[11px] text-neutral-300 font-mono">
                            {new Date(r.callBookedFor).toLocaleDateString()} · {r.callTimeSlot} ({r.callTimezone})
                          </div>
                        </div>
                      )}
                      {r.callBookingNotes && (
                        <div>
                          <div className="text-[9px] font-mono uppercase text-neutral-500 mb-0.5">Call Notes</div>
                          <div className="text-[11px] text-neutral-400">{r.callBookingNotes}</div>
                        </div>
                      )}
                      {r.briefFileName && (
                        <div>
                          <div className="text-[9px] font-mono uppercase text-neutral-500 mb-0.5">Brief</div>
                          <div className="text-[11px] text-nexid-gold font-mono">{r.briefFileName}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Linked campaign info */}
                  {r.linkedCampaignId && (
                    <div className="bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2 mb-3 text-[10px] font-mono text-green-400">
                      Linked to campaign: <span className="text-white font-bold">{r.linkedCampaignTitle}</span> · Status: {r.linkedCampaignStatus}
                    </div>
                  )}

                  {/* Review notes for already reviewed */}
                  {r.reviewNotes && r.status !== "PENDING" && (
                    <div className="bg-[#0a0a0a] border border-white/[.06] rounded-lg px-3 py-2 mb-3 text-[10px] font-mono text-neutral-400">
                      Review notes: {r.reviewNotes}
                    </div>
                  )}

                  {/* Actions for PENDING requests */}
                  {r.status === "PENDING" && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] font-mono uppercase text-neutral-500 block mb-1">Review Notes</label>
                        <textarea
                          className="w-full bg-[#0a0a0a] border border-white/[.06] rounded-lg px-3 py-2 text-[11px] text-white font-mono outline-none focus:border-nexid-gold/40 resize-none"
                          rows={2}
                          placeholder="Optional review notes..."
                          value={reviewNotes[r.id] ?? ""}
                          onChange={(e) => setReviewNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDecision(r.id, "APPROVE", true)}
                          disabled={acting === r.id}
                          className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-green-500 bg-green-500 text-black hover:bg-green-400 transition-colors disabled:opacity-50"
                        >
                          {acting === r.id ? "..." : "Approve & Create Campaign"}
                        </button>
                        <button
                          onClick={() => onCreateFromRequest(r)}
                          disabled={acting === r.id}
                          className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-nexid-gold bg-nexid-gold text-black hover:bg-yellow-400 transition-colors disabled:opacity-50"
                        >
                          Open in Builder
                        </button>
                        <button
                          onClick={() => handleDecision(r.id, "REJECT", false)}
                          disabled={acting === r.id}
                          className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
