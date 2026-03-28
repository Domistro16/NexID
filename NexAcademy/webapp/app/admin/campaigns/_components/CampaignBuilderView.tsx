"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "./useAdminFetch";
import type { CampaignRequestRow, QuestionRow } from "./types";
import QuestionEditor from "./QuestionEditor";
import {
  PARTNER_CAMPAIGN_PLANS,
  type PartnerCampaignPlanId,
} from "@/lib/partner-campaign-plans";
import { campaignModulesAreGrouped } from "@/lib/campaign-modules";

// ── Types ────────────────────────────────────────────────────────────────────

interface VideoItem {
  title: string;
  url: string;
}

interface ModuleGroup {
  title: string;
  videos: VideoItem[];
}

interface OnchainConfigState {
  actionDescription: string;
  contractAddress: string;
  minAmountUsd: string;
  verificationMethod: string;
  rpcEndpoint: string;
  chainId: string;
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
  moduleGroups: ModuleGroup[];
  onchainConfig: OnchainConfigState;
}

// ── Constants ────────────────────────────────────────────────────────────────

interface Props {
  editCampaignId?: number | null;
  prefillRequest?: CampaignRequestRow | null;
  onSaved?: () => void;
  onManageQuestions?: (campaignId: number) => void;
}

const CHAINS = [
  { value: "base", label: "Base" },
  { value: "ethereum", label: "Ethereum Mainnet" },
  { value: "arbitrum", label: "Arbitrum One" },
  { value: "hyperliquid", label: "Hyperliquid L1" },
  { value: "other", label: "Other (Custom EVM)" },
];

const TIERS: { value: string; label: string }[] = [
  { value: "LAUNCH_SPRINT", label: "Launch Sprint" },
  { value: "DEEP_DIVE", label: "Deep Dive" },
  { value: "CUSTOM", label: "Academy Retainer (Custom)" },
];

const OWNER_TYPES = [
  { value: "NEXID", label: "Internal (NexID)" },
  { value: "PARTNER", label: "Partner Campaign" },
];

const VERIFICATION_METHODS = [
  { value: "transfer", label: "Token transfer (wallet → contract)" },
  { value: "interaction", label: "Protocol interaction (contract call)" },
  { value: "custom", label: "Custom RPC query" },
];

const emptyOnchainConfig = (): OnchainConfigState => ({
  actionDescription: "",
  contractAddress: "",
  minAmountUsd: "",
  verificationMethod: "transfer",
  rpcEndpoint: "",
  chainId: "",
});

function getPlanForTier(tier: string) {
  return PARTNER_CAMPAIGN_PLANS[tier as PartnerCampaignPlanId] ?? null;
}

