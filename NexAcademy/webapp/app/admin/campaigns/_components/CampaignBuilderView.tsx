"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "./useAdminFetch";
import type { CampaignRequestRow, QuestionRow } from "./types";
import QuestionEditor from "./QuestionEditor";

interface VideoModule {
  title: string;
  url: string;
  traps: { q: string; opts: string[]; correct: number; timestamp: string }[];
}

interface BuilderState {
  campaignId: number | null;
  requestId: string | null;
  name: string;
  protocol: string;
  chain: string;
  tier: string;
  objective: string;
  pool: string;
  winners: string;
  agentInvites: string;
  ownerType: string;
  contractType: string;
  status: string;
  videoModules: VideoModule[];
}

interface Props {
  editCampaignId?: number | null;
  prefillRequest?: CampaignRequestRow | null;
  onSaved?: () => void;
  onManageQuestions?: (campaignId: number) => void;
}

const CHAINS = ["Solana", "Ethereum", "Arbitrum", "Base", "Hyperliquid L1", "Other"];
const TIERS: { value: string; label: string }[] = [
  { value: "LAUNCH_SPRINT", label: "Launch Sprint" },
  { value: "DEEP_DIVE", label: "Deep Dive" },
  { value: "CUSTOM", label: "Academy Retainer (Custom)" },
];

function emptyState(prefill?: CampaignRequestRow | null): BuilderState {
  return {
    campaignId: null,
    requestId: prefill?.id ?? null,
    name: prefill?.campaignTitle ?? "",
    protocol: prefill?.partnerName ?? "",
    chain: "Solana",
    tier: prefill?.tier ?? "LAUNCH_SPRINT",
    objective: prefill?.primaryObjective ?? "",
    pool: prefill?.prizePoolUsdc ? String(Number(prefill.prizePoolUsdc)) : "",
    winners: "300",
    agentInvites: "20",
    ownerType: "PARTNER",
    contractType: "PARTNER_CAMPAIGNS",
    status: "DRAFT",
    videoModules: [{ title: "", url: "", traps: [] }],
  };
}

