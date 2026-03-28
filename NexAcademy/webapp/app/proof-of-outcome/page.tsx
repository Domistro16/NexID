"use client";

import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Public Proof of Outcome Dashboard
//
// Strategy: "This is what you sell to protocols. Every campaign generates a
// dashboard that protocols can screenshot, share with investors, and use to
// justify spend."
//
// No auth required — this is public, platform-wide aggregate data.
// ─────────────────────────────────────────────────────────────────────────────

interface ProofOfOutcome {
  botRemovalRate: number;
  averageComprehensionScore: number;
  onChainActionSuccessRate: number;
  scoreDistribution: number[];
  qualitySegments: {
    chartered: number;
    consistent: number;
    verified: number;
    unverified: number;
  };
  totalRewardsDistributed: string;
  totalCampaignsCompleted: number;
  totalUniqueParticipants: number;
  benchmarks: {
    avgCompletionRate: number;
    avgQuizScore: number;
    avgPostCampaignReturnRate: number;
  };
}

const SCORE_BUCKETS = ["0–20", "20–40", "40–60", "60–80", "80–100"];

export default function ProofOfOutcomePage() {
  const [data, setData] = useState<ProofOfOutcome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/proof-of-outcome")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load");
        setData(await res.json());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050505] text-white">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-center text-sm text-neutral-500 font-mono">Loading dashboard...</div>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#050505] text-white">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <div className="text-sm text-red-400 font-mono">{error ?? "No data available"}</div>
        </div>
      </main>
    );
  }

  const seg = data.qualitySegments;
  const totalSegments = seg.chartered + seg.consistent + seg.verified + seg.unverified;
  const segPercent = (n: number) => totalSegments > 0 ? ((n / totalSegments) * 100).toFixed(1) : "0";
  const maxDist = Math.max(...data.scoreDistribution, 1);

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-5xl px-6 py-12 lg:py-20">
        {/* Header */}
        <div className="mb-16 border-b border-[#1a1a1a] pb-10">
          <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-nexid-gold/60 mb-3">
            Platform Intelligence
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl mb-4">
            Proof of Outcome
          </h1>
          <p className="text-sm text-neutral-400 max-w-2xl leading-relaxed">
            Platform-wide aggregate metrics across all NexID campaigns. Real comprehension scores, verified on-chain actions, and post-campaign return rates that no other platform can generate.
          </p>
        </div>

        {/* Hero metrics */}
        <div className="grid grid-cols-2 gap-4 mb-12 md:grid-cols-4">
          <MetricCard
            label="Bot Removal Rate"
            value={`${data.botRemovalRate.toFixed(1)}%`}
            accent="text-red-400"
          />
          <MetricCard
            label="Avg. Comprehension"
            value={`${data.averageComprehensionScore.toFixed(1)}`}
            accent="text-green-400"
          />
          <MetricCard
            label="On-Chain Success"
            value={`${data.onChainActionSuccessRate.toFixed(1)}%`}
            accent="text-nexid-gold"
          />
          <MetricCard
            label="Post-Campaign Return"
            value={`${data.benchmarks.avgPostCampaignReturnRate.toFixed(1)}%`}
            accent="text-blue-400"
          />
        </div>

        {/* Volume stats */}
        <div className="grid grid-cols-1 gap-4 mb-12 md:grid-cols-3">
          <div className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-6">
            <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Total Campaigns Completed</div>
            <div className="text-3xl font-display font-black text-white">{data.totalCampaignsCompleted.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-6">
            <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Unique Participants</div>
            <div className="text-3xl font-display font-black text-white">{data.totalUniqueParticipants.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-6">
            <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Total Rewards Distributed</div>
            <div className="text-3xl font-display font-black text-nexid-gold">${parseFloat(data.totalRewardsDistributed).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Score Distribution */}
          <div className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-6">
            <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-500 mb-6">Score Distribution</div>
            <div className="space-y-3">
              {data.scoreDistribution.map((count, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-12 text-right text-[11px] font-mono text-neutral-500">{SCORE_BUCKETS[i]}</div>
                  <div className="flex-1 h-6 rounded-md bg-[#111] overflow-hidden">
                    <div
                      className="h-full rounded-md bg-gradient-to-r from-nexid-gold/60 to-nexid-gold transition-all"
                      style={{ width: `${(count / maxDist) * 100}%` }}
                    />
                  </div>
                  <div className="w-10 text-right text-[11px] font-mono text-neutral-400">{count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quality Segments */}
          <div className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-6">
            <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-500 mb-6">User Quality Segments</div>
            <div className="space-y-4">
              <SegmentRow label="Chartered" icon="★" count={seg.chartered} percent={segPercent(seg.chartered)} color="text-nexid-gold" />
              <SegmentRow label="Consistent" icon="◈◈" count={seg.consistent} percent={segPercent(seg.consistent)} color="text-green-400" />
              <SegmentRow label="Verified" icon="◈" count={seg.verified} percent={segPercent(seg.verified)} color="text-blue-400" />
              <SegmentRow label="Unverified" icon="○" count={seg.unverified} percent={segPercent(seg.unverified)} color="text-neutral-500" />
            </div>
          </div>
        </div>

        {/* Benchmarks */}
        <div className="mt-8 rounded-2xl border border-nexid-gold/15 bg-nexid-gold/[.03] p-6">
          <div className="text-[9px] font-mono uppercase tracking-widest text-nexid-gold/60 mb-4">Platform Benchmarks</div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <div className="text-[10px] text-neutral-500 mb-1">Avg Completion Rate</div>
              <div className="text-xl font-display font-bold text-white">{data.benchmarks.avgCompletionRate.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-neutral-500 mb-1">Avg Quiz Score</div>
              <div className="text-xl font-display font-bold text-white">{data.benchmarks.avgQuizScore.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-[10px] text-neutral-500 mb-1">Avg 30-Day Return Rate</div>
              <div className="text-xl font-display font-bold text-green-400">{data.benchmarks.avgPostCampaignReturnRate.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-[#1a1a1a] text-center">
          <div className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
            NexID Proof of Outcome · Platform-Wide Aggregate · Updated Daily
          </div>
        </div>
      </div>
    </main>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
      <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-500 mb-2">{label}</div>
      <div className={`text-2xl font-display font-black ${accent}`}>{value}</div>
    </div>
  );
}

function SegmentRow({ label, icon, count, percent, color }: { label: string; icon: string; count: number; percent: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`text-lg ${color}`}>{icon}</div>
        <div className="text-sm text-white">{label}</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-xs font-mono text-neutral-400">{count.toLocaleString()}</div>
        <div className={`text-xs font-mono font-bold ${color}`}>{percent}%</div>
      </div>
    </div>
  );
}
