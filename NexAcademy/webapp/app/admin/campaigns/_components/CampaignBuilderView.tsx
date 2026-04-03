"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
import { useAdminFetch } from "./useAdminFetch";
import type { CampaignRequestRow, QuestionRow } from "./types";
import QuestionEditor from "./QuestionEditor";
import {
  PARTNER_CAMPAIGN_PLANS,
  type PartnerCampaignPlanId,
} from "@/lib/partner-campaign-plans";
import { campaignModulesAreGrouped } from "@/lib/campaign-modules";

// V2: plan-based endTime calculation
const UPDATE_CAMPAIGN_ABI = [
  {
    name: "updateCampaign",
    type: "function",
    inputs: [
      { name: "_campaignId", type: "uint256" },
      { name: "_title", type: "string" },
      { name: "_description", type: "string" },
      { name: "_category", type: "string" },
      { name: "_level", type: "string" },
      { name: "_thumbnailUrl", type: "string" },
      { name: "_totalTasks", type: "uint256" },
      { name: "_sponsor", type: "address" },
      { name: "_sponsorName", type: "string" },
      { name: "_sponsorLogo", type: "string" },
      { name: "_prizePool", type: "uint256" },
      { name: "_startTime", type: "uint256" },
      { name: "_plan", type: "uint8" },
      { name: "_customWinnerCap", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// V1: explicit endTime, duration string
const UPDATE_CAMPAIGN_V1_ABI = [
  {
    name: "updateCampaign",
    type: "function",
    inputs: [
      { name: "_campaignId", type: "uint256" },
      { name: "_title", type: "string" },
      { name: "_description", type: "string" },
      { name: "_category", type: "string" },
      { name: "_level", type: "string" },
      { name: "_thumbnailUrl", type: "string" },
      { name: "_duration", type: "string" },
      { name: "_totalTasks", type: "uint256" },
      { name: "_sponsor", type: "address" },
      { name: "_sponsorName", type: "string" },
      { name: "_sponsorLogo", type: "string" },
      { name: "_prizePool", type: "uint256" },
      { name: "_startTime", type: "uint256" },
      { name: "_endTime", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const CREATE_PARTNER_CAMPAIGN_ABI = [
  {
    name: "createCampaign",
    type: "function",
    inputs: [
      { name: "_title", type: "string" },
      { name: "_description", type: "string" },
      { name: "_category", type: "string" },
      { name: "_level", type: "string" },
      { name: "_thumbnailUrl", type: "string" },
      { name: "_totalTasks", type: "uint256" },
      { name: "_sponsor", type: "address" },
      { name: "_sponsorName", type: "string" },
      { name: "_sponsorLogo", type: "string" },
      { name: "_prizePool", type: "uint256" },
      { name: "_startTime", type: "uint256" },
      { name: "_plan", type: "uint8" },
      { name: "_customWinnerCap", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

const CREATE_NEXID_CAMPAIGN_ABI = [
  {
    name: "createCampaign",
    type: "function",
    inputs: [
      { name: "_title", type: "string" },
      { name: "_description", type: "string" },
      { name: "_longDescription", type: "string" },
      { name: "_instructor", type: "string" },
      { name: "_objectives", type: "string[]" },
      { name: "_prerequisites", type: "string[]" },
      { name: "_category", type: "string" },
      { name: "_level", type: "string" },
      { name: "_thumbnailUrl", type: "string" },
      { name: "_duration", type: "string" },
      { name: "_totalLessons", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface VideoItem {
  title: string;
  url: string;
  durationSeconds: string;
}

interface ModuleGroup {
  title: string;
  videos: VideoItem[];
  speedTrapQuestionIds: string[];
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
  coverImageUrl: string;
  chain: string;
  tier: string;
  objective: string;
  pool: string;
  winners: string;
  agentInvites: string;
  ownerType: string;
  contractType: string;
  status: string;
  quizMode: "MCQ" | "FREE_TEXT";
  moduleGroups: ModuleGroup[];
  onchainConfig: OnchainConfigState;
  onChainCampaignId: number | null;
  partnerContractAddress: string | null;
  endAt: string | null;
}

type PartnerDeployCreateParams = {
  title: string;
  description: string;
  category: string;
  level: string;
  thumbnailUrl: string;
  totalTasks: number;
  sponsorName: string;
  sponsorLogo: string;
  prizePool: string;
  startTime: number;
  plan: number;
  customWinnerCap: number;
};

type NexIdDeployCreateParams = {
  title: string;
  description: string;
  longDescription: string;
  instructor: string;
  objectives: string[];
  prerequisites: string[];
  category: string;
  level: string;
  thumbnailUrl: string;
  duration: string;
  totalLessons: number;
};

type DeployParamsResponse =
  | {
      contractType: "PARTNER_CAMPAIGNS";
      contractLabel: "PartnerCampaigns";
      contractAddress: string;
      createParams: PartnerDeployCreateParams;
    }
  | {
      contractType: "NEXID_CAMPAIGNS";
      contractLabel: "NexIDCampaigns";
      contractAddress: string;
      createParams: NexIdDeployCreateParams;
    };

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

function readQuizModeFromModules(rawModules: unknown): "MCQ" | "FREE_TEXT" {
  if (!Array.isArray(rawModules) || rawModules.length === 0) {
    return "MCQ";
  }

  const firstGroup = rawModules[0];
  if (!firstGroup || typeof firstGroup !== "object" || Array.isArray(firstGroup)) {
    return "MCQ";
  }

  const directQuizMode =
    typeof (firstGroup as { quizMode?: unknown }).quizMode === "string"
      ? (firstGroup as { quizMode?: string }).quizMode
      : null;
  if (directQuizMode === "MCQ" || directQuizMode === "FREE_TEXT") {
    return directQuizMode;
  }

  const assessmentConfig = (firstGroup as { assessmentConfig?: unknown }).assessmentConfig;
  if (!assessmentConfig || typeof assessmentConfig !== "object" || Array.isArray(assessmentConfig)) {
    return "MCQ";
  }

  const nestedQuizMode =
    typeof (assessmentConfig as { quizMode?: unknown }).quizMode === "string"
      ? (assessmentConfig as { quizMode?: string }).quizMode
      : null;
  return nestedQuizMode === "FREE_TEXT" ? "FREE_TEXT" : "MCQ";
}

function readVideoDurationSeconds(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.max(0, Math.floor(value)));
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return String(Math.floor(parsed));
    }
  }

  return "";
}

function emptyState(prefill?: CampaignRequestRow | null): BuilderState {
  const tier = prefill?.tier ?? "LAUNCH_SPRINT";
  const plan = getPlanForTier(tier);
  return {
    campaignId: null,
    requestId: prefill?.id ?? null,
    name: prefill?.campaignTitle ?? "",
    protocol: prefill?.partnerName ?? "",
    coverImageUrl: "",
    chain: "base",
    tier,
    objective: prefill?.primaryObjective ?? "",
    pool: prefill?.prizePoolUsdc ? String(Number(prefill.prizePoolUsdc)) : "",
    winners: plan?.winnerCap ? String(plan.winnerCap) : "300",
    agentInvites: "20",
    ownerType: "PARTNER",
    contractType: "PARTNER_CAMPAIGNS",
    status: "DRAFT",
    quizMode: "MCQ",
    moduleGroups: [{ title: "Module 1", videos: [{ title: "", url: "", durationSeconds: "" }], speedTrapQuestionIds: [] }],
    onchainConfig: emptyOnchainConfig(),
    onChainCampaignId: null,
    partnerContractAddress: null,
    endAt: null,
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
  const [extendDate, setExtendDate] = useState("");
  const [extending, setExtending] = useState(false);
  const [extendResult, setExtendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{ ok: boolean; msg: string } | null>(null);

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
                    durationSeconds: readVideoDurationSeconds(item.durationSeconds),
                  }))
              : [],
            speedTrapQuestionIds: Array.isArray((g as { speedTrapQuestionIds?: unknown }).speedTrapQuestionIds)
              ? ((g as { speedTrapQuestionIds?: unknown[] }).speedTrapQuestionIds ?? [])
                  .filter((value): value is string => typeof value === "string" && value.length > 0)
              : (
                  (g as { speedTrapConfig?: { questionIds?: unknown[] } }).speedTrapConfig?.questionIds ?? []
                ).filter((value): value is string => typeof value === "string" && value.length > 0),
          }));
        } else if (modules.length > 0) {
          // Legacy flat format: { index, title, videoUrl }
          moduleGroups = [{
            title: "Module 1",
            videos: modules.map((m: Record<string, unknown>) => ({
              title: String(m.title || ""),
              url: String(m.videoUrl || m.url || ""),
              durationSeconds: readVideoDurationSeconds(m.durationSeconds),
            })),
            speedTrapQuestionIds: [],
          }];
        } else {
          moduleGroups = [];
        }

        // Ensure at least one group with one video
        if (moduleGroups.length === 0) {
          moduleGroups = [{ title: "Module 1", videos: [{ title: "", url: "", durationSeconds: "" }], speedTrapQuestionIds: [] }];
        }
        for (const g of moduleGroups) {
          if (g.videos.length === 0) {
            g.videos.push({ title: "", url: "", durationSeconds: "" });
          }
          if (!Array.isArray(g.speedTrapQuestionIds)) {
            g.speedTrapQuestionIds = [];
          }
        }

        setState({
          campaignId: campaign.id,
          requestId: campaign.requestId,
          name: campaign.title,
          protocol: campaign.sponsorName,
          coverImageUrl: campaign.coverImageUrl ?? "",
          chain: campaign.primaryChain || "base",
          tier: campaign.tier,
          objective: campaign.objective,
          pool: String(Number(campaign.prizePoolUsdc)),
          winners: plan?.winnerCap ? String(plan.winnerCap) : String(campaign.rewardSchedule?.winnerCap ?? "300"),
          agentInvites: "20",
          ownerType: campaign.ownerType || "PARTNER",
          contractType: campaign.contractType || "PARTNER_CAMPAIGNS",
          status: campaign.status,
          quizMode: readQuizModeFromModules(modules),
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
          onChainCampaignId: campaign.onChainCampaignId ?? null,
          partnerContractAddress: campaign.partnerContractAddress ?? null,
          endAt: campaign.endAt ? new Date(campaign.endAt).toISOString() : null,
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
      {
        title: `Module ${state.moduleGroups.length + 1}`,
        videos: [{ title: "", url: "", durationSeconds: "" }],
        speedTrapQuestionIds: [],
      },
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
      videos: [...updated[groupIdx].videos, { title: "", url: "", durationSeconds: "" }],
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
      updated[groupIdx] = { ...updated[groupIdx], videos: [{ title: "", url: "", durationSeconds: "" }] };
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

  const toggleSpeedTrapQuestionForGroup = (groupIdx: number, questionId: string) => {
    const updated = [...state.moduleGroups];
    const current = updated[groupIdx]?.speedTrapQuestionIds ?? [];
    const exists = current.includes(questionId);

    if (exists) {
      updated[groupIdx] = {
        ...updated[groupIdx],
        speedTrapQuestionIds: current.filter((id) => id !== questionId),
      };
      update("moduleGroups", updated);
      return;
    }

    if (current.length >= 2) {
      showToast("Attach at most 2 speed trap questions per group transition");
      return;
    }

    updated[groupIdx] = {
      ...updated[groupIdx],
      speedTrapQuestionIds: [...current, questionId],
    };
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
      const modules = state.moduleGroups.map((g, index) => {
        const group: Record<string, unknown> = {
          title: g.title || "Untitled Module",
          items: g.videos
            .filter((v) => v.url)
            .map((v) => ({
              type: "video" as const,
              title: v.title || "Untitled Video",
              videoUrl: v.url,
              ...(Number(v.durationSeconds) > 0
                ? { durationSeconds: Math.max(0, Math.floor(Number(v.durationSeconds))) }
                : {}),
            })),
        };

        if (index === 0) {
          group.assessmentConfig = {
            quizMode: state.quizMode,
            liveAssessmentRequired: true,
          };
        }

        const attachedSpeedTrapQuestionIds = g.speedTrapQuestionIds.filter(Boolean).slice(0, 2);
        if (index < state.moduleGroups.length - 1 && attachedSpeedTrapQuestionIds.length > 0) {
          group.speedTrapConfig = {
            questionIds: attachedSpeedTrapQuestionIds,
          };
        }

        return group;
      });

      const payload: Record<string, unknown> = {
        title: state.name,
        objective: state.objective,
        sponsorName: state.protocol,
        coverImageUrl: state.coverImageUrl.trim() || null,
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

      if (asStatus === "LIVE") {
        payload.isPublished = true;
      } else if (asStatus === "DRAFT") {
        payload.isPublished = false;
      }

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
  const speedTrapQuestions = questions.filter((question) => question.isSpeedTrap);

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
              <Field
                label="Thumbnail URL"
                value={state.coverImageUrl}
                onChange={(v) => update("coverImageUrl", v)}
                placeholder="https://..."
                mono
              />
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
              Speed traps are attached to grouped-module transitions. After a learner completes a group, any attached speed trap questions fire before the next group begins.
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
                      <Field
                        label="Verification Duration (seconds)"
                        value={video.durationSeconds}
                        onChange={(v) => updateVideo(gIdx, vIdx, "durationSeconds", v)}
                        placeholder="180"
                        type="number"
                      />
                    </div>
                  ))}

                  <button
                    onClick={() => addVideoToGroup(gIdx)}
                    className="text-[10px] font-mono text-neutral-400 px-2 py-1 rounded border border-white/10 hover:border-white/20 hover:text-white transition-colors"
                  >
                    + Add Video to Group
                  </button>

                  <div className="mt-4 rounded-lg border border-white/[.06] bg-[#080808] p-3">
                    <div className="text-[9px] font-mono uppercase text-neutral-500 mb-2">
                      Speed Trap After This Group
                    </div>
                    {gIdx === state.moduleGroups.length - 1 ? (
                      <div className="text-[11px] text-neutral-500">
                        Final group. No between-group speed trap runs after this group.
                      </div>
                    ) : !state.campaignId ? (
                      <div className="text-[11px] text-neutral-500">
                        Save the campaign first, then build speed trap questions in Step 3 and attach up to 2 here.
                      </div>
                    ) : speedTrapQuestions.length === 0 ? (
                      <div className="text-[11px] text-neutral-500">
                        No speed trap questions found yet. Create them in Step 3, then return here to attach them to this group transition.
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 text-[11px] text-neutral-400">
                          Attach up to 2 speed trap questions that should fire after this group completes.
                        </div>
                        <div className="space-y-2">
                          {speedTrapQuestions.map((question) => {
                            const selected = group.speedTrapQuestionIds.includes(question.id);
                            const selectionLocked =
                              !selected && group.speedTrapQuestionIds.length >= 2;
                            return (
                              <button
                                key={question.id}
                                type="button"
                                onClick={() => toggleSpeedTrapQuestionForGroup(gIdx, question.id)}
                                disabled={selectionLocked}
                                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                                  selected
                                    ? "border-nexid-gold/40 bg-nexid-gold/10 text-white"
                                    : "border-white/[.06] bg-[#0a0a0a] text-neutral-300 hover:border-white/20 hover:text-white"
                                } ${selectionLocked ? "opacity-40" : ""}`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[11px] font-medium">{question.questionText}</div>
                                    <div className="mt-1 text-[10px] font-mono text-neutral-500">
                                      Window: {question.speedTrapWindow ?? 10}s
                                    </div>
                                  </div>
                                  <div className={`text-[10px] font-mono ${selected ? "text-nexid-gold" : "text-neutral-500"}`}>
                                    {selected ? "Attached" : "Attach"}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
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
              <div className="text-[12px] text-neutral-400">Choose the structured quiz mode, then build the pool. Users get 5 random quiz questions here, and everyone still completes the mandatory Gemini Live assessment afterward.</div>
            </div>
          </div>

          <div className="bg-[#060606] border border-white/[.06] rounded-xl p-4 mb-3">
            <div className="text-[9px] font-mono uppercase text-neutral-500 mb-3">Structured Quiz Mode</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[
                {
                  value: "MCQ" as const,
                  title: "MCQ Quiz",
                  body: "Five randomized multiple-choice questions before live AI assessment.",
                },
                {
                  value: "FREE_TEXT" as const,
                  title: "Free-Text Quiz",
                  body: "Five randomized written responses before live AI assessment.",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => update("quizMode", option.value)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    state.quizMode === option.value
                      ? "border-nexid-gold/50 bg-nexid-gold/10 text-white"
                      : "border-white/[.06] bg-[#0a0a0a] text-neutral-300 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <div className="text-[11px] font-display font-bold">{option.title}</div>
                  <div className="mt-1 text-[11px] text-neutral-400">{option.body}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 text-[10px] font-mono text-neutral-500">
              Gemini Live remains a separate mandatory assessment stage for every enrolled learner.
            </div>
          </div>

          {state.campaignId ? (
            <QuestionEditor
              campaignId={state.campaignId}
              questions={questions}
              onRefresh={() => loadQuestions(state.campaignId!)}
              pointsEnabled={state.contractType === "PARTNER_CAMPAIGNS"}
            />
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

          {/* Deploy On-Chain — shown when campaign is saved but not yet deployed */}
          {state.campaignId !== null && state.onChainCampaignId === null && (
            <div className="bg-[#060606] border border-amber-500/20 rounded-xl p-4 mb-3">
              <div className="text-[9px] font-mono uppercase text-amber-500/70 mb-2">Not Yet Deployed On-Chain</div>
              <div className="text-[11px] text-neutral-400 mb-3">
                {state.contractType === "NEXID_CAMPAIGNS"
                  ? <>Create this campaign on the <span className="text-white">NexIDCampaigns</span> contract by signing a transaction from your owner wallet.</>
                  : <>Create this campaign on the <span className="text-white">PartnerCampaigns</span> contract by signing a transaction from your owner wallet. Your wallet address will be set as the campaign sponsor.</>}
              </div>
              <button
                type="button"
                disabled={deploying}
                onClick={async () => {
                  if (!state.campaignId) return;
                  setDeploying(true);
                  setDeployResult(null);
                  try {
                    // 1. Get deploy params from backend
                    const paramsRes = await authFetch(`/api/admin/campaigns/${state.campaignId}/deploy-onchain`);
                    if (!paramsRes.ok) {
                      const err = await paramsRes.json();
                      setDeployResult({ ok: false, msg: err.error ?? "Failed to get deploy params" });
                      return;
                    }
                    const deployPayload = await paramsRes.json() as DeployParamsResponse;
                    const { contractAddress, createParams } = deployPayload;

                    // 2. Connect wallet
                    const eth = (window as Window & { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
                    if (!eth) {
                      setDeployResult({ ok: false, msg: "No wallet detected (window.ethereum not available)" });
                      return;
                    }
                    const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];

                    // 3. Encode createCampaign calldata
                    const calldata = deployPayload.contractType === "NEXID_CAMPAIGNS"
                      ? (() => {
                          const nexIdParams = createParams as NexIdDeployCreateParams;
                          return encodeFunctionData({
                            abi: CREATE_NEXID_CAMPAIGN_ABI,
                            functionName: "createCampaign",
                            args: [
                              nexIdParams.title,
                              nexIdParams.description,
                              nexIdParams.longDescription,
                              nexIdParams.instructor,
                              nexIdParams.objectives,
                              nexIdParams.prerequisites,
                              nexIdParams.category,
                              nexIdParams.level,
                              nexIdParams.thumbnailUrl,
                              nexIdParams.duration,
                              BigInt(nexIdParams.totalLessons),
                            ],
                          });
                        })()
                      : (() => {
                          const partnerParams = createParams as PartnerDeployCreateParams;
                          return encodeFunctionData({
                            abi: CREATE_PARTNER_CAMPAIGN_ABI,
                            functionName: "createCampaign",
                            args: [
                              partnerParams.title,
                              partnerParams.description,
                              partnerParams.category,
                              partnerParams.level,
                              partnerParams.thumbnailUrl,
                              BigInt(partnerParams.totalTasks),
                              accounts[0] as `0x${string}`,
                              partnerParams.sponsorName,
                              partnerParams.sponsorLogo,
                              BigInt(partnerParams.prizePool),
                              BigInt(partnerParams.startTime),
                              partnerParams.plan,
                              BigInt(partnerParams.customWinnerCap),
                            ],
                          });
                        })();

                    // 4. Send tx from wallet
                    const txHash = await eth.request({
                      method: "eth_sendTransaction",
                      params: [{ to: contractAddress, from: accounts[0], data: calldata }],
                    }) as string;

                    setDeployResult({ ok: true, msg: `Tx sent: ${txHash.slice(0, 18)}... — waiting for backend to confirm...` });

                    // 5. Let backend parse receipt + save onChainCampaignId
                    setDeployResult({ ok: true, msg: `Tx sent: ${txHash.slice(0, 18)}... waiting for backend to confirm...` });
                    const saveRes = await authFetch(`/api/admin/campaigns/${state.campaignId}/deploy-onchain`, {
                      method: "POST",
                      body: JSON.stringify({ txHash, contractAddress }),
                    });
                    const saveData = await saveRes.json();
                    if (saveRes.ok) {
                      setState((prev) => ({
                        ...prev,
                        onChainCampaignId: saveData.onChainCampaignId,
                        partnerContractAddress: saveData.contractAddress,
                      }));
                      setDeployResult({ ok: true, msg: `Deployed! On-chain ID: ${saveData.onChainCampaignId} · tx: ${txHash.slice(0, 18)}...` });
                    } else {
                      setDeployResult({ ok: false, msg: `Tx sent (${txHash.slice(0, 18)}...) but save failed: ${saveData.error ?? saveData.detail}` });
                    }
                  } catch (err: unknown) {
                    setDeployResult({ ok: false, msg: err instanceof Error ? err.message : String(err) });
                  } finally {
                    setDeploying(false);
                  }
                }}
                className="text-[11px] font-display font-bold px-4 py-2 rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-40"
              >
                {deploying ? "Deploying..." : "Deploy On-Chain"}
              </button>
              {deployResult && (
                <div className={`mt-2 text-[10px] font-mono rounded-lg px-3 py-2 ${
                  deployResult.ok
                    ? "bg-green-500/10 border border-green-500/20 text-green-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}>
                  {deployResult.msg}
                </div>
              )}
            </div>
          )}

          {/* Contract Status Card — only shown when deployed */}
          {state.onChainCampaignId !== null && (
            <div className="bg-[#060606] border border-white/[.06] rounded-xl p-4 mb-3">
              <div className="text-[9px] font-mono uppercase text-neutral-500 mb-3">Contract Status</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-[#0a0a0a] border border-white/[.06] rounded-lg p-3">
                  <div className="text-[9px] font-mono text-neutral-500 mb-1">Contract</div>
                  <div className="font-mono text-white text-sm">{state.contractType === "NEXID_CAMPAIGNS" ? "NexIDCampaigns" : "PartnerCampaigns"}</div>
                </div>
                <div className="bg-[#0a0a0a] border border-white/[.06] rounded-lg p-3">
                  <div className="text-[9px] font-mono text-neutral-500 mb-1">On-Chain ID</div>
                  <div className="font-mono text-white text-sm">{state.onChainCampaignId}</div>
                </div>
                <div className="bg-[#0a0a0a] border border-white/[.06] rounded-lg p-3">
                  <div className="text-[9px] font-mono text-neutral-500 mb-1">Contract Address</div>
                  <div className="font-mono text-[10px] text-nexid-gold truncate">
                    {state.partnerContractAddress ?? "—"}
                  </div>
                </div>
                {state.contractType === "PARTNER_CAMPAIGNS" && (
                <div className="bg-[#0a0a0a] border border-white/[.06] rounded-lg p-3 col-span-2">
                  <div className="text-[9px] font-mono text-neutral-500 mb-1">Current End Time (DB)</div>
                  <div className="font-mono text-sm">
                    {state.endAt
                      ? <span className={new Date(state.endAt) < new Date() ? "text-red-400" : "text-green-400"}>
                          {new Date(state.endAt).toUTCString()}
                          {new Date(state.endAt) < new Date() && " — ENDED"}
                        </span>
                      : <span className="text-neutral-500">Not set</span>}
                  </div>
                </div>
                )}
              </div>

              {/* Extend End Time */}
              {state.contractType === "PARTNER_CAMPAIGNS" && (
              <div className="border-t border-white/[.04] pt-3">
                <div className="text-[9px] font-mono uppercase text-neutral-500 mb-2">Extend End Time On-Chain</div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[9px] font-mono text-neutral-500 block mb-1">New End Date &amp; Time (UTC)</label>
                    <input
                      type="datetime-local"
                      value={extendDate}
                      onChange={(e) => { setExtendDate(e.target.value); setExtendResult(null); }}
                      className="w-full bg-[#0a0a0a] border border-white/[.08] rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-white outline-none focus:border-nexid-gold/40"
                    />
                  </div>
                  <div className="flex gap-1">
                    {[7, 14, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          const dt = new Date(Date.now() + d * 86400 * 1000);
                          const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
                          setExtendDate(local.toISOString().slice(0, 16));
                          setExtendResult(null);
                        }}
                        className="text-[10px] font-mono px-2 py-1.5 rounded border border-white/10 text-neutral-400 hover:text-white hover:border-white/20 transition-colors"
                      >
                        +{d}d
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={!extendDate || extending}
                    onClick={async () => {
                      if (!extendDate || !state.campaignId) return;
                      setExtending(true);
                      setExtendResult(null);
                      try {
                        const ts = Math.floor(new Date(extendDate).getTime() / 1000);

                        // 1. Fetch current on-chain params from backend (read-only)
                        const paramsRes = await authFetch(`/api/admin/campaigns/${state.campaignId}/extend-onchain`);
                        if (!paramsRes.ok) {
                          const err = await paramsRes.json();
                          setExtendResult({ ok: false, msg: err.error ?? "Failed to read on-chain data" });
                          return;
                        }
                        const { abiVersion, onChainCampaignId, contractAddress, params } = await paramsRes.json();

                        // 2. Connect wallet first — sponsor = connected wallet address
                        const eth = (window as Window & { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
                        if (!eth) {
                          setExtendResult({ ok: false, msg: "No wallet detected (window.ethereum not available)" });
                          return;
                        }
                        const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
                        const sponsor = accounts[0] as `0x${string}`;

                        // 3. Encode updateCampaign calldata — V1 passes endTime directly, V2 computes startTime
                        let calldata: `0x${string}`;
                        if (abiVersion === "v1") {
                          calldata = encodeFunctionData({
                            abi: UPDATE_CAMPAIGN_V1_ABI,
                            functionName: "updateCampaign",
                            args: [
                              BigInt(onChainCampaignId),
                              params.title,
                              params.description,
                              params.category,
                              params.level,
                              params.thumbnailUrl,
                              params.duration as string,
                              BigInt(params.totalTasks),
                              sponsor,
                              params.sponsorName,
                              params.sponsorLogo,
                              BigInt(params.prizePool),
                              BigInt(params.startTime),
                              BigInt(ts),
                            ],
                          });
                        } else {
                          const newStartTime = ts - params.durationDays * 86400;
                          calldata = encodeFunctionData({
                            abi: UPDATE_CAMPAIGN_ABI,
                            functionName: "updateCampaign",
                            args: [
                              BigInt(onChainCampaignId),
                              params.title,
                              params.description,
                              params.category,
                              params.level,
                              params.thumbnailUrl,
                              BigInt(params.totalTasks),
                              sponsor,
                              params.sponsorName,
                              params.sponsorLogo,
                              BigInt(params.prizePool),
                              BigInt(newStartTime),
                              params.plan,
                              0n,
                            ],
                          });
                        }

                        const txHash = await eth.request({
                          method: "eth_sendTransaction",
                          params: [{ to: contractAddress, from: accounts[0], data: calldata }],
                        }) as string;

                        // 5. Sync new endAt to DB
                        const syncRes = await authFetch(`/api/admin/campaigns/${state.campaignId}/extend-onchain`, {
                          method: "POST",
                          body: JSON.stringify({ newEndTimestamp: ts, txHash }),
                        });
                        const syncData = await syncRes.json();
                        if (syncRes.ok) {
                          setState((prev) => ({ ...prev, endAt: syncData.newEndAt }));
                          setExtendResult({ ok: true, msg: `Extended to ${new Date(syncData.newEndAt).toUTCString()} · tx: ${txHash.slice(0, 18)}...` });
                          setExtendDate("");
                        } else {
                          setExtendResult({ ok: true, msg: `Tx sent (${txHash.slice(0, 18)}...) but DB sync failed: ${syncData.error}` });
                        }
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        setExtendResult({ ok: false, msg });
                      } finally {
                        setExtending(false);
                      }
                    }}
                    className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg bg-nexid-gold text-black disabled:opacity-40 hover:bg-yellow-400 transition-colors whitespace-nowrap"
                  >
                    {extending ? "Extending..." : "Extend On-Chain"}
                  </button>
                </div>
                {extendResult && (
                  <div className={`mt-2 text-[10px] font-mono rounded-lg px-3 py-2 ${
                    extendResult.ok
                      ? "bg-green-500/10 border border-green-500/20 text-green-400"
                      : "bg-red-500/10 border border-red-500/20 text-red-400"
                  }`}>
                    {extendResult.msg}
                  </div>
                )}
              </div>
              )}
            </div>
          )}

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
              <div>Attached Speed Traps: <span className="text-white">{state.moduleGroups.reduce((sum, group) => sum + group.speedTrapQuestionIds.length, 0)}</span></div>
              <div>Quiz Mode: <span className="text-white">{state.quizMode === "FREE_TEXT" ? "Free Text" : "MCQ"}</span></div>
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
