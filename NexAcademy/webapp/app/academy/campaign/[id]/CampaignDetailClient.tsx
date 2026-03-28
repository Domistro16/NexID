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
import LiveQuizModal from "@/app/components/campaign/LiveQuizModal";
import NormalQuizModal from "@/app/components/campaign/NormalQuizModal";
import GenesisRewardsModal from "@/app/components/campaign/GenesisRewardsModal";

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
};

type LeaderboardRow = {
  rank: number | null;
  score: number;
  rewardAmountUsdc: string | null;
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
};

type Module = CampaignModuleItem;

type ModuleGroup = CampaignModuleGroup;

type CampaignNote = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200";

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
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CampaignResponse | null>(null);
  const [activeModule, setActiveModule] = useState(0);
  const speedTrapRef = useRef<SpeedTrapRef>(null);
  const [activeModuleItem, setActiveModuleItem] = useState(0);
  const [completedUntil, setCompletedUntil] = useState(-1);
  const [sidebarTab, setSidebarTab] = useState<"syllabus" | "leaderboard">("syllabus");

  // Enrollment state
  const [enrolled, setEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollmentScore, setEnrollmentScore] = useState(0);
  const [enrollmentChecked, setEnrollmentChecked] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [canViewOnChainSnapshot, setCanViewOnChainSnapshot] = useState(false);
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
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
  const [pendingCompletion, setPendingCompletion] = useState(false);

  // Genesis rewards popup (after campaign completion for NexID partner campaigns)
  const [showGenesisRewards, setShowGenesisRewards] = useState(false);

  // Per-item interaction tracking to prevent gaming completion
  const [viewedItems, setViewedItems] = useState<Set<string>>(new Set());
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizCorrect, setQuizCorrect] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    setActiveModuleItem(0);
  }, [activeModule]);

  // Mark non-quiz items as viewed when selected
  useEffect(() => {
    if (!data || !enrolled) return;
    const modules: ModuleGroup[] = normalizeCampaignModules(data.campaign.modules);
    const mod = modules[activeModule];
    if (!mod) return;
    const item = mod.items[activeModuleItem];
    if (!item) return;
    // Quizzes require correct answer; videos/tasks are viewed on selection
    if (item.type !== "quiz") {
      const key = `${activeModule}-${activeModuleItem}`;
      setViewedItems((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }
  }, [activeModule, activeModuleItem, data, enrolled]);

  // Check enrollment status
  useEffect(() => {
    if (!data) return;
    if (!authToken) {
      setEnrolled(false);
      setEnrollmentScore(0);
      setCompletedUntil(-1);
      setCompletedAt(null);
      setEnrollmentChecked(true);
      return;
    }

    setEnrollmentChecked(false);

    fetch(`/api/campaigns/${campaignId}/enroll`, { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) {
          setEnrolled(false);
          return;
        }
        const body = await res.json();
        setEnrolled(body.enrolled);
        if (body.participant) {
          setEnrollmentScore(body.participant.score ?? 0);
          const savedCompletedUntil = Number.isInteger(body.participant.completedUntil)
            ? body.participant.completedUntil
            : -1;
          setCompletedUntil(savedCompletedUntil);
          const moduleCount = normalizeCampaignModules(data.campaign.modules).length;
          if (moduleCount > 0) {
            const resumeModule = Math.min(Math.max(savedCompletedUntil + 1, 0), moduleCount - 1);
            setActiveModule(resumeModule);
            setActiveModuleItem(0);
          }
          if (body.participant.completedAt) {
            setCompletedAt(body.participant.completedAt);
          }
        }
      })
      .catch(() => { })
      .finally(() => setEnrollmentChecked(true));
  }, [campaignId, data, authToken]);

  // Reload resilience: if all modules done but not completed, re-trigger quiz gate
  useEffect(() => {
    if (!enrolled || !enrollmentChecked || !data) return;
    if (completedAt) return; // Already completed
    const moduleCount = normalizeCampaignModules(data.campaign.modules).length;
    if (moduleCount === 0 || completedUntil < moduleCount - 1) return; // Not all modules done

    // All modules done but not completed — check for existing agent session
    async function checkAndGate() {
      try {
        const sessionRes = await fetch('/api/agent/session', { headers: authHeaders() });
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          const existingCompleted = (sessionData.sessions ?? []).find(
            (s: { sessionType: string; campaignId: number | null; status: string }) =>
              s.sessionType === 'CAMPAIGN_ASSESSMENT' &&
              s.campaignId === Number(campaignId) &&
              s.status === 'COMPLETED',
          );

          if (existingCompleted) {
            // Quiz already done — just complete the campaign
            await finalizeCampaignCompletion();
            return;
          }
        }
      } catch {
        // Ignore — will show quiz gate below
      }

      // No completed session — show quiz modal
      try {
        const assignRes = await fetch(`/api/campaigns/${campaignId}/quiz-assignment`, {
          headers: authHeaders(),
        });
        if (assignRes.ok) {
          const assignData = await assignRes.json();
          setQuizAssignment(assignData.type);
          setPendingCompletion(true);
          setShowQuizModal(true);
        }
      } catch {
        // Fallback: complete directly
        await finalizeCampaignCompletion();
      }
    }

    checkAndGate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrolled, enrollmentChecked, completedAt, completedUntil, data]);

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
          const savedCompletedUntil = Number.isInteger(body.participant.completedUntil)
            ? body.participant.completedUntil
            : -1;
          setCompletedUntil(savedCompletedUntil);
          if (body.participant.completedAt) {
            setCompletedAt(body.participant.completedAt);
          }
        }
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
        <Link href="/academy" className="mt-4 inline-block text-sm text-nexid-muted hover:text-white">
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

  // Check if all items in active module have been interacted with
  const allActiveItemsViewed = activeItems.length > 0 && activeItems.every((_item, itemIdx) => {
    const key = `${activeModule}-${itemIdx}`;
    if (_item.type === "quiz") return quizCorrect.has(key);
    return viewedItems.has(key);
  });
  // Can only mark complete if this is the next module in sequence
  const canMarkComplete = activeModule <= completedUntil + 1 && allActiveItemsViewed;

  const campaignImage = campaign.coverImageUrl || FALLBACK_IMAGE;
  const startDate = formatDate(campaign.startAt);
  const endDate = formatDate(campaign.endAt);
  const hasToken = Boolean(authToken);
  const internalCoreCampaign = isInternalCoreCampaign(campaign);
  const genesisRewardCampaign = isGenesisRewardCampaign(campaign);

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
      setCompletedAt(body?.participant?.completedAt ?? new Date().toISOString());
      setCompletedUntil(Math.max(completedUntil, modules.length - 1));

      // Show Genesis Rewards popup for NexID partner campaigns
      if (genesisRewardCampaign) {
        setShowGenesisRewards(true);
      }
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : "Failed to complete campaign");
    } finally {
      setCompleting(false);
      setPendingCompletion(false);
    }
  }

  // Handle quiz modal completion → then finalize campaign
  async function handleQuizComplete(_score: number | null) {
    setShowQuizModal(false);
    await finalizeCampaignCompletion();
  }

  // Handle genesis domain claimed
  function handleDomainClaimed(domain: string) {
    setDomainClaimed(domain);
  }

  return (
    <>
    <section className="mx-auto w-full max-w-[1600px] px-6 pb-12 pt-8 lg:px-12">
      {/* Back */}
      <button
        onClick={() => window.history.back()}
        className="flex items-center gap-2 text-sm font-medium text-nexid-muted hover:text-white transition-colors mb-6 group w-max"
      >
        <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Back to Gallery
      </button>

      {/* Header */}
      <div className="mb-8 flex flex-col gap-8 border-b border-[#1a1a1a] pb-8 lg:flex-row items-start">
        <div className="flex-1">
          <div className="flex gap-2 mb-4">
            <span className={`${isEnded ? "bg-red-500/10 text-red-500 border-red-500/30" : "bg-nexid-gold/10 text-nexid-gold border-nexid-gold/30"} text-[10px] font-bold px-3 py-1.5 rounded uppercase tracking-widest border shadow-inner-glaze`}>
              {campaign.status}
            </span>
          </div>
          <h1 className="font-display mb-4 text-4xl font-bold text-white md:text-5xl tracking-tight leading-tight">{campaign.title}</h1>
          <p className="max-w-4xl text-sm leading-relaxed text-nexid-muted">{campaign.objective}</p>
        </div>
        <div className="premium-panel w-full shrink-0 bg-[#0a0a0a] p-6 lg:w-72 text-right shadow-inner-glaze">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Sponsored By</div>
          <div className="font-display mb-4 text-xl text-white">{campaign.sponsorName}</div>
          {!internalCoreCampaign ? (
            <>
              <div className="h-px w-full bg-[#1a1a1a] mb-4" />
              <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-nexid-gold">Rewards</div>
              {genesisRewardCampaign ? (
                <div className="space-y-1">
                  <div className="text-sm font-bold text-white">100 Genesis Points</div>
                  <div className="text-[11px] text-nexid-muted">
                    + 5-char .id domain for first 1,000 completions
                  </div>
                </div>
              ) : (
                <div className="text-sm font-bold text-white">${formatUsdc(campaign.prizePoolUsdc)} USDC</div>
              )}
            </>
          ) : null}
          {(startDate || endDate) ? (
            <div className="mt-2 text-[11px] text-nexid-muted">
              {startDate ? `Start: ${startDate}` : null}
              {startDate && endDate ? " - " : null}
              {endDate ? `End: ${endDate}` : null}
            </div>
          ) : null}

          {isLive && hasToken && enrollmentChecked ? (
            <div className="mt-4">
              {enrolled ? (
                <div className="rounded border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                  Enrolled - Score: {enrollmentScore}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleEnroll}
                  disabled={enrolling}
                  className="w-full rounded bg-nexid-gold py-2.5 text-sm font-bold text-black disabled:opacity-50"
                >
                  {enrolling ? "Enrolling..." : "Join Campaign"}
                </button>
              )}
            </div>
          ) : null}
          {isLive && !hasToken ? (
            <div className="mt-4 text-[10px] text-nexid-muted">
              Connect wallet to enroll in this campaign.
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Main Content */}
        <div className="flex-1 flex flex-col gap-6 w-full">
          {/* Theater Stage */}
          <div className="premium-panel overflow-hidden border border-[#1a1a1a] flex flex-col relative bg-[#050505] min-h-[360px] lg:h-[600px]">
            {!isEnded ? (
              <div className="relative h-full bg-black">
                <img
                  src={campaignImage}
                  alt={campaign.title}
                  className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-luminosity"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />

                {hasModules ? (
                  <div className="relative z-10 flex h-full flex-col">
                    <div className="relative w-full overflow-hidden bg-black aspect-video lg:flex-1">
                      {!enrolled ? (
                        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
                          <div className="text-center">
                            <h3 className="font-display text-2xl text-white">Content Locked</h3>
                            <p className="mt-2 text-sm text-nexid-muted">Enroll to watch modules.</p>
                          </div>
                        </div>
                      ) : null}

                      {!enrolled ? null : activeContent?.type === "video" && activeContent?.videoUrl ? (
                        <div className="absolute inset-0">
                          <iframe
                            src={activeContent.videoUrl}
                            loading="lazy"
                            title={`Video player - ${activeContent.title}`}
                            allowFullScreen
                            allow="encrypted-media; fullscreen; microphone; screen-wake-lock;"
                            className="absolute inset-0 h-full w-full border-0"
                          />
                        </div>
                      ) : activeContent?.type === "task" ? (
                        <div className="absolute inset-0 flex items-center justify-center p-6 md:p-8">
                          <div className="max-w-xl text-center">
                            <h3 className="font-display text-2xl text-white">{activeContent.title}</h3>
                            {activeContent.description ? (
                              <p className="mt-3 text-sm text-nexid-muted">{activeContent.description}</p>
                            ) : null}
                            {activeContent.actionUrl ? (
                              <a
                                href={activeContent.actionUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-5 inline-block rounded bg-nexid-gold px-5 py-2 text-sm font-bold text-black"
                              >
                                {activeContent.actionLabel || "Open Task"}
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ) : activeContent?.type === "quiz" ? (
                        <div className="absolute inset-0 flex items-center justify-center p-6 md:p-8 overflow-y-auto">
                          <div className="max-w-xl w-full text-center">
                            <h3 className="font-display text-2xl text-white">{activeContent.title}</h3>
                            {activeContent.question ? (
                              <p className="mt-3 text-sm text-nexid-muted">{activeContent.question}</p>
                            ) : null}
                            {activeContent.options && activeContent.options.length > 0 ? (() => {
                              const quizKey = `${activeModule}-${activeModuleItem}`;
                              const selectedAnswer = quizAnswers[quizKey];
                              const isCorrect = quizCorrect.has(quizKey);
                              const hasAnswered = selectedAnswer !== undefined;
                              return (
                                <div className="mt-6 space-y-3 text-left">
                                  {activeContent.options.map((option, optIdx) => {
                                    const isSelected = selectedAnswer === optIdx;
                                    const showResult = hasAnswered && isSelected;
                                    return (
                                      <button
                                        key={optIdx}
                                        type="button"
                                        disabled={isCorrect}
                                        onClick={() => {
                                          const correct = activeContent.correctIndex === optIdx;
                                          setQuizAnswers((prev) => ({ ...prev, [quizKey]: optIdx }));
                                          if (correct) {
                                            setQuizCorrect((prev) => {
                                              const next = new Set(prev);
                                              next.add(quizKey);
                                              return next;
                                            });
                                            setViewedItems((prev) => {
                                              const next = new Set(prev);
                                              next.add(quizKey);
                                              return next;
                                            });
                                          }
                                        }}
                                        className={`w-full rounded border px-4 py-3 text-sm text-left transition-colors ${
                                          showResult && isCorrect
                                            ? "border-green-500/60 bg-green-500/15 text-green-400"
                                            : showResult && !isCorrect
                                            ? "border-red-500/60 bg-red-500/15 text-red-400"
                                            : isSelected
                                            ? "border-nexid-gold/60 bg-nexid-gold/15 text-nexid-gold"
                                            : "border-white/10 bg-black/40 text-white/80 hover:border-white/30 hover:text-white"
                                        } ${isCorrect ? "cursor-default" : ""}`}
                                      >
                                        <span className="font-mono text-xs mr-2">{String.fromCharCode(65 + optIdx)}.</span>
                                        {option}
                                      </button>
                                    );
                                  })}
                                  {hasAnswered && !isCorrect ? (
                                    <p className="text-xs text-red-400 text-center mt-2">Incorrect - try again!</p>
                                  ) : null}
                                  {isCorrect ? (
                                    <p className="text-xs text-green-400 text-center mt-2">Correct!</p>
                                  ) : null}
                                </div>
                              );
                            })() : null}
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
                          <p className="text-sm text-nexid-muted">This module has no playable content yet.</p>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-white/10 bg-black/80 p-4 md:p-6">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-nexid-gold">
                            Module {activeModule + 1}
                          </div>
                          <h3 className="font-display text-xl text-white md:text-2xl">{activeModuleLabel}</h3>
                          {activeContent ? (
                            <p className="mt-1 text-xs text-nexid-muted">{activeContent.title}</p>
                          ) : null}
                          {activeItems.length > 1 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {activeItems.map((item, itemIndex) => {
                                const itemKey = `${activeModule}-${itemIndex}`;
                                const itemViewed = viewedItems.has(itemKey) || quizCorrect.has(itemKey);
                                return (
                                  <button
                                    key={`${activeModule}-${itemIndex}-${item.title}`}
                                    type="button"
                                    onClick={() => setActiveModuleItem(itemIndex)}
                                    className={`rounded border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide ${
                                      itemIndex === activeModuleItem
                                        ? "border-nexid-gold/60 bg-nexid-gold/15 text-nexid-gold"
                                        : itemViewed
                                        ? "border-green-500/30 bg-green-500/10 text-green-400"
                                        : "border-white/10 bg-black/40 text-nexid-muted hover:text-white"
                                    }`}
                                  >
                                    {itemViewed ? "\u2713 " : ""}{String(itemIndex + 1).padStart(2, "0")} · {item.title || item.type}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>

                        {enrolled && !completedAt ? (
                          <div className="flex w-full flex-col items-start gap-2 md:w-auto md:items-end">
                            <button
                              type="button"
                              disabled={progressSaving || completing || !canMarkComplete}
                              onClick={async () => {
                                setProgressError(null);
                                setProgressSaving(true);

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

                                // Speed trap gate: fire all queued traps for this group
                                await speedTrapRef.current?.checkTrapsForGroup(activeModule);

                                if (next < modules.length && !isModuleLocked(modules[next])) {
                                  setActiveModule(next);
                                }

                                if (persistedCompletedUntil >= modules.length - 1) {
                                  // Gate: show quiz modal before completing campaign
                                  setPendingCompletion(true);
                                  try {
                                    const assignRes = await fetch(`/api/campaigns/${campaignId}/quiz-assignment`, {
                                      headers: authHeaders(),
                                    });
                                    if (assignRes.ok) {
                                      const assignData = await assignRes.json();
                                      setQuizAssignment(assignData.type);
                                      setShowQuizModal(true);
                                    } else {
                                      // Fallback: skip quiz gate, complete directly
                                      await finalizeCampaignCompletion();
                                    }
                                  } catch {
                                    // Fallback: complete directly if quiz assignment fails
                                    await finalizeCampaignCompletion();
                                  }
                                }
                              }}
                              className="w-full rounded bg-nexid-gold px-6 py-2.5 text-sm font-bold text-black transition-all hover:shadow-gold-glow disabled:opacity-60 md:w-auto"
                            >
                              {completing ? "Completing..." : progressSaving ? "Saving..." : !canMarkComplete ? "Complete All Items First" : "Mark Complete"}
                            </button>
                            {!canMarkComplete && !progressSaving && !completing ? (
                              <div className="max-w-[280px] text-left text-[11px] text-nexid-muted md:text-right">
                                {activeModule > completedUntil + 1
                                  ? "Complete previous modules first"
                                  : "View all items and answer quizzes correctly"}
                              </div>
                            ) : null}
                            {progressError ? (
                              <div className="max-w-[280px] text-left text-[11px] text-red-400 md:text-right">
                                {progressError}
                              </div>
                            ) : null}
                          </div>
                        ) : enrolled && completedAt ? (
                          <div className="rounded border border-green-500/30 bg-green-500/10 px-4 py-2 text-xs text-green-400">
                            Completed {formatDate(completedAt) ?? ""}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
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
              <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center border-t-4 border-nexid-gold">
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
          </div>

          {/* Key Takeaways */}
          <div className="premium-panel p-6 bg-[#0a0a0a]">
            <div className="flex items-center gap-2 mb-4 border-b border-[#1a1a1a] pb-4">
              <svg className="w-5 h-5 text-nexid-gold" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
              <h3 className="font-display text-lg text-white">Key Takeaways</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(campaign.keyTakeaways.length > 0 ? campaign.keyTakeaways : ["No key takeaways published yet."]).map((takeaway) => (
                <div key={takeaway} className="flex items-start gap-3 bg-[#111] p-3 rounded-lg border border-[#222]">
                  <div className="w-1.5 h-1.5 rounded-full bg-nexid-gold mt-1.5 shrink-0 shadow-[0_0_5px_#ffb000]" />
                  <p className="text-xs leading-relaxed text-nexid-muted">{takeaway}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Genesis Rewards */}
          {genesisRewardCampaign ? (
            <div className="premium-panel bg-[#0a0a0a] p-6">
              <div className="flex items-center gap-3 mb-4 border-b border-[#1a1a1a] pb-4">
                <div className="w-8 h-8 rounded-lg bg-[#FFB000]/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#FFD700]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
                <h3 className="font-display text-lg text-white">Genesis Rewards</h3>
              </div>
              <div className="rounded-xl border border-[#222] bg-[#111] p-4 text-xs text-white/90 space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-nexid-muted">Genesis Points</span>
                  <span className="font-bold text-[#FFD700]">100 on completion</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-nexid-muted">Domain Spots</span>
                  <span className="font-mono">{domainSpotsRemaining ?? "-"} remaining</span>
                </div>
              </div>
              {!completedAt ? (
                <div className="text-xs text-nexid-muted">
                  Complete all modules to unlock rewards.
                </div>
              ) : domainClaimed ? (
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-xs text-green-400 flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Domain claimed: <span className="font-bold">{domainClaimed}.id</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowGenesisRewards(true)}
                  className="w-full rounded-xl bg-gradient-to-r from-[#FFB000] to-[#FFD700] px-4 py-3 text-xs font-bold text-black transition-all hover:shadow-[0_0_20px_rgba(255,176,0,0.2)] active:scale-[0.98]"
                >
                  Claim Your Rewards
                </button>
              )}
            </div>
          ) : null}

          {canViewOnChainSnapshot ? (
            <div className="premium-panel bg-[#0a0a0a] p-6">
              <h3 className="font-display mb-3 text-lg text-white">On-Chain Snapshot</h3>
              {onChain ? (
                <div className="space-y-2 text-xs text-white/80">
                  <div>
                    Contract: <span className="font-mono text-nexid-gold">{onChain.contractType}</span>
                  </div>
                  <div>
                    Address: <span className="font-mono text-nexid-muted">{shortAddress(onChain.contractAddress)}</span>
                  </div>
                  <div>
                    On-chain Campaign ID: <span className="font-mono">{onChain.campaignId}</span>
                  </div>
                  <div>
                    On-chain Participants: <span className="font-mono">{onChain.participantCount}</span>
                  </div>
                  {onChain.sponsorAddress ? (
                    <div>
                      Sponsor Wallet: <span className="font-mono">{shortAddress(onChain.sponsorAddress)}</span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-xs text-nexid-muted">
                  On-chain mapping not configured for this campaign yet.
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-[400px] shrink-0 flex flex-col premium-panel border border-[#1a1a1a] bg-[#0a0a0a] lg:h-[calc(600px+150px)]">
          {/* Tabs */}
          <div className="p-2 border-b border-[#1a1a1a] shrink-0 flex gap-2 bg-[#111]">
            <button
              type="button"
              onClick={() => setSidebarTab("syllabus")}
              className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${sidebarTab === "syllabus" ? "bg-[#222] text-white shadow-sm border border-[#333]" : "text-nexid-muted hover:text-white border border-transparent"}`}
            >
              Campaign Ledger
            </button>
            {!internalCoreCampaign && (
              <button
                type="button"
                onClick={() => setSidebarTab("leaderboard")}
                className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${sidebarTab === "leaderboard" ? "bg-[#222] text-white shadow-sm border border-[#333]" : "text-nexid-muted hover:text-white border border-transparent"}`}
              >
                Leaderboard
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scroll relative">
            {/* Syllabus */}
            {sidebarTab === "syllabus" ? (
              <div>
                {isEnded ? (
                  <div className="p-6 text-center text-sm text-nexid-muted">Campaign ended. Modules locked. Check claim status.</div>
                ) : hasModules ? (
                  modules.map((mod, idx) => {
                    const isCompleted = idx <= completedUntil;
                    const isActive = idx === activeModule;
                    const isLocked = isModuleLocked(mod) && idx > completedUntil + 1;
                    const stateClass = isCompleted ? "completed" : isActive ? "active" : isLocked ? "locked" : "";
                    const typeSummary = Array.from(new Set(mod.items.map((item) => item.type))).join(" + ");

                    return (
                      <div
                        key={idx}
                        className={`syllabus-item ${stateClass} p-4 border-b border-[#1a1a1a] flex gap-4 ${!isLocked ? "cursor-pointer" : ""}`}
                        onClick={() => {
                          if (!isLocked) {
                            setActiveModule(idx);
                            setActiveModuleItem(0);
                          }
                        }}
                      >
                        <div className="w-8 h-8 rounded-full bg-[#111] border border-[#222] flex items-center justify-center shrink-0">
                          {isCompleted ? (
                            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          ) : isActive ? (
                            <span className="w-3 h-3 bg-nexid-gold rounded-full shadow-[0_0_10px_#ffb000] pulse-gold" />
                          ) : isLocked ? (
                            <svg className="w-4 h-4 text-[#555]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          ) : (
                            <span className="w-2 h-2 bg-[#333] rounded-full" />
                          )}
                        </div>
                        <div>
                          <div className="text-[10px] font-mono text-nexid-muted mb-1 uppercase tracking-widest">
                            {String(idx + 1).padStart(2, "0")} · {typeSummary || "module"} · {mod.items.length} item{mod.items.length === 1 ? "" : "s"}
                          </div>
                          <div className="text-sm font-medium text-white">{mod.title}</div>
                          {mod.items.length > 0 ? (
                            <div className="mt-1 space-y-0.5">
                              {mod.items.map((item, itemIdx) => (
                                <div key={itemIdx} className="text-[10px] text-nexid-muted/60 truncate max-w-[260px]">
                                  {String(itemIdx + 1).padStart(2, "0")}. {item.title || item.type}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-sm text-nexid-muted">Campaign modules have not been configured yet.</div>
                )}

                <div className="border-t border-[#1a1a1a] bg-[#0d0d0d] p-4">
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
              /* Leaderboard — hidden for internal campaigns */
              <div className="p-2 space-y-1">
                {internalCoreCampaign ? (
                  <div className="p-6 text-sm text-nexid-muted">Leaderboard is not available for internal campaigns.</div>
                ) : leaderboard.length === 0 ? (
                  <div className="p-6 text-sm text-nexid-muted">No leaderboard entries yet.</div>
                ) : (
                  leaderboard.map((row, idx) => {
                    const rank = row.rank ?? idx + 1;
                    const color = rank === 1 ? "text-[#FFD700]" : rank === 2 ? "text-[#C0C0C0]" : rank === 3 ? "text-[#CD7F32]" : "text-nexid-muted";
                    return (
                      <div key={`${row.walletAddress}-${rank}`} className="p-2.5 rounded hover:bg-[#111] flex items-center justify-between transition-colors border-b border-[#1a1a1a] last:border-0">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 text-center font-mono text-xs font-bold ${color}`}>{rank}</div>
                          <div className="font-medium text-white/90 text-xs">{shortAddress(row.walletAddress)}</div>
                        </div>
                        <div className={`font-mono text-xs ${color}`}>{row.score.toLocaleString()} pts</div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>

    {/* Speed Trap — fires between modules (2 per group) */}
    {enrolled && !completedAt && (
      <SpeedTrapOverlay
        ref={speedTrapRef}
        campaignId={Number(campaignId)}
        groupStructure={modules.map((g) => g.items.length)}
      />
    )}

    {/* Quiz Gate Modals */}
    {showQuizModal && quizAssignment === 'LIVE_AI' && (
      <LiveQuizModal
        campaignId={Number(campaignId)}
        campaignTitle={campaign.title}
        sponsorName={campaign.sponsorName}
        onComplete={handleQuizComplete}
        onDismiss={() => setShowQuizModal(false)}
      />
    )}
    {showQuizModal && quizAssignment === 'NORMAL_MCQ' && (
      <NormalQuizModal
        campaignId={Number(campaignId)}
        onComplete={handleQuizComplete}
        onDismiss={() => setShowQuizModal(false)}
      />
    )}

    {/* Genesis Rewards Popup */}
    {showGenesisRewards && genesisRewardCampaign && (
      <GenesisRewardsModal
        campaignId={Number(campaignId)}
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
