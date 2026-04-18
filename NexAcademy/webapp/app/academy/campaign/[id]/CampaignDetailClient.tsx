"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  normalizeCampaignModules,
  type CampaignModuleGroup,
  type CampaignModuleItem,
} from "@/lib/campaign-modules";
import {
  isGenesisRewardCampaign,
  isInternalCoreCampaign,
} from "@/lib/campaign-rewards";
import SpeedTrapOverlay, { type SpeedTrapRef } from "@/app/components/campaign/SpeedTrapOverlay";
import { useEngagementTracker } from "@/hooks/useEngagementTracker";
import LiveQuizModal from "@/app/components/campaign/LiveQuizModal";
import NormalQuizModal from "@/app/components/campaign/NormalQuizModal";
import GenesisRewardsModal from "@/app/components/campaign/GenesisRewardsModal";
import ProofOfAdvocacy from "@/app/components/campaign/ProofOfAdvocacy";
import OnchainVerificationCard from "@/app/components/campaign/OnchainVerificationCard";
import {
  ensureCampaignChain,
  resolveCampaignChainMeta,
} from "@/lib/client/campaign-chain";
import ImmersiveAgentSession from "@/app/components/campaign/ImmersiveAgentSession";
import {
  buildSequentialCompletedGroupIndexes,
  normalizeCampaignFlowState,
  type CampaignFlowStage,
  type CampaignFlowStateSnapshot,
} from "@/lib/campaign-flow-state";
import type { CampaignAssessmentSummary } from "@/lib/services/campaign-assessment-config.service";

type Campaign = {
  id: number;
  slug: string;
  title: string;
  objective: string;
  sponsorName: string;
  sponsorNamespace: string | null;
  tier: string;
  ownerType: string;
  contractType: string;
  prizePoolUsdc: string;
  keyTakeaways: string[];
  coverImageUrl: string | null;
  modules: unknown;
  status: string;
  isPublished: boolean;
  startAt: string | null;
  endAt: string | null;
  onChainCampaignId: number | null;
  hasOnchainVerification: boolean;
  onchainConfig: {
    verificationMode?: "transaction" | "signature";
    actionDescription?: string;
    chainId?: number;
  } | null;
  primaryChain: string;
};

type LeaderboardRow = {
  rank: number | null;
  score: number;
  rewardAmountUsdc: string | null;
  completedAt: string | null;
  walletAddress: string;
};

type OnChainSnapshot = {
  contractType: "PARTNER_CAMPAIGNS" | "NEXID_CAMPAIGNS";
  contractAddress: string;
  campaignId: number;
  participantCount: number;
  sponsorAddress: string | null;
} | null;

type CampaignResponse = {
  campaign: Campaign;
  leaderboard: LeaderboardRow[];
  onChain: OnChainSnapshot;
  assessmentSummary: CampaignAssessmentSummary;
};

type Module = CampaignModuleItem;

type ModuleGroup = CampaignModuleGroup;

type CampaignNote = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
};

type ParticipantScoreState = {
  videoScore: number | null;
  quizScore: number | null;
  onchainScore: number | null;
  agentScore: number | null;
  compositeScore: number | null;
  rank: number | null;
};

