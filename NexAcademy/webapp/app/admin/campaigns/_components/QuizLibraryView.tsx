"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "./useAdminFetch";
import type { CampaignRow } from "./types";

interface QuestionPoolSummary {
  campaignId: number;
  campaignTitle: string;
  sponsorName: string;
  total: number;
  mcq: number;
  freeText: number;
  speedTraps: number;
}

interface Props {
  onManagePool: (campaignId: number) => void;
}

export default function QuizLibraryView({ onManagePool }: Props) {
  const { authFetch } = useAdminFetch();
  const [pools, setPools] = useState<QuestionPoolSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/campaigns");
      if (!res.ok) return;
      const data = await res.json();
      const campaigns: CampaignRow[] = data.campaigns ?? [];

      const summaries: QuestionPoolSummary[] = [];
      for (const c of campaigns) {
        try {
          const qRes = await authFetch(`/api/admin/campaigns/${c.id}/questions`);
          if (qRes.ok) {
            const qData = await qRes.json();
            const stats = qData.stats;
            if (stats && stats.total > 0) {
              summaries.push({
                campaignId: c.id,
                campaignTitle: c.title,
                sponsorName: c.sponsorName,
                total: stats.total,
                mcq: stats.mcq ?? 0,
                freeText: stats.freeText ?? 0,
                speedTraps: stats.speedTraps ?? 0,
              });
            }
          }
        } catch {
          /* skip */
        }
      }
      setPools(summaries);
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { fetchPools(); }, [fetchPools]);

  return (
    <div>
      <div className="mb-4">
        <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-1.5">Quiz Library</div>
        <div className="font-display font-bold text-lg text-white tracking-tight">All Question Pools</div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-neutral-500 text-xs font-mono">Loading question pools...</div>
      ) : pools.length === 0 ? (
        <div className="text-center py-12 text-neutral-500 text-xs font-mono">No question pools found. Create questions in the Campaign Builder.</div>
      ) : (
        <div className="space-y-2">
          {pools.map((p) => (
            <div key={p.campaignId} className="bg-[#060606] border border-white/[.06] rounded-xl overflow-hidden hover:border-white/10 transition-colors">
              <div className="flex items-center justify-between px-3.5 py-3">
                <div>
                  <div className="font-display font-bold text-[13px] text-white">{p.campaignTitle}</div>
                  <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                    {p.total} questions · {p.mcq} MCQ · {p.freeText} free-text · {p.speedTraps} speed traps
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onManagePool(p.campaignId)}
                    className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:border-white/20 hover:text-white transition-colors"
                  >
                    Edit Pool →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
