"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSignMessage } from "wagmi";
import { useENSName } from "@/hooks/getPrimaryName";
import Link from "next/link";

type ViewKey = "dashboard" | "analytics" | "brief" | "review";

const VIEW_TITLES: Record<ViewKey, string> = {
  dashboard: "Command Center",
  analytics: "Telemetry & Data",
  brief: "Campaign Architect",
  review: "Studio Review",
};

const CALL_TIME_SLOTS = ["10:00 AM", "11:30 AM", "2:00 PM", "4:30 PM"];

/* ---------- types ---------- */
interface PartnerProfile {
  id: string;
  orgName: string;
  namespace: string;
}

interface CampaignData {
  id: number;
  slug: string;
  title: string;
  status: string;
  prizePoolUsdc: string;
  participantCount: number;
  completedCount: number;
  topScore: number;
}

interface Summary {
  totalCampaigns: number;
  liveCampaigns: number;
  totalEnrollments: number;
  totalCompleted: number;
  completionRate: number;
  totalPrizePoolUsdc: string;
}

interface LeaderboardRow {
  rank: number | null;
  score: number;
  rewardAmountUsdc: string | null;
  walletAddress: string;
}

/* ---------- helper: auth headers ---------- */
function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export default function PartnerConsolePage() {
  /* ---- Privy / wallet ---- */
  const { login, ready, authenticated, logout } = usePrivy();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { name: domainName } = useENSName({ owner: address as `0x${string}` });

  /* ---- auth flow ---- */
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authAttempted = useRef(false);

  /* ---- partner state ---- */
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  /* ---- onboarding form ---- */
  const [orgNameInput, setOrgNameInput] = useState("");
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);

  /* ---- console state ---- */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  /* ---- wizard state ---- */
  const [wizardStep, setWizardStep] = useState(1);
  const [tier, setTier] = useState<"standard" | "premium" | "ecosystem">("standard");
  const [prizePool, setPrizePool] = useState(15000);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [primaryObjective, setPrimaryObjective] = useState("");
  const [briefFileName, setBriefFileName] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [callBookingOpen, setCallBookingOpen] = useState(false);
  const [callBookedFor, setCallBookedFor] = useState("");
  const [callTimeSlot, setCallTimeSlot] = useState("");
  const [callTimezone, setCallTimezone] = useState("EST");
  const [callBookingNotes, setCallBookingNotes] = useState("");

  /* ---- modals ---- */
  const [rewardOpen, setRewardOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  /* ---- review ---- */
  const [pin, setPin] = useState<{ percent: number; time: string } | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const stepProgress = wizardStep === 1 ? "w-0" : wizardStep === 2 ? "w-1/2" : "w-full";

  /* ========== AUTH: sign message to get JWT ========== */
  const authenticate = useCallback(async () => {
    if (!address || isAuthenticating) return;
    setIsAuthenticating(true);
    try {
      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!nonceRes.ok) throw new Error("Failed to get nonce");
      const { message } = await nonceRes.json();
      const signature = await signMessageAsync({ message });
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, signature, message }),
      });
      if (!verifyRes.ok) throw new Error("Verification failed");
      const { token, user } = await verifyRes.json();
      localStorage.setItem("auth_token", token);
      localStorage.setItem("auth_user", JSON.stringify(user));
      setAuthToken(token);
    } catch (err) {
      console.error("Partner auth error:", err);
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, isAuthenticating, signMessageAsync]);

  // On wallet connect → authenticate
  useEffect(() => {
    if (!ready || !authenticated || !isConnected || !address) return;
    // Check for existing token
    const existing = localStorage.getItem("auth_token");
    if (existing) {
      setAuthToken(existing);
      return;
    }
    if (authAttempted.current) return;
    authAttempted.current = true;
    authenticate();
  }, [ready, authenticated, isConnected, address, authenticate]);

  /* ========== PARTNER PROFILE LOOKUP ========== */
  useEffect(() => {
    if (!authToken) return;
    setPartnerLoading(true);
    fetch("/api/partner/profile", { headers: authHeaders() })
      .then(async (res) => {
        if (res.status === 404) {
          setNeedsOnboarding(true);
          setPartner(null);
        } else if (res.ok) {
          const data = await res.json();
          setPartner(data.partner);
          setNeedsOnboarding(false);
        }
      })
      .catch((err) => console.error("Partner profile fetch error:", err))
      .finally(() => setPartnerLoading(false));
  }, [authToken]);

  /* ========== LOAD CAMPAIGNS when partner is set ========== */
  useEffect(() => {
    if (!partner || !authToken) return;
    fetch("/api/partner/campaigns", { headers: authHeaders() })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data.campaigns ?? []);
          setSummary(data.summary ?? null);
        }
      })
      .catch((err) => console.error("Campaigns fetch error:", err));
  }, [partner, authToken]);

  /* ========== LOAD LEADERBOARD for selected campaign ========== */
  useEffect(() => {
    if (!selectedCampaignId || !authToken) return;
    fetch(`/api/partner/campaigns/${selectedCampaignId}/leaderboard`, {
      headers: authHeaders(),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setLeaderboard(data.leaderboard ?? []);
        }
      })
      .catch((err) => console.error("Leaderboard fetch error:", err));
  }, [selectedCampaignId, authToken]);

  /* ========== ONBOARDING SUBMIT ========== */
  async function handleOnboarding() {
    setOnboardingError(null);
    if (!orgNameInput.trim()) {
      setOnboardingError("Organization name is required.");
      return;
    }
    setOnboardingSubmitting(true);
    try {
      const res = await fetch("/api/partner/profile", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          orgName: orgNameInput.trim(),
          domainName: domainName || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOnboardingError(data.error || "Failed to create partner profile.");
        return;
      }
      setPartner(data.partner);
      setNeedsOnboarding(false);
    } catch {
      setOnboardingError("Network error. Please try again.");
    } finally {
      setOnboardingSubmitting(false);
    }
  }

  /* ========== CAMPAIGN REQUEST SUBMIT ========== */
  async function submitCampaignRequest() {
    setRequestError(null);
    setRequestSuccess(null);
    if (!campaignTitle.trim()) { setRequestError("Campaign title is required."); return; }
    if (!primaryObjective.trim()) { setRequestError("Primary objective is required."); return; }
    if (prizePool < 15000) { setRequestError("Minimum deployment pool is $15,000."); return; }
    if (!callBookedFor) { setRequestError("Strategy call date is required."); return; }
    if (!callTimeSlot) { setRequestError("Strategy call time slot is required."); return; }

    setSubmittingRequest(true);
    try {
      const res = await fetch("/api/partner/campaign-requests", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          campaignTitle: campaignTitle.trim(),
          primaryObjective: primaryObjective.trim(),
          tier: tier.toUpperCase(),
          prizePoolUsdc: prizePool,
          briefFileName,
          callBookedFor: `${callBookedFor}T00:00:00.000Z`,
          callTimeSlot,
          callTimezone,
          callBookingNotes: callBookingNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setRequestError(data?.error || "Failed to submit campaign request."); return; }
      setRequestSuccess(`Request submitted: ${data?.request?.id ?? "pending"} (status: ${data?.request?.status ?? "PENDING"})`);
      setWizardStep(1);
      setCampaignTitle("");
      setPrimaryObjective("");
      setBriefFileName(null);
      setPrizePool(15000);
      setTier("standard");
      setCallBookedFor("");
      setCallTimeSlot("");
      setCallTimezone("EST");
      setCallBookingNotes("");
      goView("dashboard");
    } catch {
      setRequestError("Failed to submit campaign request.");
    } finally {
      setSubmittingRequest(false);
    }
  }

  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left;
    const pct = Math.min(100, Math.max(0, (x / rect.width) * 100));
    const totalSeconds = 310;
    const seconds = Math.floor((pct / 100) * totalSeconds);
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    setPin({ percent: pct, time: `${mm}:${ss}` });
  };

  const goView = (next: ViewKey) => { setView(next); setSidebarOpen(false); };

  /* ---- derived ---- */
  const displayName = partner?.namespace ?? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "");
  const orgInitials = partner?.orgName ? partner.orgName.slice(0, 4).toUpperCase() : "---";
  const liveCampaigns = campaigns.filter((c) => c.status === "LIVE");
  const top10 = useMemo(() => leaderboard.slice(0, 10), [leaderboard]);

  const statusBadge = (status: string) => {
    if (status === "LIVE") return "border-green-500/20 bg-green-500/10 text-green-400";
    if (status === "DRAFT") return "border-red-500/30 bg-red-500/10 text-red-500";
    if (status === "ENDED") return "border-[#333] bg-[#222] text-nexid-muted";
    return "border-[#333] bg-[#222] text-nexid-muted";
  };

  /* ================================================================
     RENDER: NOT CONNECTED
     ================================================================ */
  if (!ready) {
    return (
      <div className="nexid-console flex h-screen w-full items-center justify-center bg-nexid-base">
        <div className="text-nexid-muted">Loading...</div>
      </div>
    );
  }

  if (!authenticated || !isConnected) {
    return (
      <div className="nexid-console h-screen w-full overflow-hidden bg-nexid-base">
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#030303] bg-[radial-gradient(circle_at_center,rgba(255,176,0,0.03)_0%,transparent_50%)]">
          <div className="w-full max-w-sm animate-[fadeUpConsole_0.8s_cubic-bezier(0.16,1,0.3,1)] p-8">
            <div className="font-display mb-2 text-center text-4xl font-black tracking-tighter">
              NexID<span className="text-nexid-gold">.</span>
            </div>
            <div className="shadow-inner-glaze mx-auto mb-10 w-max rounded border border-[#222] bg-[#0a0a0a] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
              Enterprise Console
            </div>
            <div className="space-y-4">
              <button
                type="button"
                onClick={login}
                className="shadow-inner-glaze w-full rounded-lg border border-[#333] bg-[#0a0a0a] py-3.5 text-sm font-medium text-white transition-all hover:border-nexid-gold"
              >
                Connect Wallet
              </button>
              <p className="text-center font-mono text-[10px] text-nexid-muted">
                Connect via wallet or email through Privy
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================
     RENDER: AUTHENTICATING (signing message)
     ================================================================ */
  if (isAuthenticating || (!authToken && !partnerLoading)) {
    return (
      <div className="nexid-console flex h-screen w-full items-center justify-center bg-nexid-base">
        <div className="text-center">
          <div className="font-display mb-4 text-2xl text-white">
            NexID<span className="text-nexid-gold">.</span>
          </div>
          <div className="text-sm text-nexid-muted">
            {isAuthenticating ? "Sign the message in your wallet to continue..." : "Initializing..."}
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================
     RENDER: LOADING PARTNER PROFILE
     ================================================================ */
  if (partnerLoading) {
    return (
      <div className="nexid-console flex h-screen w-full items-center justify-center bg-nexid-base">
        <div className="text-sm text-nexid-muted">Loading partner profile...</div>
      </div>
    );
  }

  /* ================================================================
     RENDER: ONBOARDING (first-time partner)
     ================================================================ */
  if (needsOnboarding) {
    return (
      <div className="nexid-console h-screen w-full overflow-hidden bg-nexid-base">
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#030303] bg-[radial-gradient(circle_at_center,rgba(255,176,0,0.03)_0%,transparent_50%)]">
          <div className="w-full max-w-md animate-[fadeUpConsole_0.8s_cubic-bezier(0.16,1,0.3,1)] p-8">
            <div className="font-display mb-2 text-center text-4xl font-black tracking-tighter">
              NexID<span className="text-nexid-gold">.</span>
            </div>
            <div className="shadow-inner-glaze mx-auto mb-8 w-max rounded border border-[#222] bg-[#0a0a0a] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
              Partner Onboarding
            </div>

            <div className="premium-panel space-y-6 bg-[#0a0a0a] p-6">
              <div>
                <div className="mb-1 text-xs text-nexid-muted">Connected as</div>
                <div className="font-mono text-sm text-white">
                  {domainName ? String(domainName) : (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "")}
                </div>
              </div>

              <div>
                <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-nexid-muted">
                  Organization / Partner Name
                </label>
                <input
                  type="text"
                  value={orgNameInput}
                  onChange={(e) => setOrgNameInput(e.target.value)}
                  placeholder="e.g., Nexus Protocol"
                  className="b2b-input w-full px-4 py-3 text-sm"
                />
              </div>

              <div className="rounded border border-[#222] bg-[#050505] p-3">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
                  Your Namespace
                </div>
                <div className="font-mono text-sm text-white">
                  {domainName ? String(domainName) : (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "---")}
                </div>
                {!domainName && (
                  <div className="mt-1 text-[10px] text-nexid-muted">
                    No .id domain detected. Your namespace will use a shortened wallet address.
                  </div>
                )}
              </div>

              {onboardingError && (
                <p className="text-xs text-red-500">{onboardingError}</p>
              )}

              <button
                type="button"
                onClick={handleOnboarding}
                disabled={onboardingSubmitting || !orgNameInput.trim()}
                className="w-full rounded-lg bg-nexid-gold py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {onboardingSubmitting ? "Creating Profile..." : "Create Partner Profile"}
              </button>

              <button
                type="button"
                onClick={() => { logout(); setAuthToken(null); authAttempted.current = false; }}
                className="w-full rounded border border-[#333] py-2 text-xs text-nexid-muted hover:text-white"
              >
                Disconnect Wallet
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================
     RENDER: MAIN CONSOLE (authenticated partner)
     ================================================================ */
  return (
    <div className="nexid-console h-screen w-full overflow-hidden bg-nexid-base">
      <div className="h-full w-full active" id="app-layout">
        {sidebarOpen ? (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden"
          />
        ) : null}

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[#1a1a1a] bg-[#050505] transition-transform duration-300 ease-in-out md:static md:w-64 ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-[#1a1a1a] px-6">
            <Link href="/" className="font-display text-xl font-bold tracking-tighter">
              NexID<span className="text-nexid-gold">.</span>{" "}
              <span className="ml-2 rounded border border-[#333] px-1.5 py-0.5 font-mono text-[9px] font-normal tracking-widest text-nexid-muted">
                B2B
              </span>
            </Link>
            <button type="button" className="text-nexid-muted md:hidden" onClick={() => setSidebarOpen(false)}>
              X
            </button>
          </div>

          <div className="p-6 pb-2">
            <div className="shadow-inner-glaze flex items-center gap-3 rounded-lg border border-[#222] bg-[#0a0a0a] p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#333] bg-[#111] text-[10px] font-bold text-white">
                {orgInitials}
              </div>
              <div>
                <div className="text-xs font-bold text-white">{partner?.orgName}</div>
                <div className="font-mono text-[10px] text-nexid-muted">{displayName}</div>
              </div>
            </div>
          </div>

          <nav className="custom-scroll flex-1 space-y-1 overflow-y-auto px-4 py-6">
            <div className="mb-3 px-2 font-mono text-[9px] uppercase tracking-widest text-nexid-muted">Platform</div>
            <NavItem label="Dashboard" active={view === "dashboard"} onClick={() => goView("dashboard")} />
            <NavItem label="Live Analytics" active={view === "analytics"} onClick={() => goView("analytics")} />
            <div className="mb-3 mt-8 px-2 font-mono text-[9px] uppercase tracking-widest text-nexid-muted">Campaigns</div>
            <NavItem label="Draft Review" active={view === "review"} onClick={() => goView("review")} />
            <NavItem label="New Campaign" active={view === "brief"} onClick={() => goView("brief")} />
          </nav>

          <div className="border-t border-[#1a1a1a] p-4">
            <button
              type="button"
              onClick={() => { logout(); setAuthToken(null); setPartner(null); authAttempted.current = false; }}
              className="w-full rounded border border-[#333] py-2 text-xs text-nexid-muted hover:text-white"
            >
              Disconnect
            </button>
          </div>
        </aside>

        <main className="custom-scroll relative flex h-full flex-1 flex-col overflow-y-auto bg-[#030303]">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#1a1a1a] bg-[#030303]/90 px-6 backdrop-blur-md lg:px-8">
            <div className="flex items-center gap-4">
              <button type="button" className="text-white md:hidden" onClick={() => setSidebarOpen(true)}>
                ☰
              </button>
              <h2 className="text-sm font-medium text-white">{VIEW_TITLES[view]}</h2>
            </div>
            <div className="flex items-center gap-2 rounded border border-green-500/20 bg-green-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-green-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              Subgraph Synced
            </div>
          </header>

          {/* ========== DASHBOARD ========== */}
          {view === "dashboard" ? (
            <section className="mx-auto w-full max-w-6xl space-y-8 p-6 lg:p-8">
              <div>
                <h1 className="font-display mb-1 text-2xl text-white">Partner Overview</h1>
                <p className="text-sm text-nexid-muted">Track the performance of your active educational campaigns.</p>
                {requestSuccess ? <p className="mt-2 text-xs text-green-400">{requestSuccess}</p> : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="Total Enrollments"
                  value={summary ? summary.totalEnrollments.toLocaleString() : "0"}
                  sub={`${summary?.totalCampaigns ?? 0} campaign(s)`}
                  highlight
                />
                <MetricCard
                  label="Completion Rate"
                  value={summary ? `${summary.completionRate}%` : "0%"}
                  sub={`${summary?.totalCompleted ?? 0} completed`}
                />
                <MetricCard
                  label="Live Campaigns"
                  value={summary ? String(summary.liveCampaigns) : "0"}
                  sub="Currently active"
                />
                <MetricCard
                  label="Active Prize Pool"
                  value={summary ? `$${(Number(summary.totalPrizePoolUsdc) / 1000).toFixed(1)}k` : "$0"}
                  sub="USDC Total"
                  gold
                />
              </div>

              <div>
                <h3 className="mb-4 text-sm font-medium text-white">Campaign Management</h3>
                <div className="premium-panel custom-scroll overflow-x-auto bg-[#0a0a0a]">
                  <table className="min-w-[760px] w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#222] bg-[#111]">
                        <th className="p-4 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Campaign Name</th>
                        <th className="p-4 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Status</th>
                        <th className="p-4 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Enrollments</th>
                        <th className="p-4 text-right font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-sm text-nexid-muted">
                            No campaigns yet. Submit a new campaign request to get started.
                          </td>
                        </tr>
                      ) : (
                        campaigns.map((c) => (
                          <tr key={c.id} className="border-b border-[#1a1a1a]">
                            <td className={`p-4 font-medium ${c.status === "ENDED" || c.status === "ARCHIVED" ? "text-white/60" : "text-white"}`}>
                              {c.title}
                            </td>
                            <td className="p-4">
                              <span className={`rounded border px-2 py-1 text-[10px] uppercase tracking-wider ${statusBadge(c.status)}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="p-4 font-mono text-nexid-muted">
                              {c.participantCount > 0 ? c.participantCount.toLocaleString() : "-"}
                            </td>
                            <td className="p-4 text-right">
                              {c.status === "LIVE" ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCampaignId(c.id);
                                    goView("analytics");
                                  }}
                                  className="rounded border border-[#333] bg-[#222] px-4 py-1.5 text-xs font-medium text-white"
                                >
                                  View Telemetry
                                </button>
                              ) : c.status === "DRAFT" ? (
                                <button type="button" onClick={() => goView("review")} className="rounded bg-nexid-gold px-4 py-1.5 text-xs font-bold text-black">
                                  Review Studio
                                </button>
                              ) : c.status === "ENDED" ? (
                                <button type="button" onClick={() => setRewardOpen(true)} className="rounded border border-nexid-gold px-4 py-1.5 text-xs font-bold text-nexid-gold hover:bg-nexid-gold hover:text-black">
                                  Distribute Rewards
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}

          {/* ========== ANALYTICS ========== */}
          {view === "analytics" ? (
            <section className="mx-auto w-full max-w-[1400px] space-y-6 p-6 lg:p-8">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-nexid-gold">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-nexid-gold" />
                    Live Telemetry
                  </div>
                  {liveCampaigns.length > 0 ? (
                    <select
                      value={selectedCampaignId ?? ""}
                      onChange={(e) => setSelectedCampaignId(Number(e.target.value) || null)}
                      className="b2b-input rounded border border-[#222] bg-[#0a0a0a] px-3 py-2 text-sm text-white"
                    >
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>{c.title} ({c.status})</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm text-nexid-muted">No campaigns available</div>
                  )}
                </div>
              </div>

              {selectedCampaignId ? (() => {
                const sel = campaigns.find((c) => c.id === selectedCampaignId);
                return sel ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      <MetricTile label="Enrollments" value={sel.participantCount.toLocaleString()} />
                      <MetricTile label="Completed" value={sel.completedCount.toLocaleString()} />
                      <MetricTile label="Top Score" value={sel.topScore.toLocaleString()} />
                      <MetricTile label="Prize Pool" value={`$${(Number(sel.prizePoolUsdc) / 1000).toFixed(1)}k`} />
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <div className="premium-panel h-[380px] overflow-hidden bg-[#0a0a0a]">
                        <div className="flex items-center justify-between border-b border-[#1a1a1a] bg-[#111] p-5">
                          <h3 className="text-sm font-medium text-white">Top Performers</h3>
                          <span className="font-mono text-[10px] text-nexid-muted">SCORE</span>
                        </div>
                        <div className="custom-scroll h-[280px] overflow-y-auto bg-[#050505] p-2">
                          {top10.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-nexid-muted">No participants yet</div>
                          ) : (
                            top10.map((row, i) => (
                              <div key={i} className="flex items-center justify-between rounded border-b border-[#1a1a1a] p-2.5 text-xs">
                                <div className="flex items-center gap-3">
                                  <span className={`w-4 text-center font-mono ${(row.rank ?? i + 1) <= 3 ? `rank-${row.rank ?? i + 1}` : "text-nexid-muted"}`}>
                                    {row.rank ?? i + 1}
                                  </span>
                                  <span className="text-white/90">
                                    {row.walletAddress.slice(0, 6)}...{row.walletAddress.slice(-4)}
                                  </span>
                                </div>
                                <span className="font-mono text-nexid-muted">{row.score.toLocaleString()} pts</span>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="border-t border-[#1a1a1a] bg-[#111] p-3">
                          <button type="button" onClick={() => setLedgerOpen(true)} className="w-full rounded border border-[#333] py-2 text-xs text-white hover:bg-[#222]">
                            View Complete Ledger
                          </button>
                        </div>
                      </div>

                      <div className="premium-panel h-[380px] overflow-hidden bg-[#0a0a0a] p-6">
                        <h3 className="mb-6 border-b border-[#1a1a1a] pb-4 text-sm font-medium text-white">Campaign Stats</h3>
                        <div className="space-y-6">
                          <div>
                            <div className="mb-1.5 flex justify-between text-xs">
                              <span className="text-white">Enrollment to Completion</span>
                              <span className="font-mono text-nexid-muted">
                                {sel.participantCount > 0 ? Math.round((sel.completedCount / sel.participantCount) * 100) : 0}%
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded bg-[#111]">
                              <div
                                className="h-full rounded bg-nexid-gold"
                                style={{ width: `${sel.participantCount > 0 ? Math.round((sel.completedCount / sel.participantCount) * 100) : 0}%` }}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="rounded border border-[#222] bg-[#050505] p-4">
                              <div className="mb-1 font-mono text-[10px] text-nexid-muted">Total Enrolled</div>
                              <div className="font-display text-xl text-white">{sel.participantCount.toLocaleString()}</div>
                            </div>
                            <div className="rounded border border-[#222] bg-[#050505] p-4">
                              <div className="mb-1 font-mono text-[10px] text-nexid-muted">Completed</div>
                              <div className="font-display text-xl text-white">{sel.completedCount.toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null;
              })() : (
                <div className="flex h-64 items-center justify-center text-sm text-nexid-muted">
                  Select a campaign to view telemetry data.
                </div>
              )}
            </section>
          ) : null}

          {/* ========== BRIEF (new campaign wizard) ========== */}
          {view === "brief" ? (
            <section className="mx-auto w-full max-w-4xl space-y-8 p-6 lg:p-8">
              <div>
                <h1 className="font-display mb-1 text-2xl text-white">Architect New Campaign</h1>
                <p className="text-sm text-nexid-muted">Submit protocol requirements to the curriculum team. Minimum deployment pool is $15,000 USDC.</p>
              </div>

              <div className="relative flex items-center justify-between px-4">
                <div className="absolute left-4 right-4 top-1/2 -z-10 h-0.5 -translate-y-1/2 bg-[#222]" />
                <div className={`absolute left-4 top-1/2 -z-10 h-0.5 -translate-y-1/2 bg-nexid-gold transition-all ${stepProgress}`} />
                {[1, 2, 3].map((n) => (
                  <div key={n} className="flex flex-col items-center gap-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${wizardStep >= n ? "bg-nexid-gold text-black" : "border border-[#333] bg-[#111] text-nexid-muted"}`}>{n}</div>
                  </div>
                ))}
              </div>

              {wizardStep === 1 ? (
                <div className="premium-panel space-y-6 bg-[#0a0a0a] p-6 lg:p-8">
                  <Field label="Campaign Title" placeholder="e.g., Advanced Tokenomics Architecture" value={campaignTitle} onChange={setCampaignTitle} />
                  <Field label="Primary Objective" placeholder="Protocol Education & Awareness" value={primaryObjective} onChange={setPrimaryObjective} />
                  <div className="flex justify-end border-t border-[#1a1a1a] pt-6">
                    <button type="button" onClick={() => setWizardStep(2)} disabled={!campaignTitle.trim() || !primaryObjective.trim()} className="rounded-lg bg-white px-8 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50">
                      Continue
                    </button>
                  </div>
                </div>
              ) : null}

              {wizardStep === 2 ? (
                <div className="premium-panel space-y-8 bg-[#0a0a0a] p-6 lg:p-8">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <TierPick name="Standard" value="$15k" active={tier === "standard"} onClick={() => setTier("standard")} />
                    <TierPick name="Premium" value="$50k" active={tier === "premium"} onClick={() => setTier("premium")} />
                    <TierPick name="Ecosystem" value="$100k+" active={tier === "ecosystem"} onClick={() => setTier("ecosystem")} />
                  </div>
                  <label className="upload-area block cursor-pointer rounded-xl bg-[#050505] p-8 text-center text-sm text-nexid-muted">
                    <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => setBriefFileName(e.target.files?.[0]?.name ?? null)} />
                    {briefFileName ? `Uploaded: ${briefFileName}` : "Click to upload PDF or DOCX"}
                  </label>
                  <div>
                    <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-nexid-muted">Exact Prize Pool (USDC)</label>
                    <input type="number" min={15000} value={prizePool} onChange={(e) => setPrizePool(Number(e.target.value))} className={`b2b-input w-full px-4 py-3 text-sm font-mono ${prizePool < 15000 ? "border-red-500" : ""}`} />
                    {prizePool < 15000 ? <p className="mt-1 text-[10px] text-red-500">Minimum deployment pool is $15,000.</p> : null}
                  </div>
                  <div className="flex justify-between border-t border-[#1a1a1a] pt-6">
                    <button type="button" onClick={() => setWizardStep(1)} className="rounded-lg border border-[#333] px-6 py-3 text-sm text-white">Back</button>
                    <button type="button" onClick={() => prizePool >= 15000 && setCallBookingOpen(true)} className="rounded-lg bg-white px-8 py-3 text-sm font-bold text-black">
                      Finalize & Book Call
                    </button>
                  </div>
                </div>
              ) : null}

              {wizardStep === 3 ? (
                <div className="premium-panel bg-[#0a0a0a] p-6 lg:p-8">
                  <h3 className="font-display mb-2 text-2xl text-white">Schedule Strategy Call</h3>
                  <p className="mb-8 text-sm text-nexid-muted">Finalize smart contract integrations with the curriculum team.</p>
                  <div className="mb-6 rounded-lg border border-[#222] bg-[#050505] p-4 text-xs text-white/80">
                    <div className="mb-1 font-mono uppercase tracking-wider text-nexid-gold">Booked Slot</div>
                    <div>{callBookedFor || "No date"} at {callTimeSlot || "No time"} ({callTimezone})</div>
                    {callBookingNotes.trim() ? <div className="mt-2 text-nexid-muted">Notes: {callBookingNotes.trim()}</div> : null}
                    <button type="button" className="mt-3 rounded border border-[#333] px-3 py-1 text-[10px] uppercase tracking-widest text-white hover:bg-[#111]" onClick={() => setCallBookingOpen(true)}>
                      Edit Call
                    </button>
                  </div>
                  {requestError ? <p className="mb-4 text-xs text-red-500">{requestError}</p> : null}
                  {requestSuccess ? <p className="mb-4 text-xs text-green-400">{requestSuccess}</p> : null}
                  <div className="flex justify-between">
                    <button type="button" onClick={() => setWizardStep(2)} className="rounded-lg border border-[#333] px-6 py-3 text-sm text-white">Back</button>
                    <button type="button" onClick={submitCampaignRequest} disabled={submittingRequest || !callBookedFor || !callTimeSlot} className="rounded-lg bg-nexid-gold px-8 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50">
                      {submittingRequest ? "Submitting..." : "Submit Campaign Request"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* ========== REVIEW ========== */}
          {view === "review" ? (
            <section className="flex h-[calc(100vh-64px)] flex-col">
              <div className="flex items-center justify-between border-b border-red-500/20 bg-red-500/10 px-6 py-2.5 text-sm text-white">
                <div><strong>Action Required:</strong> Please review Module 1.</div>
                <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-1 font-mono text-xs text-red-500">
                  Auto-Approves in 71:42:15
                </div>
              </div>
              <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
                <div className="flex flex-1 flex-col items-center justify-center bg-[#050505] p-6">
                  <div className="mb-4 text-sm text-white">Timeline Review</div>
                  <div ref={timelineRef} onClick={handleTimelineClick} className="premium-panel relative h-52 w-full max-w-3xl cursor-crosshair border border-[#222] bg-[#0a0a0a]">
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 border-t border-white/5 bg-gradient-to-t from-black/90 px-4">
                      <div className="relative mt-4 h-1.5 rounded-full bg-white/20">
                        <div className="h-full w-[30%] rounded-full bg-nexid-gold" />
                        {pin ? <div className="video-pin" style={{ left: `${pin.percent}%` }} /> : null}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="custom-scroll h-80 w-full overflow-y-auto border-l border-[#1a1a1a] bg-[#0a0a0a] p-4 lg:h-full lg:w-80">
                  <div className="mb-3 text-xs uppercase tracking-widest text-nexid-muted">Timestamped Notes</div>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-[#222] bg-[#111] p-3 text-sm text-white/80">
                      Draft generated from your upload. Verify AMM curve at 01:24.
                    </div>
                    {pin ? (
                      <div className="rounded-lg border border-nexid-gold/30 bg-[#050505] p-3 text-sm text-white/80">
                        Feedback pinned at {pin.time}.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </main>
      </div>

      {/* ========== MODALS ========== */}
      {rewardOpen ? (
        <Modal onClose={() => setRewardOpen(false)} title="Final Settlement Execution">
          <p className="mb-4 text-sm text-nexid-muted">Execute distribution for this campaign.</p>
          <button type="button" className="rounded-lg bg-green-500 px-6 py-2 text-sm font-bold text-black">
            Sign Transaction & Execute
          </button>
        </Modal>
      ) : null}

      {ledgerOpen ? (
        <Modal onClose={() => setLedgerOpen(false)} title="Campaign Ledger">
          <div className="custom-scroll max-h-[60vh] space-y-2 overflow-y-auto">
            {leaderboard.length === 0 ? (
              <div className="p-8 text-center text-sm text-nexid-muted">No participants yet</div>
            ) : (
              leaderboard.map((row, i) => (
                <div key={i} className="flex items-center justify-between rounded border border-[#222] bg-[#050505] p-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 text-center font-mono ${(row.rank ?? i + 1) <= 3 ? `rank-${row.rank ?? i + 1}` : "text-nexid-muted"}`}>
                      {row.rank ?? i + 1}
                    </span>
                    <span className="text-white/90">
                      {row.walletAddress.slice(0, 6)}...{row.walletAddress.slice(-4)}
                    </span>
                  </div>
                  <span className="font-mono text-nexid-muted">{row.score.toLocaleString()} pts</span>
                </div>
              ))
            )}
          </div>
        </Modal>
      ) : null}

      {callBookingOpen ? (
        <Modal onClose={() => setCallBookingOpen(false)} title="Book Strategy Call">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Call Date</label>
              <input type="date" value={callBookedFor} onChange={(e) => setCallBookedFor(e.target.value)} className="b2b-input w-full px-4 py-3 text-sm" />
            </div>
            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Time Slot</label>
              <div className="grid grid-cols-2 gap-2">
                {CALL_TIME_SLOTS.map((slot) => (
                  <button key={slot} type="button" onClick={() => setCallTimeSlot(slot)} className={`rounded border px-3 py-2 text-xs ${callTimeSlot === slot ? "border-nexid-gold bg-nexid-gold/10 text-nexid-gold" : "border-[#333] bg-[#111] text-white"}`}>
                    {slot}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Timezone</label>
              <select value={callTimezone} onChange={(e) => setCallTimezone(e.target.value)} className="b2b-input w-full px-4 py-3 text-sm">
                <option value="EST">EST (UTC-5)</option>
                <option value="UTC">UTC</option>
                <option value="PST">PST (UTC-8)</option>
                <option value="CET">CET (UTC+1)</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Call Notes (Optional)</label>
              <textarea value={callBookingNotes} onChange={(e) => setCallBookingNotes(e.target.value)} className="b2b-input h-24 w-full resize-none px-4 py-3 text-sm" placeholder="What should we focus on during the call?" />
            </div>
            <div className="flex justify-end gap-3 border-t border-[#1a1a1a] pt-4">
              <button type="button" onClick={() => setCallBookingOpen(false)} className="rounded border border-[#333] px-4 py-2 text-xs text-white">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  if (!callBookedFor || !callTimeSlot) { setRequestError("Select date and time slot to continue."); return; }
                  setRequestError(null);
                  setCallBookingOpen(false);
                  setWizardStep(3);
                }}
                className="rounded bg-nexid-gold px-4 py-2 text-xs font-bold text-black"
              >
                Save Booking
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ============================== sub-components ============================== */

function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-all ${active ? "border-[#222] bg-[#111] text-white" : "border-transparent text-nexid-muted hover:bg-[#111]/50 hover:text-white"
        }`}
    >
      {label}
    </button>
  );
}

function MetricCard({ label, value, sub, highlight = false, gold = false }: { label: string; value: string; sub: string; highlight?: boolean; gold?: boolean }) {
  return (
    <div className={`premium-panel p-5 ${gold ? "border-nexid-gold/30" : ""}`}>
      <div className={`mb-2 font-mono text-[10px] uppercase tracking-widest ${gold ? "text-nexid-gold" : "text-nexid-muted"}`}>{label}</div>
      <div className="font-display mb-1 text-3xl text-white">{value}</div>
      <div className={`text-xs ${highlight ? "text-green-400" : "text-nexid-muted"}`}>{sub}</div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="premium-panel bg-[#0a0a0a] p-4">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">{label}</div>
      <div className="font-display text-2xl text-white">{value}</div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-nexid-muted">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="b2b-input w-full px-4 py-3 text-sm" />
    </div>
  );
}

function TierPick({ name, value, active, onClick }: { name: string; value: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`tier-card rounded-xl p-4 text-center ${active ? "active bg-[#050505]" : "bg-[#111]"}`}>
      <div className="mb-1 text-xs font-bold text-white">{name}</div>
      <div className="font-display text-lg text-nexid-gold">{value}</div>
    </button>
  );
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: ReactNode }) {
  return (
    <div className="modal-overlay active fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-content relative w-full max-w-2xl rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-xl text-white">{title}</h3>
          <button type="button" onClick={onClose} className="rounded border border-[#222] bg-[#111] px-2 py-1 text-nexid-muted">X</button>
        </div>
        {children}
      </div>
    </div>
  );
}