function emptyState(prefill?: CampaignRequestRow | null): BuilderState {
  const tier = prefill?.tier ?? "LAUNCH_SPRINT";
  const plan = getPlanForTier(tier);
  return {
    campaignId: null,
    requestId: prefill?.id ?? null,
    name: prefill?.campaignTitle ?? "",
    protocol: prefill?.partnerName ?? "",
    chain: "base",
    tier,
    objective: prefill?.primaryObjective ?? "",
    pool: prefill?.prizePoolUsdc ? String(Number(prefill.prizePoolUsdc)) : "",
    winners: plan?.winnerCap ? String(plan.winnerCap) : "300",
    agentInvites: "20",
    ownerType: "PARTNER",
    contractType: "PARTNER_CAMPAIGNS",
    status: "DRAFT",
    moduleGroups: [{ title: "Module 1", videos: [{ title: "", url: "" }] }],
    onchainConfig: emptyOnchainConfig(),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CampaignBuilderView({ editCampaignId, prefillRequest, onSaved, onManageQuestions }: Props) {
  const { authFetch } = useAdminFetch();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<BuilderState>(() => emptyState(prefillRequest));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loadingCampaign, setLoadingCampaign] = useState(false);

  const isPartner = state.ownerType === "PARTNER";
  const currentPlan = getPlanForTier(state.tier);
  const winnersLocked = currentPlan?.winnerCap !== null && currentPlan?.winnerCap !== undefined;
  const poolNum = Number(state.pool) || 0;
  const winnersNum = Number(state.winners) || 0;
  const poolBelowMin = currentPlan ? poolNum > 0 && poolNum < currentPlan.minPrizePoolUsdc : false;

  // ── Load existing campaign for editing ──

  const loadCampaign = useCallback(async (id: number) => {
    setLoadingCampaign(true);
    try {
      const res = await authFetch(`/api/admin/campaigns/${id}`);
      if (res.ok) {
        const { campaign } = await res.json();
        const modules = Array.isArray(campaign.modules) ? campaign.modules : [];
        const plan = getPlanForTier(campaign.tier);
        const oc = campaign.onchainConfig;

        // Parse modules into grouped format
        let moduleGroups: ModuleGroup[];

        if (campaignModulesAreGrouped(modules)) {
          // Already grouped: { title, items: [{ type, title, videoUrl }] }
          moduleGroups = modules.map((g: Record<string, unknown>) => ({
            title: String(g.title || ""),
            videos: Array.isArray(g.items)
              ? (g.items as Record<string, unknown>[])
                  .filter((item) => item.type === "video" || item.videoUrl || item.url)
                  .map((item) => ({
                    title: String(item.title || ""),
                    url: String(item.videoUrl || item.url || ""),
                  }))
              : [],
          }));
        } else if (modules.length > 0) {
          // Legacy flat format: { index, title, videoUrl }
          moduleGroups = [{
            title: "Module 1",
            videos: modules.map((m: Record<string, unknown>) => ({
              title: String(m.title || ""),
              url: String(m.videoUrl || m.url || ""),
            })),
          }];
        } else {
          moduleGroups = [];
        }

        // Ensure at least one group with one video
        if (moduleGroups.length === 0) {
          moduleGroups = [{ title: "Module 1", videos: [{ title: "", url: "" }] }];
        }
        for (const g of moduleGroups) {
          if (g.videos.length === 0) {
            g.videos.push({ title: "", url: "" });
          }
        }

        setState({
          campaignId: campaign.id,
          requestId: campaign.requestId,
          name: campaign.title,
          protocol: campaign.sponsorName,
          chain: campaign.primaryChain || "base",
          tier: campaign.tier,
          objective: campaign.objective,
          pool: String(Number(campaign.prizePoolUsdc)),
          winners: plan?.winnerCap ? String(plan.winnerCap) : String(campaign.rewardSchedule?.winnerCap ?? "300"),
          agentInvites: "20",
          ownerType: campaign.ownerType || "PARTNER",
          contractType: campaign.contractType || "PARTNER_CAMPAIGNS",
          status: campaign.status,
          moduleGroups,
          onchainConfig: oc
            ? {
                actionDescription: oc.actionDescription ?? "",
                contractAddress: oc.contractAddress ?? "",
                minAmountUsd: oc.minAmountUsd ? String(oc.minAmountUsd) : "",
                verificationMethod: oc.verificationMethod ?? "transfer",
                rpcEndpoint: oc.rpcEndpoint ?? "",
                chainId: oc.chainId ? String(oc.chainId) : "",
              }
            : emptyOnchainConfig(),
        });
      }
    } catch {
      /* handled */
    } finally {
      setLoadingCampaign(false);
    }
  }, [authFetch]);

  // ── Load questions ──

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

  // ── Helpers ──

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const update = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const updateOnchain = (field: keyof OnchainConfigState, value: string) => {
    setState((prev) => ({
      ...prev,
      onchainConfig: { ...prev.onchainConfig, [field]: value },
    }));
  };

  // ── Owner type change ──

  const handleOwnerTypeChange = (newType: string) => {
    setState((prev) => ({
      ...prev,
      ownerType: newType,
      contractType: newType === "NEXID" ? "NEXID_CAMPAIGNS" : "PARTNER_CAMPAIGNS",
      ...(newType === "NEXID" ? { pool: "0", winners: "0" } : {}),
    }));
  };

  // ── Tier change ──

  const handleTierChange = (newTier: string) => {
    const plan = getPlanForTier(newTier);
    setState((prev) => ({
      ...prev,
      tier: newTier,
      winners: plan?.winnerCap ? String(plan.winnerCap) : prev.winners,
    }));
  };

  // ── Module group CRUD ──

  const addModuleGroup = () => {
    update("moduleGroups", [
      ...state.moduleGroups,
      { title: `Module ${state.moduleGroups.length + 1}`, videos: [{ title: "", url: "" }] },
    ]);
  };

  const removeModuleGroup = (idx: number) => {
    update("moduleGroups", state.moduleGroups.filter((_, i) => i !== idx));
  };

  const updateGroupTitle = (idx: number, title: string) => {
    const updated = [...state.moduleGroups];
    updated[idx] = { ...updated[idx], title };
    update("moduleGroups", updated);
  };

  // ── Video CRUD within a group ──

  const addVideoToGroup = (groupIdx: number) => {
    const updated = [...state.moduleGroups];
    updated[groupIdx] = {
      ...updated[groupIdx],
      videos: [...updated[groupIdx].videos, { title: "", url: "" }],
    };
    update("moduleGroups", updated);
  };

  const removeVideoFromGroup = (groupIdx: number, videoIdx: number) => {
    const updated = [...state.moduleGroups];
    updated[groupIdx] = {
      ...updated[groupIdx],
      videos: updated[groupIdx].videos.filter((_, i) => i !== videoIdx),
    };
    // Keep at least one video slot
    if (updated[groupIdx].videos.length === 0) {
      updated[groupIdx] = { ...updated[groupIdx], videos: [{ title: "", url: "" }] };
    }
    update("moduleGroups", updated);
  };

  const updateVideo = (groupIdx: number, videoIdx: number, field: keyof VideoItem, value: string) => {
    const updated = [...state.moduleGroups];
    const videos = [...updated[groupIdx].videos];
    videos[videoIdx] = { ...videos[videoIdx], [field]: value };
    updated[groupIdx] = { ...updated[groupIdx], videos };
    update("moduleGroups", updated);
  };

  // ── Build onchainConfig payload ──

  const buildOnchainConfigPayload = () => {
    const oc = state.onchainConfig;
    const hasAnyValue = oc.actionDescription || oc.contractAddress || oc.minAmountUsd || oc.rpcEndpoint;
    if (!hasAnyValue) return null;
    return {
      actionDescription: oc.actionDescription || undefined,
      contractAddress: oc.contractAddress || undefined,
      minAmountUsd: oc.minAmountUsd ? Number(oc.minAmountUsd) : undefined,
      verificationMethod: oc.verificationMethod || "transfer",
      rpcEndpoint: oc.rpcEndpoint || undefined,
      chainId: oc.chainId ? Number(oc.chainId) : undefined,
    };
  };

  // ── Save / Create ──

  const saveCampaign = async (asStatus?: string) => {
    setSaving(true);
    try {
      // Build grouped module format matching CampaignModuleGroup
      const modules = state.moduleGroups.map((g) => ({
        title: g.title || "Untitled Module",
        items: g.videos
          .filter((v) => v.url)
          .map((v) => ({
            type: "video" as const,
            title: v.title || "Untitled Video",
            videoUrl: v.url,
          })),
      }));

      const payload: Record<string, unknown> = {
        title: state.name,
        objective: state.objective,
        sponsorName: state.protocol,
        tier: state.tier,
        ownerType: state.ownerType,
        contractType: state.contractType,
        prizePoolUsdc: isPartner ? Number(state.pool) || 0 : 0,
        modules,
        status: asStatus ?? state.status,
        requestId: state.requestId,
        primaryChain: state.chain,
        onchainConfig: buildOnchainConfigPayload(),
      };

      if (state.tier === "CUSTOM") {
        payload.customWinnerCap = Number(state.winners) || null;
      }

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

  // ── Step nav ──

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

  const hasOnchainConfig = !!(state.onchainConfig.contractAddress || state.onchainConfig.actionDescription);
  const totalVideos = state.moduleGroups.reduce((sum, g) => sum + g.videos.filter((v) => v.url).length, 0);

  return (
    <div className="relative">
      {/* Header */}
      <div className="mb-4">
        <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-1.5">Campaign Builder</div>
        <div className="font-display font-bold text-lg text-white tracking-tight">
          {state.name || "New Campaign"}
          {!isPartner && <span className="ml-2 text-[10px] font-mono font-normal text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5">Internal</span>}
        </div>
      </div>

      {/* Step nav */}
      <div className="flex gap-1 mb-4">
        {stepBtn(1, "1 · Setup")}
        {stepBtn(2, "2 · Modules")}
        {stepBtn(3, "3 · Quiz")}
        {stepBtn(4, "4 · On-Chain")}
        {stepBtn(5, "5 · Review")}
      </div>

      {/* ── STEP 1: Setup ── */}
      {step === 1 && (
        <div>
          <div className={`grid ${isPartner ? "grid-cols-2" : "grid-cols-1"} gap-3`}>
            {/* Left column: Campaign Details */}
            <div className="bg-[#060606] border border-white/[.06] rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase text-neutral-500 mb-3">Campaign Details</div>

              <SelectField label="Campaign Type" value={state.ownerType} onChange={handleOwnerTypeChange} options={OWNER_TYPES} />

              <Field label="Campaign Name" value={state.name} onChange={(v) => update("name", v)} placeholder="e.g. Bags Protocol Deep Dive" />
              <Field label="Protocol / Project" value={state.protocol} onChange={(v) => update("protocol", v)} placeholder="e.g. Bags.fm" />
              <SelectField label="Primary Chain" value={state.chain} onChange={(v) => update("chain", v)} options={CHAINS} />

              {isPartner && (
                <SelectField label="Campaign Tier" value={state.tier} onChange={handleTierChange} options={TIERS} />
              )}

              <Field label="Objective" value={state.objective} onChange={(v) => update("objective", v)} placeholder="What will participants learn?" multiline />

              {/* Tier info badge — only for partner */}
              {isPartner && currentPlan && (
                <div className="bg-[#0a0a0a] border border-white/[.06] rounded-lg p-3 mt-1">
                  <div className="text-[9px] font-mono uppercase text-neutral-500 mb-1">Plan Details</div>
                  <div className="text-[11px] font-mono text-neutral-400 space-y-0.5">
                    <div>Duration: <span className="text-white">{currentPlan.durationDays} days</span></div>
                    <div>Winner Cap: <span className="text-white">{currentPlan.winnerCap ?? "Custom"}</span>{winnersLocked && <span className="text-nexid-gold/60 ml-1">(fixed by plan)</span>}</div>
                    <div>Min Pool: <span className="text-white">${currentPlan.minPrizePoolUsdc.toLocaleString()} USDC</span></div>
                    <div>Payout: <span className="text-white">{currentPlan.payoutRounds}x every {currentPlan.payoutIntervalDays}d</span></div>
                  </div>
                </div>
              )}
            </div>

            {/* Right column: Reward Pool — partner only */}
            {isPartner && (
              <div className="bg-[#060606] border border-white/[.06] rounded-xl p-4">
                <div className="text-[9px] font-mono uppercase text-neutral-500 mb-3">Reward Pool</div>
                <Field label="Total Pool (USDC)" value={state.pool} onChange={(v) => update("pool", v)} placeholder="e.g. 10000" type="number" />
                {poolBelowMin && currentPlan && (
                  <div className="text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 -mt-1 mb-3">
                    {currentPlan.label} requires at least ${currentPlan.minPrizePoolUsdc.toLocaleString()} USDC
                  </div>
                )}
                <Field
                  label="Max Winners"
                  value={state.winners}
                  onChange={(v) => update("winners", v)}
                  placeholder={winnersLocked ? "" : "e.g. 300 (min 10)"}
                  type="number"
                  disabled={winnersLocked}
                />
                {winnersLocked && (
                  <div className="text-[10px] font-mono text-nexid-gold/60 -mt-1 mb-3">
                    Fixed at {currentPlan?.winnerCap} by {currentPlan?.label} plan
                  </div>
                )}
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
            )}
          </div>
          <div className="flex justify-end mt-3">
            <button onClick={() => setStep(2)} className="text-[11px] font-display font-bold px-4 py-2 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors">
              Next: Modules →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Modules (Grouped) ── */}
      {step === 2 && (
        <div>
          <div className="mb-3">
            <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-1">Module Groups</div>
            <div className="text-[12px] text-neutral-400 leading-relaxed">
              Organize your campaign into module groups. Each group contains one or more Synthesia video sub-modules.
              Speed trap questions (max 2 per group) fire between video transitions within each group.
            </div>
            <div className="mt-2 text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Video URL format: https://share.synthesia.io/embeds/videos/[VIDEO-ID]
            </div>
          </div>

          <div className="space-y-4">
            {state.moduleGroups.map((group, gIdx) => (
              <div key={gIdx} className="bg-[#060606] border border-white/[.06] rounded-xl overflow-hidden">
                {/* Group header */}
                <div className="p-3 border-b border-white/[.04] bg-[#080808]">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-[10px] font-mono font-bold uppercase text-nexid-gold/80">
                      Group {gIdx + 1}
                      <span className="ml-2 text-neutral-500 font-normal normal-case">
                        · {group.videos.filter((v) => v.url).length} video{group.videos.filter((v) => v.url).length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {state.moduleGroups.length > 1 && (
                      <button
                        onClick={() => removeModuleGroup(gIdx)}
                        className="text-[10px] font-mono text-red-400 px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                      >
                        Remove Group
                      </button>
                    )}
                  </div>
                  <Field
                    label="Group Title"
                    value={group.title}
                    onChange={(v) => updateGroupTitle(gIdx, v)}
                    placeholder="e.g. Understanding the Protocol"
                  />
                </div>

                {/* Videos within group */}
                <div className="p-3 space-y-2">
                  <div className="text-[9px] font-mono uppercase text-neutral-500 mb-1">Videos in this group</div>

                  {group.videos.map((video, vIdx) => (
                    <div key={vIdx} className="bg-[#0a0a0a] border border-white/[.06] rounded-lg p-2.5">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="text-[9px] font-mono text-neutral-500">Video {vIdx + 1}</div>
                        {group.videos.length > 1 && (
                          <button
                            onClick={() => removeVideoFromGroup(gIdx, vIdx)}
                            className="text-[9px] font-mono text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <Field
                        label="Video Title"
                        value={video.title}
                        onChange={(v) => updateVideo(gIdx, vIdx, "title", v)}
                        placeholder="e.g. What is Bags.fm"
                      />
                      <Field
                        label="Synthesia Embed URL"
                        value={video.url}
                        onChange={(v) => updateVideo(gIdx, vIdx, "url", v)}
                        placeholder="https://share.synthesia.io/embeds/videos/..."
                        mono
                      />
                    </div>
                  ))}

                  <button
                    onClick={() => addVideoToGroup(gIdx)}
                    className="text-[10px] font-mono text-neutral-400 px-2 py-1 rounded border border-white/10 hover:border-white/20 hover:text-white transition-colors"
                  >
                    + Add Video to Group
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addModuleGroup}
            className="mt-3 text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:border-white/20 hover:text-white transition-colors"
          >
            + Add Module Group
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
              <div className="text-[12px] text-neutral-400">Build your question pool. Min 50 questions required. Each user gets a random 6–8 subset. Mark questions as speed traps for between-module gating.</div>
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
            <div className="text-[11px] text-neutral-400 mb-3">
              Users submit their transaction hash after completing the on-chain task. The system verifies the tx on <span className="text-white font-medium">{CHAINS.find((c) => c.value === state.chain)?.label ?? state.chain}</span> (set in Step 1).
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Field
                  label="Required Action Description"
                  value={state.onchainConfig.actionDescription}
                  onChange={(v) => updateOnchain("actionDescription", v)}
                  placeholder="e.g. Swap $5 of ETH into BAGS token"
                />
                <Field
                  label="Contract Address"
                  value={state.onchainConfig.contractAddress}
                  onChange={(v) => updateOnchain("contractAddress", v)}
                  placeholder="0x..."
                  mono
                />
                <Field
                  label="Minimum Amount (USD equivalent)"
                  value={state.onchainConfig.minAmountUsd}
                  onChange={(v) => updateOnchain("minAmountUsd", v)}
                  placeholder="e.g. 5"
                  type="number"
                />
              </div>
              <div>
                <SelectField
                  label="Verification Method"
                  value={state.onchainConfig.verificationMethod}
                  onChange={(v) => updateOnchain("verificationMethod", v)}
                  options={VERIFICATION_METHODS}
                />
                {state.chain === "other" && (
                  <>
                    <Field
                      label="Custom RPC Endpoint"
                      value={state.onchainConfig.rpcEndpoint}
                      onChange={(v) => updateOnchain("rpcEndpoint", v)}
                      placeholder="https://rpc.example.com"
                      mono
                    />
                    <Field
                      label="Chain ID"
                      value={state.onchainConfig.chainId}
                      onChange={(v) => updateOnchain("chainId", v)}
                      placeholder="e.g. 1"
                      type="number"
                    />
                  </>
                )}
                {state.chain !== "other" && (
                  <Field
                    label="Custom RPC Endpoint (optional override)"
                    value={state.onchainConfig.rpcEndpoint}
                    onChange={(v) => updateOnchain("rpcEndpoint", v)}
                    placeholder="Leave blank to use default"
                    mono
                  />
                )}
              </div>
            </div>
            <div className="bg-[#0a0a0a] border border-white/[.06] rounded-lg p-3 text-[11px] font-mono text-neutral-500 leading-relaxed mt-2">
              Verification checks: correct contract · wallet match · minimum value · tx success (not reverted) · block confirmation. Users submit tx hash after completing the action.
            </div>
          </div>
          <div className="flex justify-between mt-3">
            <button onClick={() => setStep(3)} className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:text-white transition-colors">← Back</button>
            <div className="flex gap-2">
              <button
                onClick={() => saveCampaign()}
                disabled={saving}
                className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Progress"}
              </button>
              <button onClick={() => setStep(5)} className="text-[11px] font-display font-bold px-4 py-2 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors">Review Campaign →</button>
            </div>
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
              <div>Type: <span className="text-white">{isPartner ? "Partner Campaign" : "Internal (NexID)"}</span></div>
              <div>Protocol: <span className="text-white">{state.protocol || "—"}</span></div>
              <div>Chain: <span className="text-white">{CHAINS.find((c) => c.value === state.chain)?.label ?? state.chain}</span></div>
              {isPartner && (
                <>
                  <div>Tier: <span className="text-white">{currentPlan?.label ?? state.tier}</span> · <span className="text-neutral-500">{currentPlan?.durationDays}d</span></div>
                  <div>Pool: <span className="text-nexid-gold">${poolNum.toLocaleString()} USDC</span>{poolBelowMin && <span className="text-red-400 ml-2">(below minimum)</span>}</div>
                  <div>Max Winners: <span className="text-white">{state.winners}</span>{winnersLocked && <span className="text-neutral-500 ml-1">(plan-locked)</span>}</div>
                </>
              )}
              <div>Module Groups: <span className="text-white">{state.moduleGroups.length}</span> <span className="text-neutral-500">({totalVideos} video{totalVideos !== 1 ? "s" : ""})</span></div>
              <div>Quiz Questions: <span className="text-white">{questions.length}</span></div>
              <div>On-Chain: <span className={hasOnchainConfig ? "text-green-400" : "text-neutral-500"}>{hasOnchainConfig ? "Configured" : "Not set"}</span></div>
              {state.requestId && <div>Partner Request: <span className="text-nexid-gold">Linked</span></div>}
            </div>
          </div>

          {/* Module group breakdown */}
          <div className="bg-[#060606] border border-white/[.06] rounded-xl p-4 mb-3">
            <div className="text-[9px] font-mono uppercase text-neutral-500 mb-2">Module Breakdown</div>
            <div className="text-[11px] font-mono text-neutral-300 space-y-1.5">
              {state.moduleGroups.map((g, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-nexid-gold/60 shrink-0">G{i + 1}</span>
                  <div>
                    <span className="text-white">{g.title || "Untitled"}</span>
                    <span className="text-neutral-500 ml-1">· {g.videos.filter((v) => v.url).length} video{g.videos.filter((v) => v.url).length !== 1 ? "s" : ""}</span>
                    <div className="text-neutral-500 ml-2 text-[10px]">
                      {g.videos.filter((v) => v.url).map((v, j) => (
                        <div key={j}>↳ {v.title || "Untitled"}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Checklist */}
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 mb-3">
            <div className="text-[9px] font-mono uppercase text-green-400 mb-2">Pre-Launch Checklist</div>
            <div className="text-[11px] font-mono text-neutral-300 leading-8">
              {[
                { check: !!state.name, label: "Campaign name set" },
                { check: !!state.protocol, label: "Protocol name set" },
                ...(isPartner
                  ? [{ check: poolNum > 0 && !poolBelowMin, label: `Reward pool entered${currentPlan ? ` (min $${currentPlan.minPrizePoolUsdc.toLocaleString()})` : ""}` }]
                  : []),
                { check: state.moduleGroups.some((g) => g.videos.some((v) => v.url)), label: "Video module(s) added" },
                { check: questions.length >= 10, label: "Quiz questions built (min 10 recommended)" },
                { check: hasOnchainConfig, label: "On-chain action configured" },
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

function Field({ label, value, onChange, placeholder, type = "text", multiline = false, mono = false, disabled = false }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  mono?: boolean;
  disabled?: boolean;
}) {
  const cls = `w-full bg-[#0a0a0a] border border-white/[.06] rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-nexid-gold/40 placeholder:text-neutral-600 ${mono ? "font-mono text-[11px]" : ""} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`;
  return (
    <div className="mb-3">
      <label className="block text-[9px] font-mono uppercase text-neutral-500 tracking-wider mb-1">{label}</label>
      {multiline ? (
        <textarea className={`${cls} resize-none`} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
      ) : (
        <input type={type} className={cls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
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