export default function CampaignBuilderView({ editCampaignId, prefillRequest, onSaved, onManageQuestions }: Props) {
  const { authFetch } = useAdminFetch();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<BuilderState>(() => emptyState(prefillRequest));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loadingCampaign, setLoadingCampaign] = useState(false);

  // Load existing campaign for editing
  const loadCampaign = useCallback(async (id: number) => {
    setLoadingCampaign(true);
    try {
      const res = await authFetch(`/api/admin/campaigns/${id}`);
      if (res.ok) {
        const { campaign } = await res.json();
        const modules = Array.isArray(campaign.modules) ? campaign.modules : [];
        setState({
          campaignId: campaign.id,
          requestId: campaign.requestId,
          name: campaign.title,
          protocol: campaign.sponsorName,
          chain: "Solana",
          tier: campaign.tier,
          objective: campaign.objective,
          pool: String(Number(campaign.prizePoolUsdc)),
          winners: "300",
          agentInvites: "20",
          ownerType: campaign.ownerType,
          contractType: campaign.contractType,
          status: campaign.status,
          videoModules: modules.length > 0
            ? modules.map((m: Record<string, unknown>) => ({
                title: String(m.title ?? ""),
                url: String(m.videoUrl ?? m.url ?? ""),
                traps: [],
              }))
            : [{ title: "", url: "", traps: [] }],
        });
      }
    } catch {
      /* handled */
    } finally {
      setLoadingCampaign(false);
    }
  }, [authFetch]);

  // Load questions for campaign
  const loadQuestions = useCallback(async (id: number) => {
    try {
      const res = await authFetch(`/api/admin/campaigns/${id}/questions`);
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions ?? []);
      }
    } catch {
      /* handled */
    }
  }, [authFetch]);

  useEffect(() => {
    if (editCampaignId) {
      loadCampaign(editCampaignId);
      loadQuestions(editCampaignId);
    }
  }, [editCampaignId, loadCampaign, loadQuestions]);

  useEffect(() => {
    if (prefillRequest && !editCampaignId) {
      setState(emptyState(prefillRequest));
    }
  }, [prefillRequest, editCampaignId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const update = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const addVideoModule = () => {
    update("videoModules", [...state.videoModules, { title: "", url: "", traps: [] }]);
  };

  const removeVideoModule = (idx: number) => {
    update("videoModules", state.videoModules.filter((_, i) => i !== idx));
  };

  const updateVideoModule = (idx: number, field: keyof VideoModule, value: string) => {
    const updated = [...state.videoModules];
    updated[idx] = { ...updated[idx], [field]: value };
    update("videoModules", updated);
  };

  const addTrap = (moduleIdx: number) => {
    const updated = [...state.videoModules];
    updated[moduleIdx].traps.push({ q: "", opts: ["", "", "", ""], correct: 0, timestamp: "Random" });
    update("videoModules", updated);
  };

  // Save / Create
  const saveCampaign = async (asStatus?: string) => {
    setSaving(true);
    try {
      const modules = state.videoModules.map((m, i) => ({
        index: i,
        title: m.title || `Module ${i + 1}`,
        videoUrl: m.url,
        speedTraps: m.traps,
      }));

      const payload = {
        title: state.name,
        objective: state.objective,
        sponsorName: state.protocol,
        tier: state.tier,
        ownerType: state.ownerType,
        contractType: state.contractType,
        prizePoolUsdc: Number(state.pool) || 0,
        modules,
        status: asStatus ?? state.status,
        requestId: state.requestId,
      };

      let res: Response;
      if (state.campaignId) {
        res = await authFetch(`/api/admin/campaigns/${state.campaignId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch("/api/admin/campaigns", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        const data = await res.json();
        const id = data.campaign?.id ?? state.campaignId;
        if (id && !state.campaignId) {
          setState((prev) => ({ ...prev, campaignId: id }));
          loadQuestions(id);
        }
        showToast(state.campaignId ? "Campaign updated" : "Campaign created");
        onSaved?.();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Error: ${err.error ?? "Failed to save"}`);
      }
    } catch {
      showToast("Network error");
    } finally {
      setSaving(false);
    }
  };

  // Reward calc
  const poolNum = Number(state.pool) || 0;
  const winnersNum = Number(state.winners) || 0;

  const stepBtn = (n: number, label: string) => (
    <button
      onClick={() => setStep(n)}
      className={`text-[10px] font-mono px-3 py-1 rounded-md border transition-all ${
        step === n
          ? "bg-nexid-gold text-black border-nexid-gold font-bold"
          : "bg-transparent text-neutral-400 border-white/10 hover:border-white/20"
      }`}
    >
      {label}
    </button>
  );

  if (loadingCampaign) {
    return <div className="flex items-center justify-center py-20 text-neutral-500 text-xs font-mono">Loading campaign...</div>;
  }

  return (
    <div className="relative">
      {/* Header */}
      <div className="mb-4">
        <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-1.5">Campaign Builder</div>
        <div className="font-display font-bold text-lg text-white tracking-tight">{state.name || "New Campaign"}</div>
      </div>

      {/* Step nav */}
      <div className="flex gap-1 mb-4">
        {stepBtn(1, "1 · Setup")}
        {stepBtn(2, "2 · Videos")}
        {stepBtn(3, "3 · Quiz")}
        {stepBtn(4, "4 · On-Chain")}
        {stepBtn(5, "5 · Review")}
      </div>

      {/* ── STEP 1: Setup ── */}
      {step === 1 && (
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#060606] border border-white/[.06] rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase text-neutral-500 mb-3">Campaign Details</div>
              <Field label="Campaign Name" value={state.name} onChange={(v) => update("name", v)} placeholder="e.g. Bags Protocol Deep Dive" />
              <Field label="Protocol / Project" value={state.protocol} onChange={(v) => update("protocol", v)} placeholder="e.g. Bags.fm" />
              <SelectField label="Primary Chain" value={state.chain} onChange={(v) => update("chain", v)} options={CHAINS.map((c) => ({ value: c, label: c }))} />
              <SelectField label="Campaign Tier" value={state.tier} onChange={(v) => update("tier", v)} options={TIERS} />
              <Field label="Objective" value={state.objective} onChange={(v) => update("objective", v)} placeholder="What will participants learn?" multiline />
            </div>
            <div className="bg-[#060606] border border-white/[.06] rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase text-neutral-500 mb-3">Reward Pool</div>
              <Field label="Total Pool (USDC)" value={state.pool} onChange={(v) => update("pool", v)} placeholder="e.g. 10000" type="number" />
              <Field label="Max Winners" value={state.winners} onChange={(v) => update("winners", v)} placeholder="e.g. 300" type="number" />
              <Field label="Agent Session Invites (Top N)" value={state.agentInvites} onChange={(v) => update("agentInvites", v)} placeholder="e.g. 20" type="number" />

              {/* Reward calc */}
              <div className="bg-[#0a0a0a] border border-white/[.06] rounded-lg p-3 mt-2">
                <div className="text-[9px] font-mono uppercase text-neutral-500 mb-1.5">Estimated Distribution</div>
                {poolNum > 0 && winnersNum > 0 ? (
                  <div className="text-[11px] font-mono text-neutral-300 space-y-0.5">
                    <div>Pool: <span className="text-nexid-gold">${poolNum.toLocaleString()}</span></div>
                    <div>Winners: {winnersNum}</div>
                    <div className="border-t border-white/[.06] pt-1 mt-1">
                      <div>Equal split: ~${(poolNum / winnersNum).toFixed(2)}/winner</div>
                      <div>Top 1: est. ${(poolNum * 0.15).toFixed(0)} (15%)</div>
                      <div>Top 10: est. ${(poolNum * 0.05).toFixed(0)}/each</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-neutral-500">Enter pool + winners to calculate</div>
                )}
              </div>

              {/* Request link indicator */}
              {state.requestId && (
                <div className="bg-nexid-gold/5 border border-nexid-gold/20 rounded-lg px-3 py-2 mt-3 text-[10px] font-mono text-nexid-gold">
                  Linked to partner request: {state.requestId.slice(0, 12)}...
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button onClick={() => setStep(2)} className="text-[11px] font-display font-bold px-4 py-2 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors">
              Next: Videos →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Videos ── */}
      {step === 2 && (
        <div>
          <div className="mb-3">
            <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-1">Synthesia Video Modules</div>
            <div className="text-[12px] text-neutral-400 leading-relaxed">Paste your Synthesia share URLs below. Each module can have independent speed trap questions.</div>
            <div className="mt-2 text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Format: https://share.synthesia.io/embeds/videos/[VIDEO-ID]
            </div>
          </div>

          <div className="space-y-3">
            {state.videoModules.map((m, idx) => (
              <div key={idx} className="bg-[#0a0a0a] border border-white/[.06] rounded-xl overflow-hidden">
                <div className="p-3">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-[9px] font-mono uppercase text-neutral-500">Module {idx + 1}</div>
                    {state.videoModules.length > 1 && (
                      <button onClick={() => removeVideoModule(idx)} className="text-[10px] font-mono text-red-400 px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors">
                        Remove
                      </button>
                    )}
                  </div>
                  <Field label="Module Title" value={m.title} onChange={(v) => updateVideoModule(idx, "title", v)} placeholder="e.g. What is Bags.fm" />
                  <Field label="Synthesia Embed URL" value={m.url} onChange={(v) => updateVideoModule(idx, "url", v)} placeholder="https://share.synthesia.io/embeds/videos/..." mono />

                  {/* Speed traps */}
                  <div className="bg-[#0f0f0f] border border-white/[.06] rounded-lg p-3 mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[9px] font-mono uppercase text-neutral-500">Speed Trap Questions</div>
                      <button onClick={() => addTrap(idx)} className="text-[10px] font-mono text-neutral-400 px-2 py-0.5 rounded border border-white/10 hover:border-white/20 hover:text-white transition-colors">
                        + Add Trap
                      </button>
                    </div>
                    {m.traps.map((t, j) => (
                      <div key={j} className="bg-[#0a0a0a] border border-white/[.06] rounded-lg p-2.5 mb-2">
                        <div className="text-[9px] font-mono text-neutral-500 mb-1">Trap {j + 1} · Fires at: <span className="text-nexid-gold">{t.timestamp}</span></div>
                        <input
                          type="text"
                          placeholder="Question text"
                          value={t.q}
                          onChange={(e) => {
                            const updated = [...state.videoModules];
                            updated[idx].traps[j].q = e.target.value;
                            update("videoModules", updated);
                          }}
                          className="w-full bg-[#0f0f0f] border border-white/[.06] rounded px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-nexid-gold/40"
                        />
                      </div>
                    ))}
                    {m.traps.length === 0 && (
                      <div className="text-[10px] font-mono text-neutral-600 text-center py-2">No speed traps configured</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={addVideoModule} className="mt-2 text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:border-white/20 hover:text-white transition-colors">
            + Add Another Module
          </button>

          <div className="flex justify-between mt-4">
            <button onClick={() => setStep(1)} className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:text-white transition-colors">← Back</button>
            <button onClick={() => setStep(3)} className="text-[11px] font-display font-bold px-4 py-2 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors">Next: Quiz →</button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Quiz ── */}
      {step === 3 && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-1">Quiz Question Pool</div>
              <div className="text-[12px] text-neutral-400">Build your question pool. Min 15 questions recommended. Each user gets a random 5–8 subset.</div>
            </div>
          </div>

          {state.campaignId ? (
            <QuestionEditor campaignId={state.campaignId} questions={questions} onRefresh={() => loadQuestions(state.campaignId!)} />
          ) : (
            <div className="bg-[#060606] border border-white/[.06] rounded-xl p-6 text-center">
              <div className="text-neutral-500 text-xs font-mono mb-3">Save this campaign first to manage questions</div>
              <button
                onClick={() => saveCampaign("DRAFT")}
                disabled={saving || !state.name}
                className="text-[11px] font-display font-bold px-4 py-2 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save as Draft & Continue"}
              </button>
            </div>
          )}

          <div className="flex justify-between mt-4">
            <button onClick={() => setStep(2)} className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:text-white transition-colors">← Back</button>
            <button onClick={() => setStep(4)} className="text-[11px] font-display font-bold px-4 py-2 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors">Next: On-Chain →</button>
          </div>
        </div>
      )}

      {/* ── STEP 4: On-Chain ── */}
      {step === 4 && (
        <div>
          <div className="bg-[#060606] border border-white/[.06] rounded-xl p-4 mb-3">
            <div className="text-[9px] font-mono uppercase text-neutral-500 mb-3">On-Chain Verification Setup</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Field label="Required Action Description" value="" onChange={() => {}} placeholder="e.g. Swap $5 of SOL into BAGS token" />
                <Field label="Contract Address" value="" onChange={() => {}} placeholder="0x... or Solana program ID" />
                <Field label="Minimum Amount (USD)" value="" onChange={() => {}} placeholder="e.g. 1" type="number" />
              </div>
              <div>
                <SelectField label="Chain / Network" value="Solana" onChange={() => {}} options={[
                  { value: "Solana", label: "Solana (mainnet-beta)" },
                  { value: "Ethereum", label: "Ethereum Mainnet" },
                  { value: "Arbitrum", label: "Arbitrum One" },
                  { value: "Base", label: "Base" },
                  { value: "Hyperliquid", label: "Hyperliquid L1" },
                ]} />
                <Field label="RPC Endpoint" value="" onChange={() => {}} placeholder="https://mainnet.helius-rpc.com/?api-key=..." mono />
                <SelectField label="Verification Method" value="transfer" onChange={() => {}} options={[
                  { value: "transfer", label: "Token transfer (wallet → contract)" },
                  { value: "interaction", label: "Protocol interaction (contract call)" },
                  { value: "custom", label: "Custom RPC query" },
                ]} />
              </div>
            </div>
            <div className="bg-[#0a0a0a] border border-white/[.06] rounded-lg p-3 text-[11px] font-mono text-neutral-500 leading-relaxed mt-2">
              Verification checks: correct contract · wallet match · minimum value · tx success (not reverted) · block confirmation.
            </div>
          </div>
          <div className="flex justify-between mt-3">
            <button onClick={() => setStep(3)} className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:text-white transition-colors">← Back</button>
            <button onClick={() => setStep(5)} className="text-[11px] font-display font-bold px-4 py-2 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors">Review Campaign →</button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Review ── */}
      {step === 5 && (
        <div>
          <div className="bg-[#060606] border border-white/[.06] rounded-xl p-4 mb-3">
            <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-3">Campaign Summary</div>
            <div className="text-[12px] font-mono text-neutral-300 leading-8">
              <div>Campaign: <span className="text-white font-semibold">{state.name || "Unnamed"}</span></div>
              <div>Protocol: <span className="text-white">{state.protocol || "—"}</span></div>
              <div>Pool: <span className="text-nexid-gold">${poolNum.toLocaleString()} USDC</span></div>
              <div>Max Winners: <span className="text-white">{state.winners}</span></div>
              <div>Video Modules: <span className="text-white">{state.videoModules.length}</span></div>
              <div>Quiz Questions: <span className="text-white">{questions.length}</span></div>
              {state.requestId && <div>Partner Request: <span className="text-nexid-gold">Linked</span></div>}
            </div>
          </div>

          {/* Checklist */}
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 mb-3">
            <div className="text-[9px] font-mono uppercase text-green-400 mb-2">Pre-Launch Checklist</div>
            <div className="text-[11px] font-mono text-neutral-300 leading-8">
              {[
                { check: !!state.name, label: "Campaign name set" },
                { check: !!state.protocol, label: "Protocol name set" },
                { check: poolNum > 0, label: "Reward pool entered" },
                { check: state.videoModules.some((m) => m.url), label: "Video module(s) added" },
                { check: questions.length >= 10, label: "Quiz questions built (min 10 recommended)" },
                { check: false, label: "On-chain action configured" },
              ].map((c, i) => (
                <div key={i}>
                  <span className={c.check ? "text-green-400" : "text-neutral-600"}>{c.check ? "✓" : "○"}</span> {c.label}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(4)} className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:text-white transition-colors">← Back</button>
            <button
              onClick={() => saveCampaign("DRAFT")}
              disabled={saving}
              className="text-[11px] font-display font-bold px-4 py-2 rounded-lg border border-white/10 text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save as Draft"}
            </button>
            <button
              onClick={() => saveCampaign("LIVE")}
              disabled={saving}
              className="text-[11px] font-display font-bold px-5 py-2 rounded-lg bg-green-500 text-black border border-green-500 hover:bg-green-400 transition-colors disabled:opacity-50"
            >
              {saving ? "Launching..." : "Launch Campaign"}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-2.5 text-[12px] text-white z-50 shadow-2xl animate-in fade-in slide-in-from-bottom-3">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ── Reusable field components ── */

function Field({ label, value, onChange, placeholder, type = "text", multiline = false, mono = false }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  mono?: boolean;
}) {
  const cls = `w-full bg-[#0a0a0a] border border-white/[.06] rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-nexid-gold/40 placeholder:text-neutral-600 ${mono ? "font-mono text-[11px]" : ""}`;
  return (
    <div className="mb-3">
      <label className="block text-[9px] font-mono uppercase text-neutral-500 tracking-wider mb-1">{label}</label>
      {multiline ? (
        <textarea className={`${cls} resize-none`} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input type={type} className={cls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="mb-3">
      <label className="block text-[9px] font-mono uppercase text-neutral-500 tracking-wider mb-1">{label}</label>
      <select
        className="w-full bg-[#0a0a0a] border border-white/[.06] rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-nexid-gold/40 appearance-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