type UserMultiplierSnapshot = {
  multiplier: {
    consistentCampaigns: number;
    highQuizAverage: number;
    zeroFlags: number;
    onChainActive: number;
    agentCertified: number;
    crossProtocol: number;
    domainHolder: number;
    protocolSpecialist: number;
    total: number;
  };
  signals: {
    consistentCampaigns: string | null;
    highQuizAverage: string | null;
    zeroFlags: string | null;
    onChainActive: string | null;
    agentCertified: string | null;
    crossProtocol: string | null;
    domainHolder: string | null;
    protocolSpecialist: string | null;
  };
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200";
const DEFAULT_VIDEO_GATE_DURATION_SECONDS = 180;
const EMPTY_PARTICIPANT_SCORES: ParticipantScoreState = {
  videoScore: null,
  quizScore: null,
  onchainScore: null,
  agentScore: null,
  compositeScore: null,
  rank: null,
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function shortAddress(value: string) {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatUsdc(value: string | null) {
  if (!value) return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return amount.toLocaleString();
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatSyllabusSectionLabel(index: number, title: string) {
  const safeTitle = title.trim() || `Module ${index + 1}`;
  return `Module ${index + 1}: ${safeTitle}`;
}

function computeCountdownParts(endAt: string | null | undefined, nowTs: number) {
  if (!endAt) return null;
  const end = new Date(endAt);
  if (Number.isNaN(end.getTime())) return null;

  const diff = end.getTime() - nowTs;
  if (diff <= 0) return null;

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  return {
    days: String(days).padStart(2, "0"),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
  };
}

function normalizeNullableScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : null;
}

function normalizeNullableRank(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function resolveVideoGateDurationSeconds(item: CampaignModuleItem | undefined | null) {
  if (!item || item.type !== "video") {
    return DEFAULT_VIDEO_GATE_DURATION_SECONDS;
  }

  if (typeof item.durationSeconds === "number" && Number.isFinite(item.durationSeconds) && item.durationSeconds > 0) {
    return Math.max(1, Math.floor(item.durationSeconds));
  }

  return DEFAULT_VIDEO_GATE_DURATION_SECONDS;
}

function calculateDisplayCompositeScore(input: {
  videoScore: number | null;
  quizScore: number | null;
  onchainScore: number | null;
  agentScore: number | null;
  hasStructuredQuiz: boolean;
  hasOnchainVerification: boolean;
}) {
  const weightedComponents = [
    { active: input.videoScore !== null, required: true, weight: 0.2, value: input.videoScore },
    {
      active: input.hasStructuredQuiz && input.quizScore !== null,
      required: input.hasStructuredQuiz,
      weight: 0.3,
      value: input.quizScore,
    },
    {
      active: input.hasOnchainVerification && input.onchainScore !== null,
      required: input.hasOnchainVerification,
      weight: 0.1,
      value: input.onchainScore,
    },
    { active: input.agentScore !== null, required: true, weight: 0.4, value: input.agentScore },
  ];

  if (weightedComponents.some((component) => component.required && component.value === null)) {
    return null;
  }

  const activeComponents = weightedComponents.filter((component) => component.active);
  if (activeComponents.length === 0) {
    return null;
  }

  const totalWeight = activeComponents.reduce((sum, component) => sum + component.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  const total = activeComponents.reduce(
    (sum, component) => sum + ((component.value ?? 0) * component.weight) / totalWeight,
    0,
  );

  return Math.max(0, Math.min(100, Math.round(total)));
}

interface CampaignDetailClientProps {
  campaignId: string;
}

function isModuleLocked(group: ModuleGroup | undefined): boolean {
  if (!group || group.items.length === 0) {
    return false;
  }
  return group.items.every((item) => item.type === "locked");
}

export default function CampaignDetailClient({ campaignId }: CampaignDetailClientProps) {
  const [authToken, setAuthToken] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null,
  );
  const [loading, setLoading] = useState(true);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CampaignResponse | null>(null);
  const [activeModule, setActiveModule] = useState(0);
  const speedTrapRef = useRef<SpeedTrapRef>(null);
  const [activeModuleItem, setActiveModuleItem] = useState(0);
  const [completedUntil, setCompletedUntil] = useState(-1);
  const [sidebarTab, setSidebarTab] = useState<"syllabus" | "leaderboard">("syllabus");
  const [hasStartedFlow, setHasStartedFlow] = useState(false);
  const [flowStateHydrated, setFlowStateHydrated] = useState(false);

  // Enrollment state
  const [enrolled, setEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollmentScore, setEnrollmentScore] = useState(0);
  const [participantScores, setParticipantScores] = useState<ParticipantScoreState>(EMPTY_PARTICIPANT_SCORES);
  const [enrollmentChecked, setEnrollmentChecked] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [canViewOnChainSnapshot, setCanViewOnChainSnapshot] = useState(false);
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [multiplierSnapshot, setMultiplierSnapshot] = useState<UserMultiplierSnapshot | null>(null);
  const [multiplierLoading, setMultiplierLoading] = useState(false);
  const [notes, setNotes] = useState<CampaignNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [domainClaimed, setDomainClaimed] = useState<string | null>(null);
  const [domainSpotsRemaining, setDomainSpotsRemaining] = useState<number | null>(null);

  // Quiz modal gate (before campaign completion)
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizAssignment, setQuizAssignment] = useState<'LIVE_AI' | 'NORMAL_MCQ' | null>(null);
  const [quizMode, setQuizMode] = useState<"MCQ" | "FREE_TEXT" | null>(null);
  const [assessmentHandoffStage, setAssessmentHandoffStage] = useState<"QUIZ_ASSESSMENT" | "ONCHAIN_VERIFICATION" | "PROOF_OF_ADVOCACY" | "LIVE_AI_PREP" | null>(null);

  // Genesis rewards popup (after campaign completion for NexID partner campaigns)
  const [showGenesisRewards, setShowGenesisRewards] = useState(false);

  // Per-item interaction tracking to prevent gaming completion
  const [completedGroupIndexes, setCompletedGroupIndexes] = useState<number[]>([]);
  const [viewedItems, setViewedItems] = useState<Set<string>>(new Set());
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizCorrect, setQuizCorrect] = useState<Set<string>>(new Set());
  const [videoUnlockAtByItem, setVideoUnlockAtByItem] = useState<Record<string, number>>({});
  const [videoSecondsRemaining, setVideoSecondsRemaining] = useState<number | null>(null);
  const resolvedCampaignId = data?.campaign.id ?? null;

  function applyParticipantScores(participant: Record<string, unknown> | null | undefined) {
    setParticipantScores({
      videoScore: normalizeNullableScore(participant?.videoScore),
      quizScore: normalizeNullableScore(participant?.quizScore),
      onchainScore: normalizeNullableScore(participant?.onchainScore),
      agentScore: normalizeNullableScore(participant?.agentScore),
      compositeScore: normalizeNullableScore(participant?.compositeScore),
      rank: normalizeNullableRank(participant?.rank),
    });
  }

  // Keep auth token in reactive state so connect/sign actions immediately update campaign UI.
  useEffect(() => {
    const syncAuthToken = () => {
      setAuthToken(localStorage.getItem("auth_token"));
    };

    syncAuthToken();
    window.addEventListener("storage", syncAuthToken);
    window.addEventListener("nexid-auth-changed", syncAuthToken as EventListener);
    return () => {
      window.removeEventListener("storage", syncAuthToken);
      window.removeEventListener("nexid-auth-changed", syncAuthToken as EventListener);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  // Load campaign data
  useEffect(() => {
    let active = true;

    async function loadCampaign() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body?.error || "Failed to load campaign");
        }
        if (active) {
          setData(body);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load campaign");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadCampaign();
    return () => {
      active = false;
    };
  }, [campaignId]);

  // Pre-switch the wallet to the campaign's chain once the campaign data loads
  // and we know an onchain verification step is required. This is scoped to
  // the campaign page — the global ConnectButton's auto-switch-to-Base skips
  // /academy/campaign/ paths so the two don't fight each other.
  useEffect(() => {
    if (!data) return;
    if (!data.campaign.hasOnchainVerification) return;
    const meta = resolveCampaignChainMeta(
      data.campaign.primaryChain,
      data.campaign.onchainConfig?.chainId ?? null,
    );
    if (!meta) return;
    void ensureCampaignChain(meta);
  }, [data]);

  // Mark non-quiz items as viewed when selected
  useEffect(() => {
    if (!data || !enrolled || !hasStartedFlow) return;
    const modules: ModuleGroup[] = normalizeCampaignModules(data.campaign.modules);
    const mod = modules[activeModule];
    if (!mod) return;
    const item = mod.items[activeModuleItem];
    if (!item) return;
    // Quizzes require correct answer; videos/tasks are viewed on selection
    if (item.type !== "quiz") {
      if (item.type === "video") return;
      const key = `${activeModule}-${activeModuleItem}`;
      setViewedItems((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }
  }, [activeModule, activeModuleItem, data, enrolled, hasStartedFlow]);

  // Check enrollment status
  useEffect(() => {
    if (!data) return;
    if (!authToken) {
      setEnrolled(false);
      setEnrollmentScore(0);
      setParticipantScores(EMPTY_PARTICIPANT_SCORES);
      setCompletedUntil(-1);
      setCompletedAt(null);
      resetLocalFlowProgress();
      setFlowStateHydrated(true);
      setEnrollmentChecked(true);
      return;
    }

    setEnrollmentChecked(false);
    setFlowStateHydrated(false);
    const campaignModules = normalizeCampaignModules(data.campaign.modules);

    let cancelled = false;

    async function loadEnrollmentState() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/enroll`, { headers: authHeaders() });
        if (!res.ok) {
          if (!cancelled) {
            setEnrolled(false);
            setParticipantScores(EMPTY_PARTICIPANT_SCORES);
            setCompletedUntil(-1);
            setCompletedAt(null);
            resetLocalFlowProgress();
          }
          return;
        }

        const body = await res.json();
        if (cancelled) {
          return;
        }

        setEnrolled(body.enrolled);

        if (!body.participant) {
          applyParticipantScores(null);
          resetLocalFlowProgress();
          return;
        }

        setEnrollmentScore(body.participant.score ?? 0);
        applyParticipantScores(body.participant);
        const savedCompletedUntil = Number.isInteger(body.participant.completedUntil)
          ? body.participant.completedUntil
          : -1;
        setCompletedUntil(savedCompletedUntil);
        setCompletedAt(body.participant.completedAt ?? null);

        const moduleCount = campaignModules.length;
        const fallbackModule = moduleCount > 0
          ? Math.min(Math.max(savedCompletedUntil + 1, 0), moduleCount - 1)
          : 0;

        let restoredFlowState = false;

        if (!body.participant.completedAt) {
          try {
            const flowRes = await fetch(`/api/campaigns/${campaignId}/flow-state`, {
              headers: authHeaders(),
            });
            if (flowRes.ok) {
              const flowBody = await flowRes.json().catch(() => null);
              if (!cancelled && flowBody?.state) {
                restoreLocalFlowProgress(
                  normalizeCampaignFlowState(flowBody.state),
                  campaignModules,
                  savedCompletedUntil,
                );
                restoredFlowState = true;
              }
            }
          } catch {
            // Fall through to the legacy module-based resume state
          }
        }

        if (!restoredFlowState) {
          const fallbackCompletedGroupIndexes = buildSequentialCompletedGroupIndexes(savedCompletedUntil);
          setActiveModule(fallbackModule);
          setActiveModuleItem(0);
          setHasStartedFlow(Boolean(body.participant.completedAt || fallbackCompletedGroupIndexes.length > 0));
          setCompletedGroupIndexes(fallbackCompletedGroupIndexes);
          setViewedItems(new Set());
          setQuizCorrect(new Set());
          setQuizAnswers({});
          setVideoUnlockAtByItem({});
        }
      } catch {
        if (!cancelled) {
          setEnrolled(false);
          setParticipantScores(EMPTY_PARTICIPANT_SCORES);
          setCompletedUntil(-1);
          setCompletedAt(null);
          resetLocalFlowProgress();
        }
      } finally {
        if (!cancelled) {
          setFlowStateHydrated(true);
          setEnrollmentChecked(true);
        }
      }
    }

    void loadEnrollmentState();
    return () => {
      cancelled = true;
    };
  }, [campaignId, data, authToken]);

  useEffect(() => {
    let cancelled = false;

    if (!authToken) {
      setMultiplierSnapshot(null);
      setMultiplierLoading(false);
      return;
    }

    setMultiplierLoading(true);

    fetch("/api/user/multiplier", { headers: authHeaders(), cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load multiplier");
        }
        const body = await res.json();
        if (!cancelled) {
          setMultiplierSnapshot(body);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMultiplierSnapshot(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMultiplierLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authToken]);

  // Reload resilience: once modules are done, resume the assessment stage flow.
  useEffect(() => {
    if (!enrolled || !enrollmentChecked || !flowStateHydrated || !data) return;
    const moduleCount = normalizeCampaignModules(data.campaign.modules).length;
    const completedGroupCount = new Set(
      completedGroupIndexes.filter((index) => index >= 0 && index < moduleCount),
    ).size;
    if (moduleCount === 0 || completedGroupCount < moduleCount || completedAt) return;

    // All modules done — check for existing agent session to decide what to do
    async function checkAndGate() {
      let hasCompletedSession = false;
      try {
        const sessionRes = await fetch('/api/agent/session', { headers: authHeaders() });
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          hasCompletedSession = !!(sessionData.sessions ?? []).find(
            (s: { sessionType: string; campaignId: number | null; status: string }) =>
              s.sessionType === 'CAMPAIGN_ASSESSMENT' &&
              s.campaignId === resolvedCampaignId &&
              s.status === 'COMPLETED',
          );

          if (hasCompletedSession) {
            // Quiz genuinely done — finalize only if not already marked complete
            if (!completedAt) await finalizeCampaignCompletion();
            return;
          }
        }
      } catch {
        // Ignore — will show quiz gate below
      }

      // No completed session — show quiz modal.
      // If completedAt was set prematurely (e.g. fallback path), clear it locally
      // so the campaign page reflects the pending-quiz state.
      if (completedAt) setCompletedAt(null);

      try {
        const assignRes = await fetch(`/api/campaigns/${campaignId}/quiz-assignment`, {
          headers: authHeaders(),
        });
        if (assignRes.ok) {
          const assignData = await assignRes.json();
          setQuizMode(assignData.quizMode ?? null);
          setQuizAssignment(assignData.type);
          setShowQuizModal(true);
        }
      } catch {
        // Fallback: complete directly only if not already marked complete
        if (!completedAt) await finalizeCampaignCompletion();
      }
    }

    void syncAssessmentFlowState();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrolled, enrollmentChecked, flowStateHydrated, completedGroupIndexes, completedAt, data]);

  // Load current user's encrypted notes for this campaign.
  useEffect(() => {
    if (!authToken || !data) {
      setNotes([]);
      setNotesLoading(false);
      return;
    }

    setNotesLoading(true);
    setNotesError(null);
    fetch(`/api/campaigns/${campaignId}/notes`, { headers: authHeaders() })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body?.error || "Failed to load notes");
        }
        setNotes(Array.isArray(body.notes) ? body.notes : []);
      })
      .catch((err) => {
        setNotesError(err instanceof Error ? err.message : "Failed to load notes");
      })
      .finally(() => setNotesLoading(false));
  }, [campaignId, data, authToken]);

  // Only admins should see on-chain snapshot details.
  useEffect(() => {
    if (!authToken) {
      setCanViewOnChainSnapshot(false);
      return;
    }

    fetch("/api/auth/admin-status", { headers: authHeaders() })
      .then((res) => setCanViewOnChainSnapshot(res.ok))
      .catch(() => setCanViewOnChainSnapshot(false));
  }, [campaignId, authToken]);

  // Fetch domain claim status after completion for Genesis reward campaigns.
  useEffect(() => {
    if (!data || !completedAt) return;
    if (!isGenesisRewardCampaign(data.campaign)) return;

    if (!authToken) return;

    fetch(`/api/campaigns/${campaignId}/claim-domain`, { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        setDomainClaimed(body.domainName ?? null);
        setDomainSpotsRemaining(
          Number.isFinite(Number(body.spotsRemaining))
            ? Number(body.spotsRemaining)
            : null,
        );
      })
      .catch(() => { });
  }, [campaignId, data, completedAt, authToken]);

  async function handleEnroll() {
    setEnrolling(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/enroll`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        const body = await res.json();
        setEnrolled(body.enrolled);
        if (body.participant) {
          setEnrollmentScore(body.participant.score ?? 0);
          applyParticipantScores(body.participant);
          const savedCompletedUntil = Number.isInteger(body.participant.completedUntil)
            ? body.participant.completedUntil
            : -1;
          const fallbackCompletedGroupIndexes = buildSequentialCompletedGroupIndexes(savedCompletedUntil);
          setCompletedUntil(savedCompletedUntil);
          setCompletedGroupIndexes(fallbackCompletedGroupIndexes);
          setHasStartedFlow(Boolean(body.participant.completedAt || fallbackCompletedGroupIndexes.length > 0));
          if (body.participant.completedAt) {
            setCompletedAt(body.participant.completedAt);
          }
        }
        window.dispatchEvent(new Event("academy-campaign-state-changed"));
      }
    } catch {
      // silently fail
    } finally {
      setEnrolling(false);
    }
  }

  async function handleSaveNote() {
    const content = noteDraft.trim();
    if (!content) return;
    setSavingNote(true);
    setNotesError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/notes`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ content }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || "Failed to save note");
      }
      if (body?.note) {
        setNotes((prev) => [body.note, ...prev]);
      }
      setNoteDraft("");
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await fetch(`/api/campaigns/${campaignId}/notes?noteId=${noteId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      // silently fail
    }
  }

  const isViewingVideo = Boolean(
    enrolled &&
    hasStartedFlow &&
    data &&
    (() => {
      const mods = normalizeCampaignModules(data.campaign.modules);
      const item = mods[activeModule]?.items[activeModuleItem];
      const itemKey = `${activeModule}-${activeModuleItem}`;
      return (
        item?.type === "video"
        && !!item?.videoUrl
        && (viewedItems.has(itemKey) || typeof videoUnlockAtByItem[itemKey] === "number")
      );
    })()
  );

  function ensureVideoGateStarted(moduleIndex = activeModule, itemIndex = activeModuleItem) {
    if (!data || !enrolled || !hasStartedFlow || completedAt) {
      return;
    }

    const mods = normalizeCampaignModules(data.campaign.modules);
    const item = mods[moduleIndex]?.items[itemIndex];
    if (item?.type !== "video") {
      return;
    }

    const itemKey = `${moduleIndex}-${itemIndex}`;
    if (viewedItems.has(itemKey)) {
      if (moduleIndex === activeModule && itemIndex === activeModuleItem) {
        setVideoSecondsRemaining(0);
      }
      return;
    }

    const gateDurationSeconds = resolveVideoGateDurationSeconds(item);
    setVideoUnlockAtByItem((prev) => {
      if (typeof prev[itemKey] === "number" && Number.isFinite(prev[itemKey])) {
        return prev;
      }
      return {
        ...prev,
        [itemKey]: Date.now() + gateDurationSeconds * 1000,
      };
    });

    if (moduleIndex === activeModule && itemIndex === activeModuleItem) {
      setVideoSecondsRemaining(gateDurationSeconds);
    }
  }

  useEffect(() => {
    if (!data || !enrolled || !hasStartedFlow || completedAt) {
      setVideoSecondsRemaining(null);
      return;
    }

    const modules: ModuleGroup[] = normalizeCampaignModules(data.campaign.modules);
    const item = modules[activeModule]?.items[activeModuleItem];
    const itemKey = `${activeModule}-${activeModuleItem}`;
    const gateDurationSeconds = resolveVideoGateDurationSeconds(item);

    if (item?.type !== "video") {
      setVideoSecondsRemaining(null);
      return;
    }

    if (viewedItems.has(itemKey)) {
      setVideoSecondsRemaining(0);
      return;
    }

    const unlockAt = videoUnlockAtByItem[itemKey];
    if (!unlockAt) {
      // Cross-origin iframes (YouTube, Vimeo) swallow pointer events, so the
      // pointer-capture handler on the theater container never fires. Start
      // the verification gate as soon as a video item becomes active.
      setVideoUnlockAtByItem((prev) => {
        if (typeof prev[itemKey] === "number" && Number.isFinite(prev[itemKey])) {
          return prev;
        }
        return {
          ...prev,
          [itemKey]: Date.now() + gateDurationSeconds * 1000,
        };
      });
      setVideoSecondsRemaining(gateDurationSeconds);
      return;
    }

    const tick = () => {
      const nextSeconds = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
      setVideoSecondsRemaining(nextSeconds);

      if (nextSeconds === 0) {
        setViewedItems((prev) => {
          if (prev.has(itemKey)) {
            return prev;
          }
          const next = new Set(prev);
          next.add(itemKey);
          return next;
        });
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [
    activeModule,
    activeModuleItem,
    completedAt,
    data,
    enrolled,
    hasStartedFlow,
    videoUnlockAtByItem,
    viewedItems,
  ]);

  useEngagementTracker({
    campaignId: resolvedCampaignId ?? 0,
    enabled: isViewingVideo && resolvedCampaignId !== null,
    authToken,
  });

  useEffect(() => {
    if (!data || !enrolled || !flowStateHydrated) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistCampaignFlowState();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [
    activeModule,
    activeModuleItem,
    assessmentHandoffStage,
    campaignId,
    completedAt,
    data,
    enrolled,
    flowStateHydrated,
    hasStartedFlow,
    quizAnswers,
    quizAssignment,
    quizCorrect,
    completedGroupIndexes,
    showQuizModal,
    videoUnlockAtByItem,
    viewedItems,
  ]);

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-[1200px] px-6 pb-12 pt-10 text-sm text-nexid-muted">
        Loading campaign...
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="mx-auto w-full max-w-[1200px] px-6 pb-12 pt-10">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error || "Campaign not found"}
        </div>
        <Link href="/" className="mt-4 inline-block text-sm text-nexid-muted hover:text-white">
          {"<-"} Back to Academy
        </Link>
      </section>
    );
  }

  const { campaign, leaderboard, onChain } = data;
  const isEnded = campaign.status === "ENDED";
  const isLive = campaign.status === "LIVE";
  const modules: ModuleGroup[] = normalizeCampaignModules(campaign.modules);
  const hasModules = modules.length > 0;
  const active = modules[activeModule];
  const activeItems: Module[] = active?.items ?? [];
  const activeContent = activeItems[activeModuleItem] ?? activeItems[0];
  const activeModuleLabel = active?.title || `Module ${activeModule + 1}`;
  const activeItemKey = `${activeModule}-${activeModuleItem}`;
  const completedGroupIndexSet = new Set(completedGroupIndexes);
  const highestCompletedGroupIndex = completedGroupIndexes.length > 0
    ? completedGroupIndexes[completedGroupIndexes.length - 1] ?? -1
    : -1;
  const nextUnlockedGroupIndex = Math.min(Math.max(highestCompletedGroupIndex + 1, 0), Math.max(modules.length - 1, 0));
  const allGroupsCompleted = modules.length > 0 && completedGroupIndexSet.size >= modules.length;
  const activeItemCompleted = activeContent?.type === "quiz"
    ? quizCorrect.has(activeItemKey)
    : viewedItems.has(activeItemKey);
  const hasNextItem = activeModuleItem < activeItems.length - 1;
  const canContinueToNextItem = Boolean(hasNextItem && activeItemCompleted);

  // Check if all items in active module have been interacted with
  const allActiveItemsViewed = activeItems.length > 0 && activeItems.every((_item, itemIdx) => {
    const key = `${activeModule}-${itemIdx}`;
    if (_item.type === "quiz") return quizCorrect.has(key);
    return viewedItems.has(key);
  });
  const canMarkComplete = !completedGroupIndexSet.has(activeModule)
    && activeModule === nextUnlockedGroupIndex
    && allActiveItemsViewed;

  const campaignImage = campaign.coverImageUrl || FALLBACK_IMAGE;
  const startDate = formatDate(campaign.startAt);
  const endDate = formatDate(campaign.endAt);
  const hasToken = Boolean(authToken);
  const internalCoreCampaign = isInternalCoreCampaign(campaign);
  const genesisRewardCampaign = isGenesisRewardCampaign(campaign);
  const showBeginVerification = enrolled && !hasStartedFlow && !completedAt;
  const canBrowseModules = Boolean(enrolled && (hasStartedFlow || completedAt));
  const currentFlowStage = deriveFlowStage();
  const completedGroupCount = completedGroupIndexSet.size;
  const resolvedQuizMode = quizMode ?? data.assessmentSummary.quizMode ?? null;
  const hasStructuredQuiz = resolvedQuizMode !== null;
  const moduleSyllabusStepCount = modules.reduce((count, mod) => count + Math.max(mod.items.length, 1), 0);
  const completedModuleSyllabusStepCount = completedAt
    ? moduleSyllabusStepCount
    : modules.reduce((count, mod, groupIndex) => {
        if (completedGroupIndexSet.has(groupIndex)) {
          return count + Math.max(mod.items.length, 1);
        }

        if (mod.items.length === 0) {
          return count;
        }

      return count + mod.items.reduce((itemCount, item, itemIndex) => {
          const itemKey = `${groupIndex}-${itemIndex}`;
          const itemDone = item.type === "quiz" ? quizCorrect.has(itemKey) : viewedItems.has(itemKey);
          return itemCount + (itemDone ? 1 : 0);
        }, 0);
      }, 0);
  const resultsCompositeScore = participantScores.compositeScore ?? calculateDisplayCompositeScore({
    videoScore: participantScores.videoScore,
    quizScore: participantScores.quizScore,
    onchainScore: participantScores.onchainScore,
    agentScore: participantScores.agentScore,
    hasStructuredQuiz,
    hasOnchainVerification: campaign.hasOnchainVerification,
  });
  const theaterProgressPercent = modules.length > 0
    ? Math.max(0, Math.min(100, Math.round((completedGroupCount / modules.length) * 100)))
    : 0;
  const stageHeader = (() => {
    if (completedAt) {
      return {
        eyebrow: "Verified Results",
        title: "Campaign Outcome",
        summary: "Your grouped modules, quiz assessment, and live AI verification have been consolidated into one scorecard.",
        metricValue: resultsCompositeScore === null ? "Syncing" : `${resultsCompositeScore}/100`,
        metricLabel: participantScores.rank ? `Rank #${participantScores.rank}` : "Composite score",
      };
    }
    if (isEnded) {
      return {
        eyebrow: "Campaign Closed",
        title: "Verification Window Ended",
        summary: "This campaign is no longer accepting new progress. Review the sponsor reward rules or browse a live campaign.",
        metricValue: campaign.status,
        metricLabel: "Campaign state",
      };
    }
    if (!enrolled) {
      return {
        eyebrow: "Campaign Access",
        title: "Enrollment Required",
        summary: "Enrollment creates your active campaign and unlocks the guided verification flow.",
        metricValue: isLive ? "Open" : "Closed",
        metricLabel: isLive ? "Enrollment status" : "Campaign status",
      };
    }
    if (showBeginVerification) {
      return {
        eyebrow: "Active Campaign",
        title: "Verification Ready",
        summary: "Begin the guided campaign flow to enter the learning theater, grouped-module checks, and the assessment ladder.",
        metricValue: `${completedGroupCount}/${modules.length || 0}`,
        metricLabel: "Grouped modules complete",
      };
    }
    if (assessmentHandoffStage === "QUIZ_ASSESSMENT") {
      return {
        eyebrow: "Assessment Stage",
        title: `${resolvedQuizMode === "FREE_TEXT" ? "Free Text" : "MCQ"} Quiz Assessment`,
        summary: "All grouped modules are complete. The structured quiz must be completed before the live AI stage unlocks.",
        metricValue: `${completedGroupCount}/${modules.length || 0}`,
        metricLabel: "Grouped modules verified",
      };
    }
    if (assessmentHandoffStage === "ONCHAIN_VERIFICATION") {
      return {
        eyebrow: "On-Chain Verification",
        title: campaign.onchainConfig?.verificationMode === "signature" ? "Wallet Signature Required" : "On-Chain Transaction Proof",
        summary: "Verify your on-chain action before continuing to the advocacy step.",
        metricValue: campaign.sponsorName,
        metricLabel: "Chain",
      };
    }
    if (assessmentHandoffStage === "PROOF_OF_ADVOCACY") {
      return {
        eyebrow: "Proof of Advocacy",
        title: "Share Your Story",
        summary: "Submit or skip the advocacy signal before the live AI stage.",
        metricValue: `${completedGroupCount}/${modules.length || 0}`,
        metricLabel: "Grouped modules verified",
      };
    }
    if (assessmentHandoffStage === "LIVE_AI_PREP") {
      return {
        eyebrow: "Live AI Prep",
        title: "Mandatory Gemini Live Assessment",
        summary: "The structured quiz is complete. The next checkpoint is the live AI verification session.",
        metricValue: resolvedQuizMode ?? "MCQ",
        metricLabel: "Structured quiz mode",
      };
    }
    if (currentFlowStage === "MODULE_VIDEO") {
      return {
        eyebrow: "Verification Module",
        title: activeContent?.title || activeModuleLabel,
        summary: "Stay in the theater until this verification step is cleared.",
        metricValue: `${activeModule + 1}/${modules.length || 0}`,
        metricLabel: "Grouped module",
      };
    }
    if (currentFlowStage === "MODULE_QUIZ") {
      return {
        eyebrow: "Knowledge Check",
        title: activeContent?.title || activeModuleLabel,
        summary: "Answer correctly to unlock the next item and preserve your sequential progress.",
        metricValue: `${activeModuleItem + 1}/${activeItems.length || 0}`,
        metricLabel: "Item position",
      };
    }
    return {
      eyebrow: "Verification Task",
      title: activeContent?.title || activeModuleLabel,
      summary: "Complete each grouped module step before the next verification block unlocks.",
      metricValue: `${activeModuleItem + 1}/${activeItems.length || 0}`,
      metricLabel: "Item position",
    };
  })();
  const resultBreakdown = [
    { label: "Video Attention", value: participantScores.videoScore, tone: "text-sky-300" },
    { label: "Quiz Performance", value: participantScores.quizScore, tone: "text-nexid-gold" },
    ...(campaign.hasOnchainVerification
      ? [{ label: "On-Chain Execution", value: participantScores.onchainScore, tone: "text-emerald-300" as const }]
      : []),
    { label: "Live AI Assessment", value: participantScores.agentScore, tone: "text-violet-300" },
    { label: "Composite", value: resultsCompositeScore, tone: "text-white" },
  ] as const;
  const rankedLeaderboard = [...leaderboard].sort((a, b) => {
    const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return b.score - a.score;
  });
  const leaderboardPodium = rankedLeaderboard.slice(0, 3);
  const leaderboardRows = rankedLeaderboard.slice(3, 15);
  const participantCountMetric = onChain?.participantCount ?? rankedLeaderboard.length;
  const completionCountMetric = rankedLeaderboard.filter((row) => row.completedAt !== null).length;
  const sponsorGlyph = (campaign.sponsorName?.trim().charAt(0) || "N").toUpperCase();
  const rewardTypeLabel = internalCoreCampaign ? "Internal" : genesisRewardCampaign ? "Genesis" : "USDC";
  const detailTypeLabel = genesisRewardCampaign || /\.id|passport|nexid sprint/i.test(`${campaign.title} ${campaign.objective}`)
    ? "Campaign"
    : Number(campaign.prizePoolUsdc) > 0
    ? "Campaign"
    : "Free Course";
  const detailChainLabel = genesisRewardCampaign
    ? "Multi-chain"
    : detailTypeLabel === "Free Course"
    ? "Free Course"
    : campaign.sponsorName;
  const countdownParts = computeCountdownParts(campaign.endAt, nowTs);
  const botsBlockedLabel = genesisRewardCampaign ? "N/A" : "N/A";
  const introStageStats = [
    { label: "Modules", value: String(modules.length || 0) },
    { label: "Type", value: detailTypeLabel },
    { label: "Enrolled", value: participantCountMetric.toLocaleString() },
  ] as const;
  const activeStageLabel = activeContent?.type === "video"
    ? "Verification Video"
    : activeContent?.type === "quiz"
    ? "Knowledge Check"
    : activeContent?.type === "task"
    ? "Verification Task"
    : "Module Step";
  const activeStageSummary = activeContent?.description
    ?? (activeContent?.type === "video"
      ? "Remain in the theater until verification clears and Continue becomes available."
      : activeContent?.type === "quiz"
      ? "Answer correctly to unlock the next step in this grouped module."
      : activeContent?.type === "task"
      ? "Complete the sponsor task, then return to continue verification."
      : "Complete this step to continue the grouped module.");
  const multiplierRows = [
    { key: "domainHolder", fallback: ".id domain holder", value: multiplierSnapshot?.multiplier.domainHolder ?? 1, label: multiplierSnapshot?.signals.domainHolder },
    { key: "consistentCampaigns", fallback: "3+ campaigns completed", value: multiplierSnapshot?.multiplier.consistentCampaigns ?? 1, label: multiplierSnapshot?.signals.consistentCampaigns },
    { key: "highQuizAverage", fallback: "Avg quiz score >= 88", value: multiplierSnapshot?.multiplier.highQuizAverage ?? 1, label: multiplierSnapshot?.signals.highQuizAverage },
    { key: "zeroFlags", fallback: "Clean record (no flags)", value: multiplierSnapshot?.multiplier.zeroFlags ?? 1, label: multiplierSnapshot?.signals.zeroFlags },
    { key: "onChainActive", fallback: "4+ consecutive active weeks", value: multiplierSnapshot?.multiplier.onChainActive ?? 1, label: multiplierSnapshot?.signals.onChainActive },
    { key: "crossProtocol", fallback: "3+ partner protocols", value: multiplierSnapshot?.multiplier.crossProtocol ?? 1, label: multiplierSnapshot?.signals.crossProtocol },
    { key: "agentCertified", fallback: "Agent session passed", value: multiplierSnapshot?.multiplier.agentCertified ?? 1, label: multiplierSnapshot?.signals.agentCertified },
    { key: "protocolSpecialist", fallback: "Protocol Specialist badges", value: multiplierSnapshot?.multiplier.protocolSpecialist ?? 1, label: multiplierSnapshot?.signals.protocolSpecialist },
  ].filter((entry) => entry.value > 1);
  const multiplierTotal = multiplierSnapshot?.multiplier.total ?? 1;
  const livePrepGuidelines = [
    "Use a quiet room and a stable microphone connection.",
    "Respond naturally; the Gemini Live session is mandatory.",
    "Results unlock only after the live assessment is completed.",
  ] as const;
  const activeQuizKey = `${activeModule}-${activeModuleItem}`;
  const activeSelectedAnswer = quizAnswers[activeQuizKey];
  const activeQuizCorrect = quizCorrect.has(activeQuizKey);
  const activeQuizHasAnswered = activeSelectedAnswer !== undefined;
  const quizStageActive = currentFlowStage === "QUIZ_ASSESSMENT" || (showQuizModal && quizAssignment === "NORMAL_MCQ");
  const quizStageDone = Boolean(
    completedAt ||
    currentFlowStage === "ONCHAIN_VERIFICATION" ||
    currentFlowStage === "PROOF_OF_ADVOCACY" ||
    currentFlowStage === "LIVE_AI_PREP" ||
    currentFlowStage === "LIVE_AI_ASSESSMENT" ||
    quizAssignment === "LIVE_AI",
  );
  const onchainStageActive = currentFlowStage === "ONCHAIN_VERIFICATION";
  const onchainStageUnlocked = hasStructuredQuiz ? quizStageDone : allGroupsCompleted;
  const onchainStageDone = Boolean(
    completedAt ||
    participantScores.onchainScore !== null ||
    currentFlowStage === "PROOF_OF_ADVOCACY" ||
    currentFlowStage === "LIVE_AI_PREP" ||
    currentFlowStage === "LIVE_AI_ASSESSMENT",
  );
  const advocacyStageActive = currentFlowStage === "PROOF_OF_ADVOCACY";
  const advocacyStageUnlocked = (hasStructuredQuiz ? quizStageDone : allGroupsCompleted)
    && (campaign.hasOnchainVerification ? onchainStageDone : true);
  const advocacyStageDone = Boolean(
    completedAt ||
    currentFlowStage === "LIVE_AI_PREP" ||
    currentFlowStage === "LIVE_AI_ASSESSMENT" ||
    (showQuizModal && quizAssignment === "LIVE_AI")
  );
  const livePreFlightActive = currentFlowStage === "LIVE_AI_PREP";
  const liveAssessmentActive = currentFlowStage === "LIVE_AI_ASSESSMENT" || (showQuizModal && quizAssignment === "LIVE_AI");
  const liveStageUnlocked = hasStructuredQuiz ? quizStageDone : allGroupsCompleted;
  const livePreFlightDone = Boolean(completedAt || liveAssessmentActive);
  const liveAssessmentDone = Boolean(completedAt);
  const certificateStageDone = Boolean(completedAt);
  const assessmentSyllabusStepCount = (hasStructuredQuiz ? 1 : 0) + 4;
  const completedAssessmentSyllabusStepCount =
    (hasStructuredQuiz && quizStageDone ? 1 : 0) +
    (advocacyStageDone ? 1 : 0) +
    (livePreFlightDone ? 1 : 0) +
    (liveAssessmentDone ? 1 : 0) +
    (certificateStageDone ? 1 : 0);
  const syllabusStepCount = moduleSyllabusStepCount + assessmentSyllabusStepCount;
  const completedSyllabusStepCount = completedModuleSyllabusStepCount + completedAssessmentSyllabusStepCount;
  const liveStageActive = currentFlowStage === "LIVE_AI_PREP" || currentFlowStage === "LIVE_AI_ASSESSMENT" || (showQuizModal && quizAssignment === "LIVE_AI");
  const assessmentLedger = [
    {
      key: "quiz" as const,
      label: `${resolvedQuizMode === "FREE_TEXT" ? "Free Text" : "Structured"} Quiz`,
      meta: resolvedQuizMode === "FREE_TEXT" ? "Semantic grading" : "Knowledge check",
      locked: !allGroupsCompleted,
      active: quizStageActive,
      done: quizStageDone,
    },
    ...(campaign.hasOnchainVerification
      ? [
          {
            key: "onchain" as const,
            label: "On-Chain Verification",
            meta: campaign.onchainConfig?.verificationMode === "signature" ? "Wallet signature" : "Transaction proof",
            locked: !onchainStageUnlocked,
            active: onchainStageActive,
            done: onchainStageDone,
          },
        ]
      : []),
    {
      key: "advocacy" as const,
      label: "Proof of Advocacy",
      meta: "Optional signal layer",
      locked: !advocacyStageUnlocked,
      active: advocacyStageActive,
      done: advocacyStageDone,
    },
    {
      key: "preflight" as const,
      label: "Pre-Flight",
      meta: "Session guidelines",
      locked: !liveStageUnlocked,
      active: livePreFlightActive,
      done: livePreFlightDone,
    },
    {
      key: "live" as const,
      label: "Live AI Assessment",
      meta: "Gemini Live session",
      locked: !liveStageUnlocked,
      active: liveAssessmentActive,
      done: liveAssessmentDone,
    },
    {
      key: "results" as const,
      label: "Results",
      meta: "Composite scorecard",
      locked: !certificateStageDone,
      active: certificateStageDone,
      done: certificateStageDone,
    },
  ];
  const syllabusAssessmentRows = [
    hasStructuredQuiz
      ? {
          key: "quiz" as const,
          label: "Course Assessment",
          tag: resolvedQuizMode === "FREE_TEXT" ? "Final · Free Text" : "Final · AI Quiz",
          locked: !allGroupsCompleted,
          active: quizStageActive,
          done: quizStageDone,
        }
      : null,
    campaign.hasOnchainVerification
      ? {
          key: "onchain" as const,
          label: "On-Chain Verification",
          tag: campaign.onchainConfig?.verificationMode === "signature" ? "Wallet Signature" : "Transaction Proof",
          locked: !onchainStageUnlocked,
          active: onchainStageActive,
          done: onchainStageDone,
        }
      : null,
    {
      key: "advocacy" as const,
      label: "Proof of Advocacy",
      tag: "Optional",
      locked: !advocacyStageUnlocked,
      active: advocacyStageActive,
      done: advocacyStageDone,
    },
    {
      key: "preflight" as const,
      label: "Pre-Flight",
      tag: "Security",
      locked: !liveStageUnlocked,
      active: livePreFlightActive,
      done: livePreFlightDone,
    },
    {
      key: "live" as const,
      label: "Agent Verification",
      tag: "Live Session",
      locked: !liveStageUnlocked,
      active: liveAssessmentActive,
      done: liveAssessmentDone,
    },
    {
      key: "results" as const,
      label: "Certificate",
      tag: "Complete",
      locked: !completedAt,
      active: Boolean(completedAt),
      done: certificateStageDone,
    },
  ].filter((entry): entry is {
    key: "quiz" | "onchain" | "advocacy" | "preflight" | "live" | "results";
    label: string;
    tag: string;
    locked: boolean;
    active: boolean;
    done: boolean;
  } => Boolean(entry));
  const showTheaterFooter = Boolean(
    enrolled &&
    !completedAt &&
    !showBeginVerification &&
    !assessmentHandoffStage &&
    !isEnded &&
    hasModules,
  );
  const theaterFooterStatus = progressError ?? (() => {
    if (!activeContent) {
      return "This grouped module has no playable content yet.";
    }
    if (hasNextItem) {
      if (canContinueToNextItem) {
        return "Current step complete — continue to the next item.";
      }
      if (activeContent.type === "video") {
        return "Remain on this verification step before continuing.";
      }
      if (activeContent.type === "quiz") {
        return "Answer the knowledge check correctly to unlock the next step.";
      }
      return "Complete this verification task to unlock the next step.";
    }
    if (canMarkComplete) {
      return "Grouped module complete — ready to continue to the next verification block.";
    }
    if (activeModule > nextUnlockedGroupIndex) {
      return "Complete previous grouped modules first.";
    }
    return "View every item in this grouped module and clear each quiz check.";
  })();
  const theaterFooterActionLabel = hasNextItem
    ? "Continue"
    : completing || progressSaving
    ? "Continuing..."
    : "Continue";
  const theaterFooterActionDisabled = hasNextItem
    ? !canContinueToNextItem
    : progressSaving || completing || !canMarkComplete;

  function resetLocalFlowProgress() {
    setHasStartedFlow(false);
    setActiveModule(0);
    setActiveModuleItem(0);
    setCompletedGroupIndexes([]);
    setViewedItems(new Set());
    setQuizCorrect(new Set());
    setQuizAnswers({});
    setVideoUnlockAtByItem({});
    setShowQuizModal(false);
    setQuizAssignment(null);
    setQuizMode(null);
    setAssessmentHandoffStage(null);
  }

  function restoreLocalFlowProgress(
    snapshot: CampaignFlowStateSnapshot,
    availableModules: ModuleGroup[],
    savedCompletedUntil: number,
  ) {
    const restoredCompletedGroupIndexes = snapshot.completedGroupIndexes.length > 0
      ? snapshot.completedGroupIndexes.filter((index) => index < availableModules.length)
      : buildSequentialCompletedGroupIndexes(savedCompletedUntil).filter(
          (index) => index < availableModules.length,
        );
    const nextModuleIndex = availableModules.length > 0
      ? Math.min(
          snapshot.hasStartedFlow
            ? snapshot.activeModuleIndex
            : Math.max(restoredCompletedGroupIndexes.at(-1) ?? -1, -1) + 1,
          availableModules.length - 1,
        )
      : 0;
    const nextItemCount = availableModules[nextModuleIndex]?.items.length ?? 0;
    const nextItemIndex = nextItemCount > 0
      ? Math.min(snapshot.activeItemIndex, nextItemCount - 1)
      : 0;

    setHasStartedFlow(snapshot.hasStartedFlow || restoredCompletedGroupIndexes.length > 0);
    setActiveModule(nextModuleIndex);
    setActiveModuleItem(nextItemIndex);
    setCompletedGroupIndexes(restoredCompletedGroupIndexes);
    setViewedItems(new Set(snapshot.viewedItemKeys));
    setQuizCorrect(new Set(snapshot.quizCorrectKeys));
    setQuizAnswers(snapshot.quizAnswers);
    setVideoUnlockAtByItem(snapshot.videoUnlockAtByItem);
    setQuizAssignment(
      snapshot.activeStage === "LIVE_AI_PREP" || snapshot.activeStage === "LIVE_AI_ASSESSMENT"
        ? "LIVE_AI"
        : snapshot.activeStage === "QUIZ_ASSESSMENT"
        ? "NORMAL_MCQ"
        : null,
    );
    setShowQuizModal(false);
    setAssessmentHandoffStage(
      snapshot.activeStage === "QUIZ_ASSESSMENT"
        ? "QUIZ_ASSESSMENT"
        : snapshot.activeStage === "ONCHAIN_VERIFICATION"
        ? "ONCHAIN_VERIFICATION"
        : snapshot.activeStage === "PROOF_OF_ADVOCACY"
        ? "PROOF_OF_ADVOCACY"
        : snapshot.activeStage === "LIVE_AI_PREP" || snapshot.activeStage === "LIVE_AI_ASSESSMENT"
        ? "LIVE_AI_PREP"
        : null,
    );
  }

  function deriveFlowStage(): CampaignFlowStage {
    if (completedAt) {
      return "RESULTS";
    }

    if (assessmentHandoffStage === "QUIZ_ASSESSMENT") {
      return "QUIZ_ASSESSMENT";
    }

    if (assessmentHandoffStage === "ONCHAIN_VERIFICATION") {
      return "ONCHAIN_VERIFICATION";
    }

    if (assessmentHandoffStage === "PROOF_OF_ADVOCACY") {
      return "PROOF_OF_ADVOCACY";
    }

    if (assessmentHandoffStage === "LIVE_AI_PREP") {
      return "LIVE_AI_PREP";
    }

    if (showQuizModal && quizAssignment === "NORMAL_MCQ") {
      return "QUIZ_ASSESSMENT";
    }

    if (showQuizModal && quizAssignment === "LIVE_AI") {
      return "LIVE_AI_ASSESSMENT";
    }

    if (!hasStartedFlow) {
      return "INTRO";
    }

    if (activeContent?.type === "video") {
      return "MODULE_VIDEO";
    }

    if (activeContent?.type === "quiz") {
      return "MODULE_QUIZ";
    }

    return "MODULE_TASK";
  }

  function buildFlowStateSnapshot(): CampaignFlowStateSnapshot {
    return {
      hasStartedFlow,
      activeStage: deriveFlowStage(),
      activeModuleIndex: activeModule,
      activeItemIndex: activeModuleItem,
      completedGroupIndexes,
      viewedItemKeys: Array.from(viewedItems).sort(),
      quizCorrectKeys: Array.from(quizCorrect).sort(),
      quizAnswers,
      videoUnlockAtByItem,
    };
  }

  async function persistCampaignFlowState() {
    if (!enrolled || !flowStateHydrated) {
      return;
    }

    try {
      await fetch(`/api/campaigns/${campaignId}/flow-state`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ state: buildFlowStateSnapshot() }),
      });
    } catch {
      // Background snapshot persistence should not block the main flow.
    }
  }

  function handleBeginVerification() {
    if (!enrolled || completedAt || modules.length === 0) {
      return;
    }

    const resumeModule = allGroupsCompleted
      ? Math.max(modules.length - 1, 0)
      : nextUnlockedGroupIndex;
    setActiveModule(resumeModule);
    setActiveModuleItem(0);
    setAssessmentHandoffStage(null);
    setHasStartedFlow(true);
  }

  async function syncAssessmentFlowState() {
    if (!enrolled) {
      return;
    }

    try {
      const assessmentRes = await fetch(`/api/campaigns/${campaignId}/quiz-assignment`, {
        headers: authHeaders(),
      });
      const assessmentBody = await assessmentRes.json().catch(() => null);

      if (!assessmentRes.ok) {
        throw new Error(assessmentBody?.error || "Failed to load campaign assessment state");
      }

      setQuizMode(assessmentBody.quizMode ?? null);

      if (!assessmentBody.quizCompleted) {
        if (completedAt) {
          setCompletedAt(null);
        }
        setQuizAssignment("NORMAL_MCQ");
        setAssessmentHandoffStage("QUIZ_ASSESSMENT");
        setShowQuizModal(false);
        return;
      }

      if (assessmentBody.onchainRequired && !assessmentBody.onchainCompleted) {
        if (completedAt) {
          setCompletedAt(null);
        }
        setQuizAssignment(null);
        setAssessmentHandoffStage("ONCHAIN_VERIFICATION");
        setShowQuizModal(false);
        return;
      }

      if (!assessmentBody.advocacyCompleted) {
        if (completedAt) {
          setCompletedAt(null);
        }
        setQuizAssignment(null);
        setAssessmentHandoffStage("PROOF_OF_ADVOCACY");
        setShowQuizModal(false);
        return;
      }

      if (!assessmentBody.liveAssessmentCompleted) {
        if (completedAt) {
          setCompletedAt(null);
        }
        setQuizAssignment("LIVE_AI");
        setAssessmentHandoffStage("LIVE_AI_PREP");
        setShowQuizModal(false);
        return;
      }

      setQuizAssignment(null);
      setAssessmentHandoffStage(null);
      setShowQuizModal(false);

      if (!completedAt) {
        await finalizeCampaignCompletion();
      }
    } catch (err) {
      setProgressError(
        err instanceof Error ? err.message : "Failed to continue into the assessment flow",
      );
    }
  }

  // Finalize campaign completion (called after quiz modal or as fallback)
  async function finalizeCampaignCompletion() {
    setCompleting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/complete`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Failed to complete campaign");
      }
      setEnrollmentScore(body?.participant?.score ?? enrollmentScore);
      applyParticipantScores(body?.participant);
      setCompletedAt(body?.participant?.completedAt ?? new Date().toISOString());
      setCompletedGroupIndexes(buildSequentialCompletedGroupIndexes(modules.length - 1));
      setCompletedUntil(Math.max(completedUntil, modules.length - 1));
      setQuizAssignment(null);
      setAssessmentHandoffStage(null);
      setHasStartedFlow(true);
      window.dispatchEvent(new Event("academy-campaign-state-changed"));

      // Show Genesis Rewards popup for NexID partner campaigns
      if (genesisRewardCampaign) {
        setShowGenesisRewards(true);
      }
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : "Failed to complete campaign");
    } finally {
      setCompleting(false);
    }
  }

  function handleStartAssessmentStage() {
    if (!quizAssignment) {
      return;
    }

    setAssessmentHandoffStage(null);
    setShowQuizModal(true);
  }

  function handleDismissAssessmentStage() {
    setShowQuizModal(false);
    if (quizAssignment === "LIVE_AI") {
      setAssessmentHandoffStage("LIVE_AI_PREP");
      return;
    }
    if (quizAssignment === "NORMAL_MCQ") {
      setAssessmentHandoffStage("QUIZ_ASSESSMENT");
    }
  }

  function handleContinueActiveItem() {
    if (!hasNextItem || !canContinueToNextItem) {
      return;
    }
    setActiveModuleItem((prev) => Math.min(prev + 1, activeItems.length - 1));
  }

  async function handleCompleteActiveModule() {
    if (progressSaving || completing || !canMarkComplete) {
      return;
    }

    setProgressError(null);
    setProgressSaving(true);

    const nextCompletedGroupIndexes = Array.from(
      new Set([...completedGroupIndexes, activeModule]),
    ).sort((a, b) => a - b);
    const attemptedCompletedUntil = Math.max(completedUntil, activeModule);
    let persistedCompletedUntil = attemptedCompletedUntil;

    try {
      const progressRes = await fetch(`/api/campaigns/${campaignId}/progress`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ moduleIndex: activeModule }),
      });
      const progressBody = await progressRes.json().catch(() => null);
      if (!progressRes.ok) {
        throw new Error(progressBody?.error || "Failed to save module progress");
      }
      if (Number.isInteger(progressBody?.completedUntil)) {
        persistedCompletedUntil = progressBody.completedUntil;
      }
      setCompletedGroupIndexes(nextCompletedGroupIndexes);
      setCompletedUntil(persistedCompletedUntil);
    } catch (err) {
      setProgressError(
        err instanceof Error ? err.message : "Failed to save module progress",
      );
      return;
    } finally {
      setProgressSaving(false);
    }

    const next = activeModule + 1;

    if (next < modules.length) {
      await speedTrapRef.current?.checkTrapsForGroup(activeModule);
    }

    if (next < modules.length && !isModuleLocked(modules[next])) {
      setActiveModule(next);
      setActiveModuleItem(0);
    }

    if (nextCompletedGroupIndexes.length >= modules.length) {
      await syncAssessmentFlowState();
    }
  }

  // Advance the assessment flow after each assessment stage completes.
  async function handleQuizComplete(_score: number | null) {
    setAssessmentHandoffStage(null);
    setShowQuizModal(false);
    await syncAssessmentFlowState();
  }

  async function handleLiveAssessmentComplete(_score: number | null) {
    setAssessmentHandoffStage(null);
    setShowQuizModal(false);
    await syncAssessmentFlowState();
  }

  // After onchain verification succeeds, refresh participant scores and advance to advocacy.
  async function handleOnchainVerified(score: number) {
    setParticipantScores((prev) => ({ ...prev, onchainScore: score }));
    await syncAssessmentFlowState();
  }

  // Mark advocacy step complete (submitted or skipped), then continue into live AI prep.
  async function handleAdvocacyComplete() {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/advocacy/complete`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Failed to continue past advocacy");
      }

      setAssessmentHandoffStage(null);
      setShowQuizModal(false);
      await syncAssessmentFlowState();
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : "Failed to continue past advocacy");
    }
  }

  // Handle genesis domain claimed
  function handleDomainClaimed(domain: string) {
    setDomainClaimed(domain);
  }

  function handleAssessmentLedgerSelect(stageKey: "quiz" | "onchain" | "advocacy" | "preflight" | "live" | "results") {
    if (stageKey === "quiz") {
      if (!allGroupsCompleted || completedAt) {
        return;
      }
      setSidebarTab("syllabus");
      setQuizAssignment("NORMAL_MCQ");
      setAssessmentHandoffStage("QUIZ_ASSESSMENT");
      setShowQuizModal(false);
      return;
    }

    if (stageKey === "onchain") {
      if (!onchainStageUnlocked || completedAt) {
        return;
      }
      setSidebarTab("syllabus");
      setQuizAssignment(null);
      setAssessmentHandoffStage("ONCHAIN_VERIFICATION");
      setShowQuizModal(false);
      return;
    }

    if (stageKey === "advocacy") {
      if (!advocacyStageUnlocked || completedAt) {
        return;
      }
      setSidebarTab("syllabus");
      setQuizAssignment(null);
      setAssessmentHandoffStage("PROOF_OF_ADVOCACY");
      setShowQuizModal(false);
      return;
    }

    if (stageKey === "preflight") {
      if (!liveStageUnlocked || completedAt) {
        return;
      }
      setSidebarTab("syllabus");
      setQuizAssignment("LIVE_AI");
      setAssessmentHandoffStage("LIVE_AI_PREP");
      setShowQuizModal(false);
      return;
    }

    if (stageKey === "live") {
      if (!liveStageUnlocked || completedAt) {
        return;
      }
      setSidebarTab("syllabus");
      setQuizAssignment("LIVE_AI");
      setAssessmentHandoffStage(null);
      setShowQuizModal(true);
      return;
    }

    if (stageKey === "results") {
      if (!completedAt) {
        return;
      }
      setSidebarTab("syllabus");
    }
  }

  function renderReferenceTheater() {
    const theaterUsesAutoHeight = !(
      !completedAt &&
      !isEnded &&
      hasModules &&
      enrolled &&
      !showBeginVerification &&
      !assessmentHandoffStage &&
      activeContent?.type === "video" &&
      activeContent.videoUrl
    );

    return (
      <div className="theater">
        <div className={`theater-aspect ${theaterUsesAutoHeight ? "theater-aspect-static" : ""}`}>
          {completedAt ? (
            <div className="stage st-results on">
              <div className="results-score-wrap">
                <div className="ey ey-green" style={{ marginBottom: 6 }}>Verified</div>
                <div className="results-score-big">{internalCoreCampaign ? "Complete" : resultsCompositeScore ?? "—"}</div>
                <div className="ey" style={{ marginTop: 3 }}>
                  {internalCoreCampaign ? (
                    "Identity layer updated"
                  ) : (
                    <>
                      Score out of 100
                      {participantScores.rank ? ` | Rank #${participantScores.rank}` : ""}
                    </>
                  )}
                </div>
              </div>

              <div className="score-breakdown">
                {resultBreakdown.map((row) => (
                  <div key={row.label} className="score-bd-row">
                    <span className="score-bd-label">{row.label}</span>
                    <span className={`score-bd-val ${row.tone}`}>
                      {row.value === null ? "N/A" : `${row.value}/100`}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="cert-box"
                style={
                  internalCoreCampaign
                    ? { background: "var(--green-d)", border: "1px solid rgba(30,194,106,.18)" }
                    : { background: "var(--gold-d)", border: "1px solid rgba(255,176,0,.18)" }
                }
              >
                <div className="ey" style={{ marginBottom: 5 }}>
                  {internalCoreCampaign ? "Badges Earned" : genesisRewardCampaign ? "Rewards Unlocked" : "Certificate Issued"}
                </div>
                <div style={{ fontFamily: "var(--dis)", fontWeight: 800, fontSize: 18 }}>
                  {internalCoreCampaign
                    ? "Verified Builder"
                    : genesisRewardCampaign
                    ? domainClaimed
                      ? `${domainClaimed}.id claimed`
                      : "Genesis rewards available"
                    : campaign.title}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--t2)", lineHeight: 1.7 }}>
                  {internalCoreCampaign
                    ? "Your academy verification has been sealed and reflected in your identity layer."
                    : genesisRewardCampaign
                    ? "Your completion unlocked Genesis points and, while supply remains, a reserved 5-character .id claim."
                    : `Your completion certificate is tied to ${campaign.sponsorName} and reflected in campaign rankings.`}
                </div>
                {genesisRewardCampaign && !domainClaimed ? (
                  <button
                    type="button"
                    onClick={() => setShowGenesisRewards(true)}
                    className="btn btn-gold btn-block"
                    style={{ marginTop: 12 }}
                  >
                    Open Reward Claim
                  </button>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                {!internalCoreCampaign ? (
                  <Link href="/leaderboard" className="btn btn-ghost btn-sm" style={{ flex: 1 }}>
                    Leaderboard
                  </Link>
                ) : null}
                <Link href="/" className="btn btn-gold btn-sm" style={{ flex: 1 }}>
                  Browse More
                </Link>
              </div>
            </div>
          ) : !isEnded ? (
            hasModules ? (
              !enrolled ? (
                <div className="stage st-intro on">
                  <div className="intro-ico">{sponsorGlyph}</div>
                  <div className="intro-copy">
                    <div className="ey ey-gold" style={{ marginBottom: 7 }}>Course</div>
                    <div className="intro-h">{campaign.title}</div>
                    <div className="intro-p">
                      {campaign.objective || "Enrollment creates your active campaign and unlocks the guided verification flow."}
                    </div>
                  </div>
                  <div className="intro-stats">
                    {introStageStats.map((stat) => (
                      <div key={stat.label} className="intro-stat">
                        <div className="intro-stat-v">{stat.value}</div>
                        <div className="intro-stat-l">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  {hasToken && isLive ? (
                    <button type="button" className="btn btn-gold" onClick={handleEnroll} disabled={enrolling}>
                      {enrolling ? "Enrolling..." : "Enroll"}
                    </button>
                  ) : !hasToken ? (
                    <div className="intro-note">Connect wallet to enroll and unlock verification.</div>
                  ) : (
                    <div className="intro-note">Enrollment opens when this campaign is live.</div>
                  )}
                  <div className="intro-note">
                    Complete all grouped modules to unlock quiz assessment, live AI, and your verified result.
                  </div>
                </div>
              ) : showBeginVerification ? (
                <div className="stage st-intro on">
                  <div className="intro-ico">{sponsorGlyph}</div>
                  <div className="intro-copy">
                    <div className="ey ey-gold" style={{ marginBottom: 7 }}>Active Campaign</div>
                    <div className="intro-h">Get Started</div>
                    <div className="intro-p">
                      Enrollment is complete. Start the verification flow to enter the learning theater, grouped-module checks, and the assessment ladder.
                    </div>
                  </div>
                  <div className="intro-stats">
                    {introStageStats.map((stat) => (
                      <div key={stat.label} className="intro-stat">
                        <div className="intro-stat-v">{stat.value}</div>
                        <div className="intro-stat-l">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn btn-gold" onClick={handleBeginVerification}>
                    Get Started
                  </button>
                  <div className="intro-note">
                    Continue only unlocks after the current verification requirement is satisfied.
                  </div>
                </div>
              ) : assessmentHandoffStage === "QUIZ_ASSESSMENT" ? (
                <div className="stage st-quiz on">
                  <div className="qz-hd">
                    <div className="qz-hd-left">
                      <div className="ey ey-gold">AI Semantic Grading</div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--t)" }}>Assessment</div>
                    </div>
                    <div className="qz-hd-right">
                      <div className="ey">Stage</div>
                      <div style={{ fontFamily: "var(--dis)", fontWeight: 800, fontSize: 18, color: "var(--t)" }}>1/2</div>
                    </div>
                  </div>
                  <div className="qz-body">
                    <div className="q-progress-dots">
                      <div className="q-dot cur" />
                      <div className="q-dot" />
                    </div>
                    <div className="q-text">
                      {resolvedQuizMode === "FREE_TEXT" ? "Free text semantic grading." : "Multiple choice knowledge check."} All grouped modules are complete. The structured quiz runs before live AI and uses the 5-question assessment pipeline configured for this campaign.
                    </div>
                    <div className="q-feedback ok">
                      Assessment order: grouped modules / structured quiz / mandatory live AI / results.
                    </div>
                  </div>
                  <div className="qz-ft">
                    <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--t4)" }}>
                      Grouped modules verified. Structured quiz must finish before the live stage unlocks.
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" onClick={handleStartAssessmentStage}>
                      Start Quiz Assessment
                    </button>
                  </div>
                </div>
              ) : assessmentHandoffStage === "ONCHAIN_VERIFICATION" ? (
                <OnchainVerificationCard
                  campaignId={campaign.id}
                  campaignSlug={campaign.slug}
                  verificationMode={campaign.onchainConfig?.verificationMode ?? "transaction"}
                  actionDescription={campaign.onchainConfig?.actionDescription ?? null}
                  chainLabel={detailChainLabel}
                  primaryChain={campaign.primaryChain}
                  chainIdOverride={campaign.onchainConfig?.chainId ?? null}
                  alreadyVerified={participantScores.onchainScore !== null}
                  onVerified={handleOnchainVerified}
                />
              ) : assessmentHandoffStage === "PROOF_OF_ADVOCACY" ? (
                <ProofOfAdvocacy
                  campaignId={campaign.id}
                  campaignTitle={campaign.title}
                  sponsorName={campaign.sponsorName}
                  onComplete={handleAdvocacyComplete}
                />
              ) : assessmentHandoffStage === "LIVE_AI_PREP" ? (
                <ImmersiveAgentSession
                  campaignId={campaign.id}
                  campaignTitle={campaign.title}
                  sponsorName={campaign.sponsorName}
                  onComplete={handleLiveAssessmentComplete}
                  onDismiss={handleDismissAssessmentStage}
                />
              ) : activeContent?.type === "video" && activeContent.videoUrl ? (
                <div
                  className="st-synth on"
                  onPointerDownCapture={() => ensureVideoGateStarted()}
                  onFocusCapture={() => ensureVideoGateStarted()}
                >
                  <div className="synth-frame">
                    <iframe
                      src={activeContent.videoUrl}
                      loading="lazy"
                      title={`Video player - ${activeContent.title}`}
                      allowFullScreen
                      allow="encrypted-media; fullscreen; microphone; screen-wake-lock;"
                    />
                  </div>
                  <div className="synth-bar">
                    <div className="synth-meta">
                      <div>
                        <div className="synth-tag">Verification</div>
                        <div className="synth-title-txt">{activeContent.title || activeModuleLabel}</div>
                      </div>
                      <div className="synth-dots">
                        <div className="sd" />
                        <div className="sd" />
                        <div className="sd" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : activeContent?.type === "quiz" ? (
                <div className="stage st-quiz on">
                  <div className="qz-hd">
                    <div className="qz-hd-left">
                      <div className="ey ey-gold">AI Semantic Grading</div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--t)" }}>{activeContent.title}</div>
                    </div>
                    <div className="qz-hd-right">
                      <div className="ey">Question</div>
                      <div style={{ fontFamily: "var(--dis)", fontWeight: 800, fontSize: 18, color: "var(--t)" }}>
                        {activeModuleItem + 1}/{activeItems.length || 0}
                      </div>
                    </div>
                  </div>
                  <div className="qz-body">
                    {activeItems.length > 1 ? (
                      <div className="q-progress-dots">
                        {activeItems.map((item, itemIndex) => {
                          const itemKey = `${activeModule}-${itemIndex}`;
                          const itemViewed = viewedItems.has(itemKey) || quizCorrect.has(itemKey);
                          const isCurrentItem = itemIndex === activeModuleItem;
                          return (
                            <div
                              key={`quiz-dot-${itemIndex}-${item.title}`}
                              className={`q-dot ${itemViewed ? "done" : isCurrentItem ? "cur" : ""}`}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                    {activeContent.question ? (
                      <div className="q-text">{activeContent.question}</div>
                    ) : null}
                    {activeContent.options && activeContent.options.length > 0 ? (
                      <div className="q-options">
                        {activeContent.options.map((option, optIdx) => {
                          const isSelected = activeSelectedAnswer === optIdx;
                          const showResult = activeQuizHasAnswered && isSelected;
                          const optionStateClass = showResult && activeQuizCorrect
                            ? "c"
                            : showResult && !activeQuizCorrect
                            ? "w"
                            : isSelected
                            ? "sel"
                            : "";
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              disabled={activeQuizCorrect}
                              onClick={() => {
                                const correct = activeContent.correctIndex === optIdx;
                                setQuizAnswers((prev) => ({ ...prev, [activeQuizKey]: optIdx }));
                                if (correct) {
                                  setQuizCorrect((prev) => {
                                    const next = new Set(prev);
                                    next.add(activeQuizKey);
                                    return next;
                                  });
                                  setViewedItems((prev) => {
                                    const next = new Set(prev);
                                    next.add(activeQuizKey);
                                    return next;
                                  });
                                }
                              }}
                              className={`q-opt ${optionStateClass} ${activeQuizCorrect ? "locked" : ""}`.trim()}
                            >
                              <span className="q-letter">{String.fromCharCode(65 + optIdx)}</span>
                              <span>{option}</span>
                            </button>
                          );
                        })}
                        {activeQuizHasAnswered && !activeQuizCorrect ? (
                          <div className="q-feedback bad">Incorrect answer. Review the question and try again.</div>
                        ) : null}
                        {activeQuizCorrect ? (
                          <div className="q-feedback ok">Correct answer locked in. Continue will unlock the next step in this grouped module.</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="qz-ft">
                    <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--t4)" }}>
                      {activeQuizCorrect
                        ? "Knowledge check cleared."
                        : activeQuizHasAnswered
                        ? "Incorrect answer detected. Try again to continue."
                        : "Select the correct answer to unlock the next step."}
                    </div>
                  </div>
                </div>
              ) : activeContent?.type === "task" ? (
                <div className="stage st-social on">
                  <div className="ey ey-gold" style={{ marginBottom: 4, flexShrink: 0 }}>Verification Task</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--t)", marginBottom: 8, flexShrink: 0 }}>
                    {activeContent.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.75, flexShrink: 0 }}>
                    {activeContent.description || "Complete the sponsor task, then return to continue the grouped module."}
                  </div>
                  {activeContent.actionUrl ? (
                    <a
                      href={activeContent.actionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-gold btn-block"
                    >
                      {activeContent.actionLabel || "Open Task"}
                    </a>
                  ) : null}
                </div>
              ) : (
                <div className="stage st-intro on">
                  <div className="intro-ico">{sponsorGlyph}</div>
                  <div className="intro-copy">
                    <div className="ey ey-gold" style={{ marginBottom: 7 }}>Campaign</div>
                    <div className="intro-h">{campaign.title}</div>
                    <div className="intro-p">This grouped module has no playable content yet.</div>
                  </div>
                </div>
              )
            ) : (
              <div className="stage st-intro on">
                <div className="intro-ico">{sponsorGlyph}</div>
                <div className="intro-copy">
                  <div className="ey ey-gold" style={{ marginBottom: 7 }}>Campaign</div>
                  <div className="intro-h">{campaign.title}</div>
                  <div className="intro-p">Modules have not been configured yet.</div>
                </div>
              </div>
            )
          ) : (
            <div className="stage st-intro on">
              <div className="intro-ico">{sponsorGlyph}</div>
              <div className="intro-copy">
                <div className="ey ey-gold" style={{ marginBottom: 7 }}>Campaign Closed</div>
                <div className="intro-h">{campaign.title}</div>
                <div className="intro-p">Your score has been aggregated. Review sponsor reward rules or browse a live campaign.</div>
              </div>
            </div>
          )}
        </div>

        {showTheaterFooter ? (
          <div className="theater-foot" style={{ display: "flex" }}>
            <div style={{ fontSize: 11, color: progressError ? "var(--red)" : "var(--t3)" }}>
              {theaterFooterStatus}
            </div>
            {activeItems.length > 0 ? (
              <button
                type="button"
                disabled={theaterFooterActionDisabled}
                onClick={hasNextItem ? handleContinueActiveItem : handleCompleteActiveModule}
                className="btn btn-gold btn-sm"
              >
                {theaterFooterActionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
    <section className="academy-ref-page w-full">
      {/* Back */}
      <div className="back-row">
        <button onClick={() => window.history.back()} className="back-btn">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Courses
        </button>
      </div>
      <div className="det-layout">
        <div>
          {renderReferenceTheater()}
          {false ? (
          <div className="premium-panel overflow-hidden border border-[#1a1a1a] flex flex-col relative bg-[#050505] min-h-[360px] lg:h-[600px]">
            <div className="relative z-10 border-b border-[#1a1a1a] bg-[#0a0a0a]/95 px-5 py-4 backdrop-blur">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-nexid-gold">
                    {stageHeader.eyebrow}
                  </div>
                  <h2 className="mt-2 font-display text-2xl text-white md:text-3xl">{stageHeader.title}</h2>
                  <p className="mt-2 max-w-2xl text-xs leading-relaxed text-nexid-muted">
                    {stageHeader.summary}
                  </p>
                </div>
                <div className="w-full rounded-2xl border border-[#1f1f1f] bg-black/40 p-4 md:w-[240px]">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-nexid-muted">
                        {stageHeader.metricLabel}
                      </div>
                      <div className="mt-1 font-display text-2xl text-white">{stageHeader.metricValue}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-nexid-muted">
                        Progress
                      </div>
                      <div className="mt-1 text-sm font-semibold text-nexid-gold">
                        {completedAt ? "100%" : `${theaterProgressPercent}%`}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-nexid-gold via-[#ffe27a] to-[#fff0b6] transition-all duration-500"
                      style={{ width: `${completedAt ? 100 : theaterProgressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            {completedAt ? (
              <div className="relative flex flex-1 flex-col overflow-y-auto bg-[#050505]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,176,0,0.16),transparent_48%),radial-gradient(circle_at_bottom_right,rgba(100,92,255,0.12),transparent_38%)]" />
                <div className="relative z-10 flex flex-1 flex-col gap-4 p-6 md:p-8">
                  <div className="rounded-2xl border border-[#2a2210] bg-[#0d0b06]/90 px-6 py-7 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">
                      Verified
                    </div>
                    <div className="mt-3 font-display text-6xl leading-none text-nexid-gold md:text-7xl">
                      {resultsCompositeScore ?? "—"}
                    </div>
                    <div className="mt-2 text-xs text-nexid-muted">
                      Score out of 100
                      {participantScores.rank ? ` | Rank #${participantScores.rank}` : ""}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-[#1f1f1f] bg-[#0b0b0b]/90 p-5">
                      <div className="mb-4 text-[10px] font-mono uppercase tracking-[0.3em] text-nexid-muted">
                        Score Breakdown
                      </div>
                      <div className="space-y-3">
                        {resultBreakdown.map((row) => (
                          <div key={row.label} className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
                            <span className="text-xs text-nexid-muted">{row.label}</span>
                            <span className={`font-display text-lg ${row.tone}`}>
                              {row.value === null ? "N/A" : `${row.value}/100`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={`rounded-2xl border p-5 ${
                      internalCoreCampaign
                        ? "border-emerald-500/25 bg-emerald-500/10"
                        : "border-[#2a2210] bg-[#120f07]/90"
                    }`}>
                      <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-nexid-muted">
                        {internalCoreCampaign ? "Badges Earned" : genesisRewardCampaign ? "Rewards Unlocked" : "Certificate Issued"}
                      </div>
                      <div className={`mt-4 font-display text-2xl ${
                        internalCoreCampaign ? "text-emerald-300" : "text-nexid-gold"
                      }`}>
                        {internalCoreCampaign
                          ? "Verified Builder"
                          : genesisRewardCampaign
                          ? domainClaimed
                            ? `${domainClaimed}.id claimed`
                            : "Genesis rewards available"
                          : campaign.title}
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-nexid-muted">
                        {internalCoreCampaign
                          ? "Your academy verification has been sealed and reflected in your identity layer."
                          : genesisRewardCampaign
                          ? "Your completion unlocked Genesis points and, while supply remains, a reserved 5-character .id claim."
                          : `Your completion certificate is tied to ${campaign.sponsorName} and reflected in campaign rankings.`}
                      </p>
                      {genesisRewardCampaign ? (
                        domainClaimed ? (
                          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
                            Domain claimed: {domainClaimed}.id
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowGenesisRewards(true)}
                            className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#FFB000] to-[#FFD700] px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-black transition-all hover:shadow-[0_0_24px_rgba(255,176,0,0.24)]"
                          >
                            Open Reward Claim
                          </button>
                        )
                      ) : null}
                      {!genesisRewardCampaign && !internalCoreCampaign ? (
                        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-nexid-muted">
                          Sponsor reward pool: ${formatUsdc(campaign.prizePoolUsdc)} USDC
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-auto flex flex-col gap-3 sm:flex-row">
                    {!internalCoreCampaign ? (
                      <Link
                        href="/leaderboard"
                        className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                      >
                        Leaderboard
                      </Link>
                    ) : null}
                    <Link
                      href="/"
                      className="flex-1 rounded-xl bg-nexid-gold px-5 py-3 text-center text-sm font-bold text-black transition-all hover:shadow-gold-glow"
                    >
                      Browse More
                    </Link>
                  </div>
                </div>
              </div>
            ) : !isEnded ? (
              <div className="relative flex-1 bg-black">
                <img
                  src={campaignImage}
                  alt={campaign.title}
                  className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-luminosity"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />

                {hasModules ? (
                  !enrolled ? (
                    <div className="relative z-10 flex h-full items-center justify-center p-6 md:p-8">
                      <div className="flex w-full max-w-[380px] flex-col items-center gap-4 rounded-[24px] border border-white/10 bg-[#090909]/94 px-6 py-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.46)]">
                        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[11px] border border-white/10 bg-white/[0.03] font-mono text-base font-semibold text-white">
                          {sponsorGlyph}
                        </div>
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-nexid-gold">
                            Course
                          </div>
                          <h3 className="mt-2 font-display text-2xl leading-tight text-white">{campaign.title}</h3>
                          <p className="mt-3 text-sm leading-relaxed text-nexid-muted">
                            {campaign.objective || "Enrollment creates your active campaign and unlocks the guided verification flow."}
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                          {introStageStats.map((stat) => (
                            <div key={stat.label} className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5 text-center">
                              <div className="font-display text-base text-nexid-gold">{stat.value}</div>
                              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-nexid-muted">
                                {stat.label}
                              </div>
                            </div>
                          ))}
                        </div>
                        {hasToken && isLive ? (
                          <button
                            type="button"
                            onClick={handleEnroll}
                            disabled={enrolling}
                            className="mt-1 rounded-xl bg-nexid-gold px-7 py-3 text-sm font-bold text-black transition-all hover:shadow-gold-glow disabled:opacity-60"
                          >
                            {enrolling ? "Enrolling..." : "Enroll"}
                          </button>
                        ) : !hasToken ? (
                          <div className="mt-1 rounded-xl border border-[#222] bg-black/50 px-5 py-3 text-xs text-nexid-muted">
                            Connect wallet to enroll and unlock verification.
                          </div>
                        ) : (
                          <div className="mt-1 rounded-xl border border-[#222] bg-black/50 px-5 py-3 text-xs text-nexid-muted">
                            Enrollment opens when this campaign is live.
                          </div>
                        )}
                        <div className="max-w-[280px] text-[11px] leading-relaxed text-nexid-muted">
                          Complete all grouped modules to unlock quiz assessment, live AI, and your verified result.
                        </div>
                      </div>
                    </div>
                  ) : showBeginVerification ? (
                    <div className="relative z-10 flex h-full items-center justify-center p-6 md:p-8">
                      <div className="flex w-full max-w-[380px] flex-col items-center gap-4 rounded-[24px] border border-white/10 bg-[#090909]/94 px-6 py-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.46)]">
                        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[11px] border border-white/10 bg-white/[0.03] font-mono text-base font-semibold text-white">
                          {sponsorGlyph}
                        </div>
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-nexid-gold">
                            Active Campaign
                          </div>
                          <h3 className="mt-2 font-display text-2xl leading-tight text-white">Get Started</h3>
                          <p className="mt-3 text-sm leading-relaxed text-nexid-muted">
                            Enrollment is complete. Start the verification flow to enter the learning theater,
                            trigger grouped-module checks, and unlock the assessment ladder in order.
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                          {introStageStats.map((stat) => (
                            <div key={stat.label} className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5 text-center">
                              <div className="font-display text-base text-nexid-gold">{stat.value}</div>
                              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-nexid-muted">
                                {stat.label}
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={handleBeginVerification}
                          className="mt-1 rounded-xl bg-nexid-gold px-7 py-3 text-sm font-bold text-black transition-all hover:shadow-gold-glow"
                        >
                          Get Started
                        </button>
                        <div className="max-w-[280px] text-[11px] leading-relaxed text-nexid-muted">
                          Continue only unlocks after the current verification requirement is satisfied.
                        </div>
                      </div>
                    </div>
                  ) : assessmentHandoffStage ? (
                    assessmentHandoffStage === "QUIZ_ASSESSMENT" ? (
                      <div className="relative z-10 flex h-full flex-col justify-center p-6 md:p-8">
                        <div className="mx-auto flex w-full max-w-[760px] flex-col rounded-[24px] border border-white/10 bg-[#090909]/95 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5">
                            <div>
                              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-nexid-gold">
                                AI Semantic Grading
                              </div>
                              <div className="mt-1 text-sm font-semibold text-white">Course Assessment</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-nexid-muted">
                                Stage
                              </div>
                              <div className="mt-1 font-display text-2xl text-white">1/2</div>
                            </div>
                          </div>
                          <div className="px-5 py-6">
                            <div className="flex gap-1.5">
                              <div className="h-1.5 flex-1 rounded-full bg-nexid-gold" />
                              <div className="h-1.5 flex-1 rounded-full bg-white/10" />
                            </div>
                            <div className="mt-6 rounded-2xl border border-white/8 bg-black/30 p-5 text-left">
                              <div className="text-sm font-semibold text-white">
                                {resolvedQuizMode === "FREE_TEXT" ? "Free text semantic grading" : "Multiple choice knowledge check"}
                              </div>
                              <p className="mt-3 text-sm leading-relaxed text-nexid-muted">
                                All grouped modules are complete. The structured quiz runs before live AI and uses the
                                5-question assessment pipeline configured for this campaign.
                              </p>
                              <div className="mt-4 rounded-xl border border-white/8 bg-black/30 px-4 py-3 text-xs text-nexid-muted">
                                Assessment order: grouped modules / structured quiz / mandatory live AI / results.
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
                            <div className="text-[11px] text-nexid-muted">
                              Grouped modules verified. Structured quiz must finish before the live stage unlocks.
                            </div>
                            <button
                              type="button"
                              onClick={handleStartAssessmentStage}
                              className="rounded-xl border border-nexid-gold/40 bg-nexid-gold/10 px-5 py-2.5 text-sm font-bold uppercase tracking-[0.2em] text-nexid-gold transition-all hover:bg-nexid-gold hover:text-black hover:shadow-gold-glow"
                            >
                              Start Quiz Assessment
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative z-10 flex h-full flex-col justify-center p-6 md:p-8">
                        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center rounded-[24px] border border-white/10 bg-[#090909]/95 px-6 py-8 text-center shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                          <div className="font-display text-3xl text-white md:text-4xl">Live Session Guidelines</div>
                          <p className="mt-4 max-w-[520px] text-sm leading-relaxed text-nexid-muted">
                            The final proof of cognition requires a live, unstructured Gemini session. Make sure you are
                            in a quiet environment before you begin.
                          </p>
                          <div className="mt-6 w-full max-w-[520px] rounded-[22px] border border-white/8 bg-black/30 px-5 py-5">
                            <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-nexid-muted">
                              Microphone Readiness
                            </div>
                            <div className="mt-4 flex items-end justify-center gap-1.5">
                              {[18, 30, 42, 56, 42, 30, 18].map((height, index) => (
                                <span
                                  key={`mic-bar-${height}-${index}`}
                                  className="w-2 rounded-full bg-nexid-gold/70"
                                  style={{ height }}
                                />
                              ))}
                            </div>
                            <div className="mt-4 space-y-2 text-left">
                              {livePrepGuidelines.map((guideline) => (
                                <div key={guideline} className="rounded-xl border border-white/6 bg-black/25 px-4 py-3 text-xs text-nexid-muted">
                                  {guideline}
                                </div>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleStartAssessmentStage}
                            className="mt-8 rounded-xl bg-nexid-gold px-8 py-3 text-sm font-bold uppercase tracking-[0.2em] text-black transition-all hover:shadow-gold-glow"
                          >
                            Speak With Live Agent
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                  <div className="relative z-10 flex h-full flex-col">
                    <div className="relative w-full overflow-hidden bg-black aspect-video lg:flex-1">
                      {activeContent?.type === "video" && activeContent?.videoUrl ? (
                        <div
                          className="absolute inset-0"
                          onPointerDownCapture={() => ensureVideoGateStarted()}
                          onFocusCapture={() => ensureVideoGateStarted()}
                        >
                          <iframe
                            src={activeContent.videoUrl}
                            loading="lazy"
                            title={`Video player - ${activeContent.title}`}
                            allowFullScreen
                            allow="encrypted-media; fullscreen; microphone; screen-wake-lock;"
                            className="absolute inset-0 h-full w-full border-0"
                          />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 border-t border-white/10 bg-gradient-to-t from-black/95 to-black/60 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-nexid-gold/70">
                                  Verification
                                </div>
                                <div className="truncate text-sm font-semibold text-white">
                                  {activeContent.title || activeModuleLabel}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-nexid-gold/90 animate-pulse" />
                                <span className="h-1.5 w-1.5 rounded-full bg-nexid-gold/60 animate-pulse [animation-delay:150ms]" />
                                <span className="h-1.5 w-1.5 rounded-full bg-nexid-gold/35 animate-pulse [animation-delay:300ms]" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : activeContent?.type === "task" ? (
                        <div className="absolute inset-0 flex items-center justify-center p-6 md:p-8">
                          <div className="w-full max-w-[620px] rounded-[24px] border border-white/10 bg-[#0a0a0a]/94 px-6 py-7 text-center shadow-[0_18px_50px_rgba(0,0,0,0.38)]">
                            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-nexid-gold">
                              Verification Task
                            </div>
                            <h3 className="mt-3 font-display text-3xl text-white">{activeContent.title}</h3>
                            {activeContent.description ? (
                              <p className="mx-auto mt-4 max-w-[480px] text-sm leading-relaxed text-nexid-muted">
                                {activeContent.description}
                              </p>
                            ) : null}
                            <div className="mx-auto mt-5 max-w-[420px] rounded-xl border border-white/8 bg-black/35 px-4 py-3 text-xs leading-relaxed text-nexid-muted">
                              Complete the sponsor task, then return here to continue the grouped module.
                            </div>
                            {activeContent.actionUrl ? (
                              <a
                                href={activeContent.actionUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-6 inline-flex rounded-xl bg-nexid-gold px-6 py-3 text-sm font-bold text-black transition-all hover:shadow-gold-glow"
                              >
                                {activeContent.actionLabel || "Open Task"}
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ) : activeContent?.type === "quiz" ? (
                        <div className="absolute inset-0 flex flex-col bg-[#090909]/96">
                          <div className="border-b border-white/10 bg-[#0b0b0b] px-5 py-4">
                            <div className="flex items-start justify-between gap-4 text-left">
                              <div>
                                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-nexid-gold">
                                  AI Semantic Grading
                                </div>
                                <h3 className="mt-1 text-sm font-semibold text-white">{activeContent.title}</h3>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-nexid-muted">
                                  Question
                                </div>
                                <div className="mt-1 font-display text-xl text-white">
                                  {activeModuleItem + 1}/{activeItems.length || 0}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
                            {activeItems.length > 1 ? (
                              <div className="mb-5 flex gap-1.5">
                                {activeItems.map((item, itemIndex) => {
                                  const itemKey = `${activeModule}-${itemIndex}`;
                                  const itemViewed = viewedItems.has(itemKey) || quizCorrect.has(itemKey);
                                  const isCurrentItem = itemIndex === activeModuleItem;
                                  return (
                                    <div
                                      key={`quiz-dot-${itemIndex}-${item.title}`}
                                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                                        itemViewed
                                          ? "bg-emerald-400"
                                          : isCurrentItem
                                          ? "bg-nexid-gold"
                                          : "bg-white/10"
                                      }`}
                                    />
                                  );
                                })}
                              </div>
                            ) : null}
                            {activeContent.question ? (
                              <p className="mb-5 text-sm font-medium leading-relaxed text-white/90">{activeContent.question}</p>
                            ) : null}
                            {activeContent.options?.length ? (
                              <div className="space-y-2 text-left">
                                {activeContent.options!.map((option, optIdx) => {
                                  const isSelected = activeSelectedAnswer === optIdx;
                                  const showResult = activeQuizHasAnswered && isSelected;
                                  return (
                                    <button
                                      key={optIdx}
                                      type="button"
                                      disabled={activeQuizCorrect}
                                      onClick={() => {
                                        const correct = activeContent.correctIndex === optIdx;
                                        setQuizAnswers((prev) => ({ ...prev, [activeQuizKey]: optIdx }));
                                        if (correct) {
                                          setQuizCorrect((prev) => {
                                            const next = new Set(prev);
                                            next.add(activeQuizKey);
                                            return next;
                                          });
                                          setViewedItems((prev) => {
                                            const next = new Set(prev);
                                            next.add(activeQuizKey);
                                            return next;
                                          });
                                        }
                                      }}
                                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                                        showResult && activeQuizCorrect
                                          ? "border-green-500/60 bg-green-500/12 text-green-300"
                                          : showResult && !activeQuizCorrect
                                          ? "border-red-500/60 bg-red-500/12 text-red-300"
                                          : isSelected
                                          ? "border-nexid-gold/60 bg-nexid-gold/10 text-nexid-gold"
                                          : "border-white/10 bg-white/[0.02] text-white/80 hover:border-white/20 hover:bg-white/[0.04]"
                                      } ${activeQuizCorrect ? "cursor-default" : ""}`}
                                    >
                                      <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border text-[9px] font-mono ${
                                        showResult && activeQuizCorrect
                                          ? "border-green-400 bg-green-400 text-black"
                                          : showResult && !activeQuizCorrect
                                          ? "border-red-400 bg-red-400 text-white"
                                          : isSelected
                                          ? "border-nexid-gold bg-nexid-gold text-black"
                                          : "border-white/10 bg-white/[0.03] text-nexid-muted"
                                      }`}>
                                        {String.fromCharCode(65 + optIdx)}
                                      </span>
                                      <span>{option}</span>
                                    </button>
                                  );
                                })}
                                {activeQuizHasAnswered && !activeQuizCorrect ? (
                                  <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-300">
                                    Incorrect answer. Review the question and try again.
                                  </div>
                                ) : null}
                                {activeQuizCorrect ? (
                                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-300">
                                    Correct answer locked in. Continue will unlock the next step in this grouped module.
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="rounded-xl border border-white/8 bg-black/35 px-4 py-3 text-sm text-nexid-muted">
                                This knowledge check has no configured answers yet.
                              </div>
                            )}
                          </div>
                          <div className="border-t border-white/10 bg-[#0b0b0b] px-5 py-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div className="text-[11px] text-nexid-muted">
                                {activeQuizCorrect
                                  ? "Knowledge check cleared."
                                  : activeQuizHasAnswered
                                  ? "Incorrect answer detected. Try again to continue."
                                  : "Select the correct answer to unlock the next step."}
                              </div>
                              <div className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] ${
                                activeQuizCorrect
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-white/10 bg-white/[0.03] text-nexid-muted"
                              }`}>
                                {activeQuizCorrect ? "Cleared" : "Pending"}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
                          <p className="text-sm text-nexid-muted">This module has no playable content yet.</p>
                        </div>
                      )}
                    </div>

                    <div className="bg-[#090909] px-5 py-4">
                      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-nexid-gold">
                            Grouped Module {activeModule + 1}
                          </div>
                          <h3 className="mt-2 font-display text-2xl text-white">{activeModuleLabel}</h3>
                          {activeContent ? (
                            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-nexid-muted">
                              {activeStageSummary}
                            </p>
                          ) : null}
                          {activeItems.length > 1 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {activeItems.map((item, itemIndex) => {
                                const itemKey = `${activeModule}-${itemIndex}`;
                                const itemViewed = viewedItems.has(itemKey) || quizCorrect.has(itemKey);
                                const canOpenItem = itemViewed || itemIndex <= activeModuleItem;
                                return (
                                  <button
                                    key={`${activeModule}-${itemIndex}-${item.title}`}
                                    type="button"
                                    disabled={!canOpenItem}
                                    onClick={() => {
                                      if (canOpenItem) {
                                        setActiveModuleItem(itemIndex);
                                        ensureVideoGateStarted(activeModule, itemIndex);
                                      }
                                    }}
                                    className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide ${
                                      itemIndex === activeModuleItem
                                        ? "border-nexid-gold/60 bg-nexid-gold/15 text-nexid-gold"
                                        : itemViewed
                                        ? "border-green-500/30 bg-green-500/10 text-green-400"
                                        : canOpenItem
                                        ? "border-white/10 bg-black/40 text-nexid-muted hover:text-white"
                                        : "border-white/5 bg-black/20 text-nexid-muted/40"
                                    }`}
                                  >
                                    {itemViewed ? "\u2713 " : ""}{String(itemIndex + 1).padStart(2, "0")} / {item.title || item.type}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>

                        {enrolled && !completedAt ? (
                          <div className="w-full md:max-w-[300px]">
                            <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-nexid-muted">
                                    {activeStageLabel}
                                  </div>
                                  <div className="mt-1 text-sm font-semibold text-white">
                                    {hasNextItem
                                      ? `Step ${activeModuleItem + 1} of ${activeItems.length}`
                                      : `Final step in module ${activeModule + 1}`}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-nexid-muted">
                                    Status
                                  </div>
                                  <div className="mt-1 text-sm font-semibold text-white">
                                    {currentFlowStage === "MODULE_VIDEO"
                                      ? activeItemCompleted
                                        ? "Cleared"
                                        : "Verifying"
                                      : activeItemCompleted
                                      ? "Cleared"
                                      : "In progress"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : enrolled && completedAt ? (
                          <div className="rounded border border-green-500/30 bg-green-500/10 px-4 py-2 text-xs text-green-400">
                            Completed {formatDate(completedAt) ?? ""}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  )
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-nexid-gold">Campaign</div>
                      <h3 className="font-display text-2xl text-white">{campaign.title}</h3>
                      <p className="mt-2 text-sm text-nexid-muted">Modules have not been configured yet.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-12 text-center border-t-4 border-nexid-gold bg-black">
                {internalCoreCampaign ? (
                  <>
                    <div className="w-24 h-24 rounded-2xl rotate-45 border-2 border-green-500/40 bg-green-500/10 flex items-center justify-center mb-10">
                      <svg className="w-10 h-10 text-green-400 -rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h3 className="font-display text-3xl text-white mb-2">Campaign Complete</h3>
                    <p className="text-sm text-nexid-muted mb-8 max-w-sm">You have completed this campaign. Your knowledge has been verified.</p>
                  </>
                ) : (
                  <>
                    <div className="w-24 h-24 rounded-2xl rotate-45 border-2 border-nexid-gold/40 bg-nexid-gold/10 flex items-center justify-center mb-10 shadow-gold-glow">
                      <svg className="w-10 h-10 text-nexid-gold -rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h3 className="font-display text-3xl text-white mb-2">Campaign Concluded</h3>
                    <p className="text-sm text-nexid-muted mb-8 max-w-sm">Your score has been aggregated. Review your reward eligibility below.</p>
                    <button
                      type="button"
                      className="cursor-not-allowed rounded-xl border border-[#222] bg-[#111] px-8 py-4 text-sm font-bold text-nexid-muted uppercase tracking-widest"
                    >
                      Claim Window Managed By Sponsor
                    </button>
                  </>
                )}
              </div>
            )}
            {showTheaterFooter ? (
              <div className="border-t border-[#1a1a1a] bg-[#111] px-5 py-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className={`text-[11px] ${progressError ? "text-red-400" : "text-nexid-muted"}`}>
                    {theaterFooterStatus}
                  </div>
                  {activeItems.length > 0 ? (
                    <button
                      type="button"
                      disabled={theaterFooterActionDisabled}
                      onClick={hasNextItem ? handleContinueActiveItem : handleCompleteActiveModule}
                      className="w-full rounded-xl bg-nexid-gold px-5 py-2.5 text-sm font-bold text-black transition-all hover:shadow-gold-glow disabled:opacity-60 md:w-auto"
                    >
                      {theaterFooterActionLabel}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          ) : null}

        </div>

        {/* Sidebar */}
        <div>
          {false ? (
            <div className="space-y-4">
                <div className="overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,176,0,0.14),rgba(255,176,0,0.03))] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                  <div className="flex items-start justify-between gap-3 border-b border-white/8 px-4 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-sm font-black text-nexid-gold">
                        {sponsorGlyph}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.28em] text-nexid-muted">Active Campaign</div>
                        <div className="mt-1 truncate text-sm font-semibold text-white">{campaign.title}</div>
                        <div className="mt-1 text-[11px] text-nexid-muted">
                          {campaign.sponsorName || "NexID"} / {rewardTypeLabel} reward rail
                        </div>
                      </div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75">
                      {completedAt
                        ? "Results"
                        : assessmentHandoffStage
                        ? "Assess"
                        : showBeginVerification
                        ? "Ready"
                        : hasStartedFlow
                        ? "Active"
                        : "Queued"}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 px-4 py-3">
                    <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-nexid-muted">Modules</div>
                      <div className="mt-1 text-lg font-semibold text-white">{completedGroupCount}/{modules.length || 0}</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-nexid-muted">Prize Pool</div>
                      <div className="mt-1 text-lg font-semibold text-white">{formatUsdc(campaign.prizePoolUsdc)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-nexid-muted">Participants</div>
                      <div className="mt-1 text-lg font-semibold text-white">{participantCountMetric}</div>
                    </div>
                  </div>
                </div>

                <div className="mult-card">
                  <div className="ey" style={{ marginBottom: 10 }}>Your Multipliers</div>
                  {multiplierLoading ? (
                    <div className="mult-row">
                      <span className="mult-k">Loading multiplier state</span>
                      <span className="mult-v">...</span>
                    </div>
                  ) : multiplierRows.length > 0 ? (
                    multiplierRows.map((row) => (
                      <div key={row.key} className="mult-row">
                        <span className="mult-k">{row.label ?? row.fallback}</span>
                        <span className="mult-v">+{row.value.toFixed(2)}x</span>
                      </div>
                    ))
                  ) : (
                    <div className="mult-row">
                      <span className="mult-k">{authToken ? "No multipliers unlocked yet" : "Connect wallet to resolve multiplier"}</span>
                      <span className="mult-v">+1.00x</span>
                    </div>
                  )}
                  <div className="mult-total-row">
                    <span style={{ fontSize: 11, color: "var(--t3)" }}>Total</span>
                    <span className="mult-total-v">{multiplierTotal.toFixed(2)}x</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-nexid-muted">Grouped Modules</div>
                      <div className="mt-1 text-sm font-semibold text-white">Sequential verification ledger</div>
                    </div>
                    <div className="rounded-full border border-white/8 bg-[#0f0f0f] px-2.5 py-1 text-[10px] font-semibold text-nexid-muted">
                      {completedGroupCount}/{modules.length || 0} complete
                    </div>
                  </div>

                  {isEnded ? (
                    <div className="rounded-[22px] border border-white/8 bg-[#0d0d0d] px-4 py-3 text-sm text-nexid-muted">
                      Campaign ended. Modules are locked and the result rail is read-only.
                    </div>
                  ) : hasModules ? (
                    modules.map((mod, idx) => {
                      const isCompleted = completedGroupIndexSet.has(idx);
                      const isActive = idx === activeModule;
                      const isLocked = isModuleLocked(mod) || (!completedAt && idx > nextUnlockedGroupIndex);
                      const canOpenModule = !isLocked && canBrowseModules;
                      const typeSummary = Array.from(new Set(mod.items.map((item) => item.type))).join(" / ");
                      const speedTrapCount = mod.speedTrapQuestionIds?.length ?? 0;

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={!canOpenModule}
                          className={`w-full rounded-[22px] border px-4 py-4 text-left transition-all ${
                            isCompleted
                              ? "border-emerald-400/25 bg-emerald-500/10"
                              : isActive
                              ? "border-nexid-gold/35 bg-nexid-gold/10 shadow-[0_16px_40px_rgba(255,176,0,0.08)]"
                              : isLocked
                              ? "border-white/6 bg-[#0b0b0b] opacity-75"
                              : "border-white/8 bg-[#0f0f0f] hover:border-white/15 hover:bg-[#131313]"
                          } ${canOpenModule ? "cursor-pointer" : "cursor-not-allowed"}`}
                          onClick={() => {
                            if (canOpenModule) {
                              setActiveModule(idx);
                              setActiveModuleItem(0);
                              ensureVideoGateStarted(idx, 0);
                            }
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                              isCompleted
                                ? "border-emerald-400/30 bg-emerald-500/12"
                                : isActive
                                ? "border-nexid-gold/40 bg-black/25"
                                : "border-white/8 bg-black/25"
                            }`}>
                              {isCompleted ? (
                                <svg className="h-4 w-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              ) : isActive ? (
                                <span className="h-3 w-3 rounded-full bg-nexid-gold shadow-[0_0_16px_rgba(255,176,0,0.6)] pulse-gold" />
                              ) : isLocked ? (
                                <svg className="h-4 w-4 text-[#666]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                              ) : (
                                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-nexid-muted">
                                  {String(idx + 1).padStart(2, "0")} / {typeSummary || "module"} / {mod.items.length} item{mod.items.length === 1 ? "" : "s"}
                                </div>
                                {speedTrapCount > 0 ? (
                                  <div className="rounded-full border border-nexid-gold/20 bg-nexid-gold/10 px-2 py-0.5 text-[10px] font-semibold text-nexid-gold">
                                    {speedTrapCount} speed trap{speedTrapCount === 1 ? "" : "s"}
                                  </div>
                                ) : null}
                              </div>
                              <div className="mt-1 text-sm font-semibold text-white">{mod.title}</div>
                              {mod.description ? (
                                <div className="mt-1 text-[11px] text-nexid-muted">{mod.description}</div>
                              ) : null}
                              {mod.items.length > 0 ? (
                                <div className="mt-2 space-y-1">
                                  {mod.items.map((item, itemIdx) => (
                                    <div key={itemIdx} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-2.5 py-2 text-[10px] text-nexid-muted">
                                      <div className="min-w-0 truncate">
                                        {String(itemIdx + 1).padStart(2, "0")}. {item.title || item.type}
                                      </div>
                                      <div className="shrink-0 uppercase tracking-[0.22em] text-white/45">
                                        {item.type}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-[22px] border border-white/8 bg-[#0f0f0f] p-4 text-sm text-nexid-muted">
                      Campaign modules have not been configured yet.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-nexid-muted">Assessment Ladder</div>
                      <div className="mt-1 text-sm font-semibold text-white">Quiz assessment and mandatory live verification</div>
                    </div>
                    <div className="rounded-full border border-white/8 bg-[#0f0f0f] px-2.5 py-1 text-[10px] font-semibold text-nexid-muted">
                      {assessmentLedger.length} checkpoints
                    </div>
                  </div>
                  {assessmentLedger.map((entry, entryIdx) => {
                    const disabled = entry.locked;
                    return (
                      <button
                        key={entry.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleAssessmentLedgerSelect(entry.key)}
                        className={`w-full rounded-[20px] border px-4 py-3 text-left transition-all ${
                          entry.done
                            ? "border-emerald-400/25 bg-emerald-500/10"
                            : entry.active
                            ? "border-nexid-gold/35 bg-nexid-gold/10"
                            : entry.locked
                            ? "border-white/6 bg-[#0b0b0b] opacity-70"
                            : "border-white/8 bg-[#0f0f0f] hover:border-white/15 hover:bg-[#141414]"
                        } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${
                            entry.done
                              ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-300"
                              : entry.active
                              ? "border-nexid-gold/35 bg-black/20 text-nexid-gold"
                              : "border-white/8 bg-black/20 text-white/40"
                          }`}>
                            <span className="text-xs font-bold">{String(entryIdx + 1).padStart(2, "0")}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-white">{entry.label}</div>
                              <div className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                                entry.done
                                  ? "bg-emerald-500/12 text-emerald-300"
                                  : entry.active
                                  ? "bg-nexid-gold/12 text-nexid-gold"
                                  : entry.locked
                                  ? "bg-white/5 text-white/40"
                                  : "bg-white/8 text-white/70"
                              }`}>
                                {entry.done ? "Done" : entry.active ? "Active" : entry.locked ? "Locked" : "Ready"}
                              </div>
                            </div>
                            <div className="mt-1 text-[11px] text-nexid-muted">{entry.meta}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-[24px] border border-white/8 bg-[#0d0d0d] p-4">
                  <div className="mb-3">
                    <h3 className="font-display text-base text-white">My Encrypted Notes</h3>
                    <p className="mt-1 text-[10px] text-nexid-muted">
                      Saved per campaign and encrypted on backend.
                    </p>
                  </div>
                  {hasToken ? (
                    <>
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Write your notes..."
                        className="h-24 w-full rounded border border-[#222] bg-[#111] p-2.5 text-xs text-white outline-none focus:border-nexid-gold/50"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-nexid-muted">Max 4000 chars</span>
                        <button
                          type="button"
                          onClick={handleSaveNote}
                          disabled={savingNote || noteDraft.trim().length === 0}
                          className="rounded bg-nexid-gold px-3 py-1.5 text-[11px] font-bold text-black disabled:opacity-50"
                        >
                          {savingNote ? "Saving..." : "Save"}
                        </button>
                      </div>
                      {notesError ? (
                        <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-400">
                          {notesError}
                        </div>
                      ) : null}
                      <div className="mt-3 space-y-2">
                        {notesLoading ? (
                          <div className="text-[11px] text-nexid-muted">Loading notes...</div>
                        ) : notes.length === 0 ? (
                          <div className="text-[11px] text-nexid-muted">No notes yet.</div>
                        ) : (
                          notes.map((note) => (
                            <div key={note.id} className="rounded border border-[#222] bg-[#111] p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] text-nexid-muted">
                                  {new Date(note.createdAt).toLocaleString()}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteNote(note.id)}
                                  className="text-[10px] text-nexid-muted hover:text-red-400"
                                >
                                  Delete
                                </button>
                              </div>
                              <p className="mt-1.5 whitespace-pre-wrap text-[11px] text-white/90">{note.content}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-nexid-muted">Connect wallet to save notes.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="cs-card">
                  <div className="cs-head">
                    <div className="cs-proto-row">
                      <div className="cs-proto-ico">{sponsorGlyph}</div>
                      <div>
                        <div className="cs-proto-name">{campaign.title}</div>
                        <div className="cs-proto-chain ey">{detailChainLabel}</div>
                      </div>
                    </div>
                    <div className="cs-pool">
                      <div className="cs-pool-v">{detailTypeLabel}</div>
                      <div className="cs-pool-l">Type</div>
                    </div>
                  </div>
                  <div className="cs-stats">
                    <div className="cs-stat">
                      <div className="cs-stat-v">{completionCountMetric.toLocaleString()}</div>
                      <div className="cs-stat-l">Completions</div>
                    </div>
                    <div className="cs-stat">
                      <div className="cs-stat-v">{participantCountMetric.toLocaleString()}</div>
                      <div className="cs-stat-l">Enrolled</div>
                    </div>
                    <div className="cs-stat">
                      <div className="cs-stat-v" style={{ color: "var(--red)" }}>{botsBlockedLabel}</div>
                      <div className="cs-stat-l">Bots Blocked</div>
                    </div>
                    <div className="cs-stat">
                      <div className="cs-stat-v">Top N</div>
                      <div className="cs-stat-l">Agent Invite</div>
                    </div>
                  </div>
                  {countdownParts ? (
                    <div className="cs-countdown">
                      <div className="ccd-unit">
                        <div className="ccd-num">{String(countdownParts.days).padStart(2, "0")}</div>
                        <div className="ccd-lbl">Days</div>
                      </div>
                      <div className="ccd-sep">:</div>
                      <div className="ccd-unit">
                        <div className="ccd-num">{String(countdownParts.hours).padStart(2, "0")}</div>
                        <div className="ccd-lbl">Hrs</div>
                      </div>
                      <div className="ccd-sep">:</div>
                      <div className="ccd-unit">
                        <div className="ccd-num">{String(countdownParts.minutes).padStart(2, "0")}</div>
                        <div className="ccd-lbl">Min</div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mult-card">
                  <div className="ey" style={{ marginBottom: 10 }}>Your Multipliers</div>
                  {multiplierLoading ? (
                    <div className="mult-row">
                      <span className="mult-k">Loading multiplier state</span>
                      <span className="mult-v">...</span>
                    </div>
                  ) : multiplierRows.length > 0 ? (
                    multiplierRows.map((row) => (
                      <div key={row.key} className="mult-row">
                        <span className="mult-k">{row.label ?? row.fallback}</span>
                        <span className="mult-v">+{row.value.toFixed(2)}x</span>
                      </div>
                    ))
                  ) : (
                    <div className="mult-row">
                      <span className="mult-k">{authToken ? "No multipliers unlocked yet" : "Connect wallet to resolve multiplier"}</span>
                      <span className="mult-v">+1.00x</span>
                    </div>
                  )}
                  <div className="mult-total-row">
                    <span style={{ fontSize: 11, color: "var(--t3)" }}>Total</span>
                    <span className="mult-total-v">{multiplierTotal.toFixed(2)}x</span>
                  </div>
                </div>

                <div className="syl-card">
                  <div className="syl-hd">
                    <span className="ey">Modules</span>
                    <span className="syl-prog">{completedSyllabusStepCount}/{syllabusStepCount || 0}</span>
                  </div>
                  {hasModules ? (
                    modules.map((mod, idx) => {
                      const isCompleted = completedGroupIndexSet.has(idx);
                      const isLocked = isModuleLocked(mod) || (!completedAt && idx > nextUnlockedGroupIndex);
                      const sectionLabel = formatSyllabusSectionLabel(idx, mod.title);

                      return (
                        <div key={idx}>
                          <div className="syl-section-lbl">{sectionLabel}</div>
                          {mod.items.length > 0 ? (
                            mod.items.map((item, itemIndex) => {
                              const itemKey = `${idx}-${itemIndex}`;
                              const itemDone = completedAt || isCompleted || viewedItems.has(itemKey) || quizCorrect.has(itemKey);
                              const itemActive = !completedAt && idx === activeModule && itemIndex === activeModuleItem;
                              const itemLocked = !completedAt && (
                                isLocked ||
                                (idx === activeModule
                                  ? itemIndex > activeModuleItem && !itemDone
                                  : idx > activeModule)
                              );
                              const canOpenItem = canBrowseModules && !itemLocked;
                              const itemTag = `${idx + 1}.${itemIndex + 1} · ${mod.title}`;

                              return (
                                <button
                                  key={`${idx}-${itemIndex}-${item.title}`}
                                  type="button"
                                  disabled={!canOpenItem}
                                  onClick={() => {
                                    if (canOpenItem) {
                                      setActiveModule(idx);
                                      setActiveModuleItem(itemIndex);
                                      ensureVideoGateStarted(idx, itemIndex);
                                    }
                                  }}
                                  className={`syl-item syl-subitem ${itemActive ? "on" : ""} ${itemDone ? "done" : ""} ${itemLocked ? "locked" : ""}`}
                                >
                                  <div className="syl-item-left">
                                    <div className="syl-ico">
                                      {itemActive ? (
                                        <div className="syl-dot" />
                                      ) : itemDone ? (
                                        <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" style={{ color: "var(--green)" }}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                        </svg>
                                      ) : (
                                        <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ color: "var(--t4)" }}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                        </svg>
                                      )}
                                    </div>
                                    <div className="syl-item-copy">
                                      <div className="syl-type">{itemTag.replace("Â·", "·")}</div>
                                      <div className="syl-name">{item.title || item.type}</div>
                                    </div>
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div className="syl-empty">No lessons configured in this module yet.</div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: "12px 13px", fontSize: 11, color: "var(--t3)" }}>
                      Campaign modules have not been configured yet.
                    </div>
                  )}
                  {syllabusAssessmentRows.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      disabled={entry.locked}
                      onClick={() => handleAssessmentLedgerSelect(entry.key)}
                      className={`syl-item syl-subitem ${entry.active ? "on" : ""} ${entry.done ? "done" : ""} ${entry.locked ? "locked" : ""}`}
                    >
                      <div className="syl-item-left">
                        <div className="syl-ico">
                          {entry.active ? (
                            <div className="syl-dot" />
                          ) : entry.done ? (
                            <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" style={{ color: "var(--green)" }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          ) : (
                            <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ color: "var(--t4)" }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                          )}
                        </div>
                        <div className="syl-item-copy">
                          <div className="syl-type">{entry.tag}</div>
                          <div className="syl-name">{entry.label}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
      </div>
    </section>

    {/* Speed Trap — fires between modules (2 per group) */}
    {enrolled && !completedAt && (
      <SpeedTrapOverlay
        ref={speedTrapRef}
        campaignId={campaign.id}
      />
    )}

    {/* Quiz Gate Modals */}
    {showQuizModal && quizAssignment === 'LIVE_AI' && (
      <LiveQuizModal
        campaignId={campaign.id}
        campaignTitle={campaign.title}
        sponsorName={campaign.sponsorName}
        onComplete={handleLiveAssessmentComplete}
        onDismiss={handleDismissAssessmentStage}
      />
    )}
    {showQuizModal && quizAssignment === 'NORMAL_MCQ' && (
      <NormalQuizModal
        campaignId={campaign.id}
        quizMode={resolvedQuizMode ?? "MCQ"}
        onComplete={handleQuizComplete}
        onDismiss={handleDismissAssessmentStage}
      />
    )}

    {/* Genesis Rewards Popup */}
    {showGenesisRewards && genesisRewardCampaign && (
      <GenesisRewardsModal
        campaignId={campaign.id}
        campaignTitle={campaign.title}
        sponsorName={campaign.sponsorName}
        score={enrollmentScore}
        domainSpotsRemaining={domainSpotsRemaining}
        domainClaimed={domainClaimed}
        onDomainClaimed={handleDomainClaimed}
        onDismiss={() => setShowGenesisRewards(false)}
      />
    )}
    </>
  );
}
