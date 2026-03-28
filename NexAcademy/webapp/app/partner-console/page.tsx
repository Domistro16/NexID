"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSignMessage } from "wagmi";
import { useENSName } from "@/hooks/getPrimaryName";
import { PARTNER_CALL_SLOT_DEFINITIONS } from "@/lib/partner-call-slots";
import {
  PARTNER_CAMPAIGN_PLAN_OPTIONS,
  PARTNER_CAMPAIGN_PLANS,
  formatPartnerCampaignPlan,
  type PartnerCampaignPlanId,
} from "@/lib/partner-campaign-plans";

type ConsoleView =
  | "dashboard"
  | "campaigns"
  | "leaderboard"
  | "briefs"
  | "payouts"
  | "contracts"
  | "settings"
  | "analytics";

type LeaderboardTab = "selected" | "aggregate";

const VIEW_TITLES: Record<ConsoleView, string> = {
  dashboard: "Dashboard",
  campaigns: "All Campaigns",
  leaderboard: "Leaderboard",
  analytics: "Campaign Analytics",
  briefs: "Campaign Briefs",
  payouts: "Payouts",
  contracts: "Contract Whitelist",
  settings: "Settings",
};

const TIER_OPTIONS = PARTNER_CAMPAIGN_PLAN_OPTIONS.map((plan) => ({
  id: plan.id,
  label: plan.label,
  hint:
    `${plan.marketingLabel} • Min $${plan.minPrizePoolUsdc.toLocaleString()}` +
    (plan.rewardPoolCadence === "MONTHLY" ? " / month" : ""),
}));

const REQUIREMENT_ITEMS = [
  "Bot exclusion reporting requires campaign-level verdicts and reason codes from the verification pipeline.",
  "Retention comparison needs a persisted benchmark series for NexID campaigns vs legacy partner campaigns.",
  "Brief asset uploads need a signed upload endpoint plus durable storage for attachments and docs.",
  "Self-serve payouts need a partner-scoped settlement route with contract execution and audit guards.",
] as const;

const COMMON_TIMEZONES = [
  "UTC",
  "Africa/Lagos",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
] as const;

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const CURRENCY_PRECISE_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface PartnerProfile {
  id: string;
  orgName: string;
  namespace: string;
}

interface DashboardSummary {
  totalCampaigns: number;
  liveCampaigns: number;
  totalParticipants: number;
  totalCompleted: number;
  completionRate: number;
  totalPrizePoolUsdc: string;
  totalDistributedUsdc: string;
  totalRecipients: number;
  pendingRequests: number;
  approvedRequests: number;
}

interface DashboardCampaign {
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
  coverImageUrl: string | null;
  status: string;
  isPublished: boolean;
  startAt: string | null;
  endAt: string | null;
  requestId: string | null;
  createdAt: string;
  updatedAt: string;
  participantCount: number;
  completedCount: number;
  topScore: number;
  averageScore: number;
  distributionCount: number;
  recipientCount: number;
  totalDistributedUsdc: string;
  lastDistributedAt: string | null;
}

interface DashboardRequest {
  id: string;
  campaignTitle: string;
  primaryObjective: string;
  tier: string;
  prizePoolUsdc: string;
  briefFileName: string | null;
  callBookedFor: string | null;
  callTimeSlot: string | null;
  callTimezone: string | null;
  callBookingNotes: string | null;
  status: string;
  reviewNotes: string | null;
  linkedCampaignId: number | null;
  linkedCampaignSlug: string | null;
  linkedCampaignTitle: string | null;
  linkedCampaignStatus: string | null;
  linkedCampaignPublished: boolean | null;
  linkedCampaignCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PayoutRecord {
  id: string;
  campaignId: number;
  campaignTitle: string;
  totalDistributedUsdc: string;
  recipientCount: number;
  txHash: string | null;
  createdAt: string;
}

interface AggregateLeaderboardRow {
  walletAddress: string;
  totalScore: number;
  campaignCount: number;
  completedCount: number;
  totalRewardAmountUsdc: string;
  bestRank: number | null;
}

interface CampaignLeaderboardRow {
  rank: number | null;
  score: number;
  rewardAmountUsdc: string | null;
  walletAddress: string;
}

interface CallSlot {
  id: string;
  label: string;
  startAt: string | null;
  endAt: string | null;
  available: boolean;
}

interface CallSlotDay {
  date: string;
  slots: CallSlot[];
}

interface DashboardResponse {
  partner: PartnerProfile;
  campaigns: DashboardCampaign[];
  requests: DashboardRequest[];
  payouts: PayoutRecord[];
  aggregateLeaderboard: AggregateLeaderboardRow[];
  featuredCampaignId: number | null;
  summary: DashboardSummary;
}

interface CallSlotsResponse {
  rangeStart: string;
  rangeEnd: string;
  days: CallSlotDay[];
}

function authHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatCurrency(value: number | string, precise = false) {
  const amount = Number(value || 0);
  return (precise ? CURRENCY_PRECISE_FORMATTER : CURRENCY_FORMATTER).format(amount);
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "TBD";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(
  value: string | Date | null | undefined,
  timeZone = "UTC",
) {
  if (!value) return "Not scheduled";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    }).format(date);
  }
}

function shortAddress(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatTierLabel(value: string) {
  return formatPartnerCampaignPlan(value);
}

function statusBadgeClasses(status: string) {
  if (status === "LIVE") return "border-green-500/30 bg-green-500/10 text-green-400";
  if (status === "DRAFT") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "ENDED") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  if (status === "ARCHIVED") return "border-[#333] bg-[#161616] text-[#9a9a9a]";
  if (status === "APPROVED") return "border-green-500/30 bg-green-500/10 text-green-400";
  if (status === "REJECTED") return "border-red-500/30 bg-red-500/10 text-red-400";
  return "border-[#333] bg-[#161616] text-[#b5b5b5]";
}

function formatRequestStatus(status: string) {
  if (status === "PENDING") return "Pending Review";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return status;
}

function getCallSlotLocalLabel(slot: CallSlot, timeZone: string) {
  if (!slot.startAt) return slot.label;

  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(new Date(slot.startAt));
  } catch {
    return slot.label;
  }
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null>>) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          if (value.includes(",") || value.includes('"') || value.includes("\n")) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export default function PartnerConsolePage() {
  const { login, ready, authenticated, logout } = usePrivy();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { name: domainName } = useENSName({ owner: address as `0x${string}` });

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authAttempted, setAuthAttempted] = useState(false);

  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [orgNameInput, setOrgNameInput] = useState("");
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<ConsoleView>("dashboard");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [campaigns, setCampaigns] = useState<DashboardCampaign[]>([]);
  const [requests, setRequests] = useState<DashboardRequest[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [aggregateLeaderboard, setAggregateLeaderboard] = useState<
    AggregateLeaderboardRow[]
  >([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [analyticsCampaignId, setAnalyticsCampaignId] = useState<number | null>(null);
  const [leaderboardTab, setLeaderboardTab] =
    useState<LeaderboardTab>("selected");
  const [campaignLeaderboard, setCampaignLeaderboard] = useState<
    CampaignLeaderboardRow[]
  >([]);
  const [campaignLeaderboardLoading, setCampaignLeaderboardLoading] =
    useState(false);

  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [primaryObjective, setPrimaryObjective] = useState("");
  const [tier, setTier] = useState<PartnerCampaignPlanId>("LAUNCH_SPRINT");
  const [prizePool, setPrizePool] = useState(
    PARTNER_CAMPAIGN_PLANS.LAUNCH_SPRINT.minPrizePoolUsdc,
  );
  const [briefReference, setBriefReference] = useState("");
  const [callSlotDays, setCallSlotDays] = useState<CallSlotDay[]>([]);
  const [callSlotsLoading, setCallSlotsLoading] = useState(false);
  const [callSlotsError, setCallSlotsError] = useState<string | null>(null);
  const [callBookedFor, setCallBookedFor] = useState("");
  const [callTimeSlot, setCallTimeSlot] = useState("");
  const [callTimezone, setCallTimezone] = useState("UTC");
  const [callBookingNotes, setCallBookingNotes] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserZone) {
      setCallTimezone(browserZone);
    }
  }, []);

  useEffect(() => {
    const minimumPrizePool = PARTNER_CAMPAIGN_PLANS[tier].minPrizePoolUsdc;
    setPrizePool((current) => (current < minimumPrizePool ? minimumPrizePool : current));
  }, [tier]);

  const timeZoneOptions = useMemo(() => {
    if (COMMON_TIMEZONES.includes(callTimezone as (typeof COMMON_TIMEZONES)[number])) {
      return COMMON_TIMEZONES;
    }
    return [callTimezone, ...COMMON_TIMEZONES];
  }, [callTimezone]);

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
    } catch (error) {
      console.error("Partner auth error:", error);
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, isAuthenticating, signMessageAsync]);

  useEffect(() => {
    if (!ready || !authenticated || !isConnected || !address) return;

    const existing = localStorage.getItem("auth_token");
    if (existing) {
      setAuthToken(existing);
      return;
    }

    if (authAttempted) return;
    setAuthAttempted(true);
    void authenticate();
  }, [address, authAttempted, authenticate, authenticated, isConnected, ready]);

  useEffect(() => {
    if (!authToken) return;

    setPartnerLoading(true);
    fetch("/api/partner/profile", { headers: authHeaders() })
      .then(async (response) => {
        if (response.status === 404) {
          setNeedsOnboarding(true);
          setPartner(null);
          return;
        }

        if (!response.ok) return;
        const data = await response.json();
        setPartner(data.partner ?? null);
        setNeedsOnboarding(false);
      })
      .catch((error) => {
        console.error("Partner profile fetch error:", error);
      })
      .finally(() => setPartnerLoading(false));
  }, [authToken]);

  const fetchDashboard = useCallback(async () => {
    if (!authToken) return;

    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const response = await fetch("/api/partner/dashboard", {
        headers: authHeaders(),
      });
      const data = (await response.json()) as DashboardResponse & { error?: string };

      if (!response.ok) {
        setDashboardError(data.error || "Failed to load partner dashboard.");
        return;
      }

      setCampaigns(data.campaigns ?? []);
      setRequests(data.requests ?? []);
      setPayouts(data.payouts ?? []);
      setAggregateLeaderboard(data.aggregateLeaderboard ?? []);
      setSummary(data.summary ?? null);
      setSelectedCampaignId((current) => {
        if (current && data.campaigns.some((campaign) => campaign.id === current)) {
          return current;
        }
        return data.featuredCampaignId ?? data.campaigns[0]?.id ?? null;
      });
    } catch {
      setDashboardError("Failed to load partner dashboard.");
    } finally {
      setDashboardLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (!partner || !authToken) return;
    void fetchDashboard();
  }, [authToken, fetchDashboard, partner]);

  useEffect(() => {
    if (!selectedCampaignId || !authToken) {
      setCampaignLeaderboard([]);
      return;
    }

    setCampaignLeaderboardLoading(true);
    fetch(`/api/partner/campaigns/${selectedCampaignId}/leaderboard`, {
      headers: authHeaders(),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          setCampaignLeaderboard([]);
          return;
        }
        setCampaignLeaderboard(data.leaderboard ?? []);
      })
      .catch(() => {
        setCampaignLeaderboard([]);
      })
      .finally(() => setCampaignLeaderboardLoading(false));
  }, [authToken, selectedCampaignId]);

  const fetchCallSlots = useCallback(async () => {
    if (!authToken) return;

    setCallSlotsLoading(true);
    setCallSlotsError(null);
    try {
      const response = await fetch("/api/partner/call-slots?days=14", {
        headers: authHeaders(),
      });
      const data = (await response.json()) as CallSlotsResponse & { error?: string };

      if (!response.ok) {
        setCallSlotsError(data.error || "Failed to load call slots.");
        return;
      }

      setCallSlotDays(data.days ?? []);
    } catch {
      setCallSlotsError("Failed to load call slots.");
    } finally {
      setCallSlotsLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (!newCampaignOpen || !partner || !authToken) return;
    void fetchCallSlots();
  }, [authToken, fetchCallSlots, newCampaignOpen, partner]);

  const availableCallDays = useMemo(
    () => callSlotDays.filter((day) => day.slots.some((slot) => slot.available)),
    [callSlotDays],
  );

  useEffect(() => {
    if (!newCampaignOpen) return;

    if (
      callBookedFor &&
      availableCallDays.some((day) => day.date === callBookedFor)
    ) {
      return;
    }

    setCallBookedFor(availableCallDays[0]?.date ?? "");
  }, [availableCallDays, callBookedFor, newCampaignOpen]);

  const selectedCallDay = useMemo(
    () => callSlotDays.find((day) => day.date === callBookedFor) ?? null,
    [callBookedFor, callSlotDays],
  );

  useEffect(() => {
    if (!selectedCallDay) {
      setCallTimeSlot("");
      return;
    }

    const slotStillAvailable = selectedCallDay.slots.some(
      (slot) => slot.id === callTimeSlot && slot.available,
    );

    if (!slotStillAvailable) {
      const firstAvailable = selectedCallDay.slots.find((slot) => slot.available);
      setCallTimeSlot(firstAvailable?.id ?? "");
    }
  }, [callTimeSlot, selectedCallDay]);

  async function handleOnboarding() {
    setOnboardingError(null);
    if (!orgNameInput.trim()) {
      setOnboardingError("Organization name is required.");
      return;
    }

    setOnboardingSubmitting(true);
    try {
      const response = await fetch("/api/partner/profile", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          orgName: orgNameInput.trim(),
          domainName: domainName || null,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
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

  async function submitCampaignRequest() {
    setRequestError(null);
    setRequestSuccess(null);

    if (!campaignTitle.trim()) {
      setRequestError("Campaign title is required.");
      return;
    }
    if (!primaryObjective.trim()) {
      setRequestError("Primary objective is required.");
      return;
    }
    if (prizePool < 15000) {
      setRequestError("Minimum deployment pool is $15,000.");
      return;
    }
    if (!callBookedFor) {
      setRequestError("Choose a strategy call date.");
      return;
    }
    if (!callTimeSlot) {
      setRequestError("Choose an available strategy call slot.");
      return;
    }

    setSubmittingRequest(true);
    try {
      const response = await fetch("/api/partner/campaign-requests", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          campaignTitle: campaignTitle.trim(),
          primaryObjective: primaryObjective.trim(),
          tier,
          prizePoolUsdc: prizePool,
          briefFileName: briefReference.trim() || null,
          callBookedFor,
          callTimeSlot,
          callTimezone,
          callBookingNotes: callBookingNotes.trim() || null,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setRequestError(data?.error || "Failed to submit campaign request.");
        if (response.status === 409) {
          await fetchCallSlots();
        }
        return;
      }

      setRequestSuccess(
        `Brief submitted for review. Request ID: ${data?.request?.id ?? "pending"}.`,
      );
      setCampaignTitle("");
      setPrimaryObjective("");
      setTier("LAUNCH_SPRINT");
      setPrizePool(PARTNER_CAMPAIGN_PLANS.LAUNCH_SPRINT.minPrizePoolUsdc);
      setBriefReference("");
      setCallBookingNotes("");
      setCallBookedFor("");
      setCallTimeSlot("");
      setNewCampaignOpen(false);
      await fetchDashboard();
      await fetchCallSlots();
      setView("briefs");
    } catch {
      setRequestError("Failed to submit campaign request.");
    } finally {
      setSubmittingRequest(false);
    }
  }

  const resetSession = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setAuthToken(null);
    setPartner(null);
    setNeedsOnboarding(false);
    setAuthAttempted(false);
    setCampaigns([]);
    setRequests([]);
    setPayouts([]);
    setAggregateLeaderboard([]);
    setCampaignLeaderboard([]);
    setSummary(null);
    setSelectedCampaignId(null);
  }, []);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  const featuredCampaign = useMemo(
    () =>
      selectedCampaign ??
      campaigns.find((campaign) => campaign.status === "LIVE") ??
      campaigns.find((campaign) => campaign.status === "DRAFT") ??
      campaigns[0] ??
      null,
    [campaigns, selectedCampaign],
  );

  const nextScheduledCall = useMemo(() => {
    return requests
      .filter((request) => request.callBookedFor && request.callTimeSlot)
      .sort((left, right) => {
        const leftDate = new Date(left.callBookedFor || "").getTime();
        const rightDate = new Date(right.callBookedFor || "").getTime();
        return leftDate - rightDate;
      })[0] ?? null;
  }, [requests]);

  const topCampaigns = useMemo(() => campaigns.slice(0, 5), [campaigns]);
  const recentRequests = useMemo(() => requests.slice(0, 4), [requests]);

  const canExport =
    (view === "dashboard" || view === "campaigns") && campaigns.length > 0
      ? true
      : view === "leaderboard"
        ? leaderboardTab === "selected"
          ? campaignLeaderboard.length > 0
          : aggregateLeaderboard.length > 0
        : view === "briefs"
          ? requests.length > 0
          : view === "payouts"
            ? payouts.length > 0 || campaigns.length > 0
            : false;

  function exportCurrentView() {
    if (!canExport) return;

    if (view === "leaderboard") {
      if (leaderboardTab === "selected") {
        downloadCsv(
          `${selectedCampaign?.slug ?? "campaign"}-leaderboard.csv`,
          [
            ["Rank", "Wallet", "Score", "Reward USDC"],
            ...campaignLeaderboard.map((row, index) => [
              row.rank ?? index + 1,
              row.walletAddress,
              row.score,
              row.rewardAmountUsdc ?? "",
            ]),
          ],
        );
        return;
      }

      downloadCsv("partner-console-global-leaderboard.csv", [
        ["Rank", "Wallet", "Total Score", "Campaigns", "Completed", "Reward USDC", "Best Rank"],
        ...aggregateLeaderboard.map((row, index) => [
          index + 1,
          row.walletAddress,
          row.totalScore,
          row.campaignCount,
          row.completedCount,
          row.totalRewardAmountUsdc,
          row.bestRank ?? "",
        ]),
      ]);
      return;
    }

    if (view === "briefs") {
      downloadCsv("partner-campaign-requests.csv", [
        ["Request ID", "Campaign", "Plan", "Prize Pool", "Status", "Call Date", "Call Slot", "Timezone"],
        ...requests.map((request) => [
          request.id,
          request.campaignTitle,
          request.tier,
          request.prizePoolUsdc,
          request.status,
          request.callBookedFor ?? "",
          request.callTimeSlot ?? "",
          request.callTimezone ?? "",
        ]),
      ]);
      return;
    }

    if (view === "payouts") {
      downloadCsv("partner-payout-history.csv", [
        ["Campaign", "Distributed USDC", "Recipients", "Tx Hash", "Created At"],
        ...payouts.map((payout) => [
          payout.campaignTitle,
          payout.totalDistributedUsdc,
          payout.recipientCount,
          payout.txHash ?? "",
          payout.createdAt,
        ]),
      ]);
      return;
    }

    downloadCsv("partner-campaigns.csv", [
      ["Campaign", "Status", "Plan", "Prize Pool", "Participants", "Completed", "Top Score"],
      ...campaigns.map((campaign) => [
        campaign.title,
        campaign.status,
        campaign.tier,
        campaign.prizePoolUsdc,
        campaign.participantCount,
        campaign.completedCount,
        campaign.topScore,
      ]),
    ]);
  }

  const displayName =
    partner?.namespace ??
    (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "");
  const orgInitials = partner?.orgName
    ? partner.orgName
        .split(" ")
        .map((part) => part.charAt(0))
        .join("")
        .slice(0, 3)
        .toUpperCase()
    : "---";

  if (!ready) {
    return (
      <div className="nexid-console flex h-screen w-full items-center justify-center bg-[#030303]">
        <div className="text-sm text-[#8f8f8f]">Loading partner console...</div>
      </div>
    );
  }

  if (!authenticated || !isConnected) {
    return (
      <div className="nexid-console h-screen w-full overflow-hidden bg-[#030303]">
        <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,176,0,0.08),transparent_45%)] px-6">
          <div className="w-full max-w-sm animate-[fadeUpConsole_0.8s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="mb-3 text-center font-display text-4xl font-black tracking-tighter text-white">
              NexID<span className="text-nexid-gold">.</span>
            </div>
            <div className="mx-auto mb-10 w-max rounded border border-[#202020] bg-[#0a0a0a] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#8f8f8f] shadow-inner-glaze">
              Partner Console
            </div>
            <div className="premium-panel space-y-5 p-6">
              <div className="text-center text-sm leading-6 text-[#a6a6a6]">
                Connect the wallet linked to your partner account to access campaign
                operations, request history, payout records, and strategy call scheduling.
              </div>
              <button
                type="button"
                onClick={login}
                className="w-full rounded-lg bg-nexid-gold py-3 text-sm font-bold text-black transition-opacity hover:opacity-90"
              >
                Connect Wallet
              </button>
              <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[#6f6f6f]">
                Privy authentication and wallet signature required
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticating || (!authToken && !partnerLoading)) {
    return (
      <div className="nexid-console flex h-screen w-full items-center justify-center bg-[#030303]">
        <div className="text-center">
          <div className="mb-3 font-display text-3xl text-white">
            NexID<span className="text-nexid-gold">.</span>
          </div>
          <div className="text-sm text-[#909090]">
            {isAuthenticating
              ? "Sign the message in your wallet to continue..."
              : "Initializing partner console..."}
          </div>
        </div>
      </div>
    );
  }

  if (partnerLoading) {
    return (
      <div className="nexid-console flex h-screen w-full items-center justify-center bg-[#030303]">
        <div className="text-sm text-[#8f8f8f]">Loading partner profile...</div>
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <div className="nexid-console h-screen w-full overflow-hidden bg-[#030303]">
        <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,176,0,0.08),transparent_45%)] px-6">
          <div className="w-full max-w-md animate-[fadeUpConsole_0.8s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="mb-3 text-center font-display text-4xl font-black tracking-tighter text-white">
              NexID<span className="text-nexid-gold">.</span>
            </div>
            <div className="mx-auto mb-8 w-max rounded border border-[#202020] bg-[#0a0a0a] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#8f8f8f] shadow-inner-glaze">
              Partner Onboarding
            </div>
            <div className="premium-panel space-y-6 p-6">
              <div>
                <div className="mb-1 text-xs text-[#8f8f8f]">Connected as</div>
                <div className="font-mono text-sm text-white">
                  {domainName
                    ? String(domainName)
                    : address
                      ? `${address.slice(0, 6)}...${address.slice(-4)}`
                      : ""}
                </div>
              </div>

              <div>
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8f8f8f]">
                  Organization / Partner Name
                </label>
                <input
                  type="text"
                  value={orgNameInput}
                  onChange={(event) => setOrgNameInput(event.target.value)}
                  placeholder="e.g. Hyperliquid"
                  className="b2b-input w-full px-4 py-3 text-sm"
                />
              </div>

              <div className="rounded-lg border border-[#1d1d1d] bg-[#050505] p-4">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8f8f8f]">
                  Namespace
                </div>
                <div className="font-mono text-sm text-white">
                  {domainName
                    ? String(domainName)
                    : address
                      ? `${address.slice(0, 6)}...${address.slice(-4)}`
                      : "---"}
                </div>
              </div>

              {onboardingError ? (
                <p className="text-xs text-red-400">{onboardingError}</p>
              ) : null}

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
                onClick={() => {
                  void logout();
                  resetSession();
                }}
                className="w-full rounded-lg border border-[#2a2a2a] py-3 text-sm text-[#a6a6a6] transition-colors hover:text-white"
              >
                Disconnect Wallet
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nexid-console min-h-screen w-full bg-[#020202]">
      {sidebarOpen ? (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#151515] bg-[#060606] transition-transform duration-300 ease-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#151515] px-5">
          <Link href="/" className="font-display text-xl font-bold tracking-tighter text-white">
            NexID<span className="text-nexid-gold">.</span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded border border-[#242424] px-2 py-1 text-xs text-[#8f8f8f] md:hidden"
          >
            X
          </button>
        </div>

        <div className="border-b border-[#151515] px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#727272]">
            Partner Workspace
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-nexid-gold/25 bg-nexid-gold/10 font-mono text-sm font-bold text-nexid-gold">
              {orgInitials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">
                {partner?.orgName ?? "Partner"}
              </div>
              <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[#7c7c7c]">
                {displayName}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <NavItem
            label="Dashboard"
            active={view === "dashboard"}
            note={summary ? `${summary.totalCampaigns}` : undefined}
            onClick={() => {
              setView("dashboard");
              setSidebarOpen(false);
            }}
          />
          <NavItem
            label="All Campaigns"
            active={view === "campaigns"}
            note={summary ? `${summary.liveCampaigns} live` : undefined}
            onClick={() => {
              setView("campaigns");
              setSidebarOpen(false);
            }}
          />
          <NavItem
            label="Leaderboard"
            active={view === "leaderboard"}
            note={selectedCampaign ? formatNumber(selectedCampaign.participantCount) : undefined}
            onClick={() => {
              setView("leaderboard");
              setSidebarOpen(false);
            }}
          />
          <NavItem
            label="Analytics"
            active={view === "analytics"}
            onClick={() => {
              setView("analytics");
              setSidebarOpen(false);
            }}
          />
          <NavItem
            label="Campaign Briefs"
            active={view === "briefs"}
            note={summary ? `${summary.pendingRequests} pending` : undefined}
            onClick={() => {
              setView("briefs");
              setSidebarOpen(false);
            }}
          />
          <NavItem
            label="Payouts"
            active={view === "payouts"}
            note={summary ? formatCurrency(summary.totalDistributedUsdc) : undefined}
            onClick={() => {
              setView("payouts");
              setSidebarOpen(false);
            }}
          />
          <NavItem
            label="Contract Whitelist"
            active={view === "contracts"}
            onClick={() => {
              setView("contracts");
              setSidebarOpen(false);
            }}
          />
          <NavItem
            label="Settings"
            active={view === "settings"}
            onClick={() => {
              setView("settings");
              setSidebarOpen(false);
            }}
          />
        </nav>

        <div className="border-t border-[#151515] p-3">
          <button
            type="button"
            onClick={() => {
              void logout();
              resetSession();
            }}
            className="w-full rounded-lg border border-[#242424] bg-[#0a0a0a] px-3 py-2 text-sm text-[#9d9d9d] transition-colors hover:text-white"
          >
            Disconnect Wallet
          </button>
        </div>
      </aside>

      <main className="md:ml-64">
        <div className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[#151515] bg-[#020202]/95 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded border border-[#242424] px-2 py-1 text-xs text-[#8f8f8f] md:hidden"
          >
            Menu
          </button>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#6f6f6f]">
              Partner Console
            </div>
            <h1 className="font-display text-xl text-white">{VIEW_TITLES[view]}</h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-green-400 sm:block">
              {summary?.liveCampaigns
                ? `${summary.liveCampaigns} live campaign${summary.liveCampaigns === 1 ? "" : "s"}`
                : `${summary?.pendingRequests ?? 0} pending brief${summary?.pendingRequests === 1 ? "" : "s"}`}
            </div>
            <button
              type="button"
              onClick={exportCurrentView}
              disabled={!canExport}
              className="rounded-lg border border-[#262626] bg-[#0a0a0a] px-3 py-2 text-xs text-white transition-colors hover:border-[#3a3a3a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                setRequestError(null);
                setRequestSuccess(null);
                setNewCampaignOpen(true);
              }}
              className="rounded-lg bg-nexid-gold px-3 py-2 text-xs font-bold text-black"
            >
              + New Campaign
            </button>
          </div>
        </div>

        <section className="custom-scroll min-h-[calc(100vh-64px)] overflow-y-auto p-4 md:p-6">
          {dashboardLoading ? (
            <div className="premium-panel flex min-h-[320px] items-center justify-center text-sm text-[#8f8f8f]">
              Loading partner dashboard...
            </div>
          ) : dashboardError ? (
            <div className="premium-panel min-h-[200px] p-6">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-red-400">
                Dashboard Error
              </div>
              <p className="text-sm text-white">{dashboardError}</p>
              <button
                type="button"
                onClick={() => void fetchDashboard()}
                className="mt-4 rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-white"
              >
                Retry
              </button>
            </div>
          ) : view === "dashboard" ? (
            <DashboardView
              summary={summary}
              campaigns={campaigns}
              featuredCampaign={featuredCampaign}
              nextScheduledCall={nextScheduledCall}
              topCampaigns={topCampaigns}
              recentRequests={recentRequests}
              onOpenCampaigns={() => setView("campaigns")}
              onOpenLeaderboard={(campaignId) => {
                setSelectedCampaignId(campaignId);
                setView("leaderboard");
              }}
              onOpenBriefs={() => setView("briefs")}
            />
          ) : view === "campaigns" ? (
            <CampaignsView
              campaigns={campaigns}
              onNewCampaign={() => setNewCampaignOpen(true)}
              onViewLeaderboard={(campaignId) => {
                setSelectedCampaignId(campaignId);
                setLeaderboardTab("selected");
                setView("leaderboard");
              }}
              onViewAnalytics={(campaignId) => {
                setAnalyticsCampaignId(campaignId);
                setView("analytics");
              }}
              onOpenBriefs={() => setView("briefs")}
            />
          ) : view === "leaderboard" ? (
            <LeaderboardView
              campaigns={campaigns}
              selectedCampaignId={selectedCampaignId}
              selectedCampaign={selectedCampaign}
              leaderboardTab={leaderboardTab}
              onSelectCampaign={(campaignId) => setSelectedCampaignId(campaignId)}
              onSelectTab={setLeaderboardTab}
              campaignLeaderboard={campaignLeaderboard}
              campaignLeaderboardLoading={campaignLeaderboardLoading}
              aggregateLeaderboard={aggregateLeaderboard}
            />
          ) : view === "analytics" ? (
            <AnalyticsView
              campaigns={campaigns}
              selectedCampaignId={analyticsCampaignId}
              onSelectCampaign={setAnalyticsCampaignId}
              authToken={authToken}
            />
          ) : view === "briefs" ? (
            <BriefsView
              requests={requests}
              requestSuccess={requestSuccess}
              onNewCampaign={() => setNewCampaignOpen(true)}
            />
          ) : view === "payouts" ? (
            <PayoutsView
              summary={summary}
              campaigns={campaigns}
              featuredCampaign={featuredCampaign}
              payouts={payouts}
            />
          ) : view === "contracts" ? (
            <ContractWhitelistView />
          ) : (
            <SettingsView
              partner={partner}
              displayName={displayName}
              address={address}
              latestRequest={requests[0] ?? null}
            />
          )}
        </section>
      </main>

      {newCampaignOpen ? (
        <NewCampaignModal
          campaignTitle={campaignTitle}
          primaryObjective={primaryObjective}
          tier={tier}
          prizePool={prizePool}
          briefReference={briefReference}
          callSlotDays={callSlotDays}
          callSlotsLoading={callSlotsLoading}
          callSlotsError={callSlotsError}
          callBookedFor={callBookedFor}
          callTimeSlot={callTimeSlot}
          callTimezone={callTimezone}
          callBookingNotes={callBookingNotes}
          requestError={requestError}
          submittingRequest={submittingRequest}
          timeZoneOptions={timeZoneOptions}
          selectedCallDay={selectedCallDay}
          onClose={() => {
            setNewCampaignOpen(false);
            setRequestError(null);
          }}
          onCampaignTitleChange={setCampaignTitle}
          onPrimaryObjectiveChange={setPrimaryObjective}
          onTierChange={setTier}
          onPrizePoolChange={setPrizePool}
          onBriefReferenceChange={setBriefReference}
          onCallDateChange={setCallBookedFor}
          onCallTimeSlotChange={setCallTimeSlot}
          onCallTimezoneChange={setCallTimezone}
          onCallBookingNotesChange={setCallBookingNotes}
          onSubmit={() => void submitCampaignRequest()}
        />
      ) : null}
    </div>
  );
}

function DashboardView({
  summary,
  campaigns,
  featuredCampaign,
  nextScheduledCall,
  topCampaigns,
  recentRequests,
  onOpenCampaigns,
  onOpenLeaderboard,
  onOpenBriefs,
}: {
  summary: DashboardSummary | null;
  campaigns: DashboardCampaign[];
  featuredCampaign: DashboardCampaign | null;
  nextScheduledCall: DashboardRequest | null;
  topCampaigns: DashboardCampaign[];
  recentRequests: DashboardRequest[];
  onOpenCampaigns: () => void;
  onOpenLeaderboard: (campaignId: number) => void;
  onOpenBriefs: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Campaigns"
          value={formatNumber(summary?.totalCampaigns ?? 0)}
          sub={`${summary?.pendingRequests ?? 0} briefs pending review`}
          accent="text-white"
        />
        <StatCard
          label="Active Campaigns"
          value={formatNumber(summary?.liveCampaigns ?? 0)}
          sub={`${summary?.approvedRequests ?? 0} approved requests in history`}
          accent="text-green-400"
        />
        <StatCard
          label="Participants"
          value={formatNumber(summary?.totalParticipants ?? 0)}
          sub={`${formatNumber(summary?.totalCompleted ?? 0)} total completions`}
          accent="text-white"
        />
        <StatCard
          label="Prize Pool"
          value={formatCurrency(summary?.totalPrizePoolUsdc ?? 0)}
          sub={`${summary?.completionRate ?? 0}% completion rate across partner campaigns`}
          accent="text-nexid-gold"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Panel
          label="Portfolio"
          title="Recent Campaigns"
          action={
            campaigns.length > 0 ? (
              <button
                type="button"
                onClick={onOpenCampaigns}
                className="rounded border border-[#252525] px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-[#c9c9c9]"
              >
                View All
              </button>
            ) : null
          }
        >
          {campaigns.length === 0 ? (
            <EmptyState message="No campaigns yet. Submit your first campaign brief to start building the partner portfolio." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[#171717] bg-[#0d0d0d]">
                  <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#727272]">
                    <th className="px-4 py-3 font-medium">Campaign</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Pool</th>
                    <th className="px-4 py-3 font-medium">Participants</th>
                    <th className="px-4 py-3 font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {topCampaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="border-b border-[#141414] text-sm text-[#cfcfcf] transition-colors hover:bg-[#0e0e0e]"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onOpenLeaderboard(campaign.id)}
                          className="text-left"
                        >
                          <div className="font-medium text-white">{campaign.title}</div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6f6f6f]">
                            {formatTierLabel(campaign.tier)} • {formatDate(campaign.startAt ?? campaign.createdAt)}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={campaign.status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-nexid-gold">
                        {formatCurrency(campaign.prizePoolUsdc)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {formatNumber(campaign.participantCount)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {formatNumber(campaign.completedCount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel label="Featured" title={featuredCampaign?.title ?? "No campaign selected"}>
            {featuredCampaign ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[#1d1d1d] bg-[#050505] p-4">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6f6f6f]">
                    Objective
                  </div>
                  <p className="text-sm leading-6 text-[#d4d4d4]">
                    {featuredCampaign.objective}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Status" value={featuredCampaign.status} />
                  <MiniStat
                    label="Top Score"
                    value={featuredCampaign.topScore > 0 ? `${featuredCampaign.topScore}` : "N/A"}
                  />
                  <MiniStat
                    label="Participants"
                    value={formatNumber(featuredCampaign.participantCount)}
                  />
                  <MiniStat
                    label="Distributed"
                    value={formatCurrency(featuredCampaign.totalDistributedUsdc)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onOpenLeaderboard(featuredCampaign.id)}
                  className="w-full rounded-lg bg-nexid-gold py-3 text-sm font-bold text-black"
                >
                  View Campaign Leaderboard
                </button>
              </div>
            ) : (
              <EmptyState message="When your first campaign is approved, it will appear here with its live performance metrics." />
            )}
          </Panel>

          <Panel label="Scheduling" title="Next Strategy Call">
            {nextScheduledCall ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#1d1d1d] bg-[#050505] p-4">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6f6f6f]">
                    Campaign Brief
                  </div>
                  <div className="text-sm font-medium text-white">
                    {nextScheduledCall.campaignTitle}
                  </div>
                  <div className="mt-2 text-sm text-[#c9c9c9]">
                    {nextScheduledCall.callBookedFor && nextScheduledCall.callTimeSlot
                      ? `${formatDate(nextScheduledCall.callBookedFor)} • ${nextScheduledCall.callTimeSlot} (${nextScheduledCall.callTimezone ?? "UTC"})`
                      : "Scheduling pending"}
                  </div>
                </div>
                <div className="rounded-lg border border-[#232323] bg-[#0a0a0a] p-3 text-sm text-[#aaaaaa]">
                  {nextScheduledCall.callBookingNotes?.trim()
                    ? nextScheduledCall.callBookingNotes
                    : "No briefing notes added for this call yet."}
                </div>
              </div>
            ) : (
              <EmptyState message="No strategy calls scheduled yet. New campaign briefs will reserve a live slot automatically." />
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          label="Request Queue"
          title="Recent Campaign Briefs"
          action={
            recentRequests.length > 0 ? (
              <button
                type="button"
                onClick={onOpenBriefs}
                className="rounded border border-[#252525] px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-[#c9c9c9]"
              >
                Open Queue
              </button>
            ) : null
          }
        >
          {recentRequests.length === 0 ? (
            <EmptyState message="No campaign briefs submitted yet." />
          ) : (
            <div className="space-y-3">
              {recentRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-xl border border-[#1d1d1d] bg-[#080808] p-4"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">
                        {request.campaignTitle}
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6d6d6d]">
                        {formatTierLabel(request.tier)} • {formatCurrency(request.prizePoolUsdc)}
                      </div>
                    </div>
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="text-sm leading-6 text-[#bfbfbf]">
                    {request.primaryObjective}
                  </p>
                  {request.linkedCampaignId ? (
                    <div className="mt-3 rounded-xl border border-green-500/20 bg-green-500/10 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-green-400">
                        Campaign Created
                      </div>
                      <div className="mt-1 text-sm text-white">
                        {request.linkedCampaignTitle || request.campaignTitle}
                      </div>
                      <div className="mt-1 text-xs text-[#a7a7a7]">
                        Visible in your campaigns view • Status {request.linkedCampaignStatus ?? "DRAFT"}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel label="Backend Requirements" title="Data Still Missing">
          <div className="space-y-3">
            {REQUIREMENT_ITEMS.map((item) => (
              <div
                key={item}
                className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm leading-6 text-[#d7c7a7]"
              >
                {item}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function CampaignsView({
  campaigns,
  onNewCampaign,
  onViewLeaderboard,
  onViewAnalytics,
  onOpenBriefs,
}: {
  campaigns: DashboardCampaign[];
  onNewCampaign: () => void;
  onViewLeaderboard: (campaignId: number) => void;
  onViewAnalytics: (campaignId: number) => void;
  onOpenBriefs: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-nexid-gold">
            Campaign History
          </div>
          <h2 className="mt-2 font-display text-3xl text-white">
            {campaigns.length} Campaign{campaigns.length === 1 ? "" : "s"} Total
          </h2>
        </div>
        <button
          type="button"
          onClick={onNewCampaign}
          className="rounded-lg bg-nexid-gold px-4 py-3 text-sm font-bold text-black"
        >
          Launch New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <Panel label="Campaigns" title="No Campaigns Yet">
          <EmptyState message="Submit a campaign brief to create your first partner campaign." />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {campaigns.map((campaign) => {
            const distributionGap = Math.max(
              Number(campaign.prizePoolUsdc) - Number(campaign.totalDistributedUsdc),
              0,
            );

            return (
              <div
                key={campaign.id}
                className="premium-panel overflow-hidden border border-[#171717] transition-colors hover:border-[#2a2a2a]"
              >
                <div className="flex items-start justify-between gap-3 border-b border-[#171717] px-5 py-4">
                  <div>
                    <div className="mb-1 text-lg font-semibold text-white">
                      {campaign.title}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6f6f6f]">
                      {formatTierLabel(campaign.tier)} • {campaign.slug}
                    </div>
                  </div>
                  <StatusBadge status={campaign.status} />
                </div>

                <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
                  <MiniStat
                    label="Prize Pool"
                    value={formatCurrency(campaign.prizePoolUsdc)}
                    tone="text-nexid-gold"
                  />
                  <MiniStat
                    label="Participants"
                    value={formatNumber(campaign.participantCount)}
                  />
                  <MiniStat
                    label="Completed"
                    value={formatNumber(campaign.completedCount)}
                  />
                  <MiniStat
                    label="Average Score"
                    value={
                      campaign.averageScore > 0
                        ? `${campaign.averageScore.toFixed(1)}`
                        : "N/A"
                    }
                  />
                  <MiniStat
                    label="Distributed"
                    value={formatCurrency(campaign.totalDistributedUsdc)}
                  />
                  <MiniStat
                    label="Outstanding"
                    value={formatCurrency(distributionGap)}
                  />
                </div>

                <div className="border-t border-[#171717] bg-[#070707] px-5 py-4">
                  <p className="mb-4 text-sm leading-6 text-[#bdbdbd]">
                    {campaign.objective}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onViewLeaderboard(campaign.id)}
                      className="rounded-lg bg-nexid-gold px-3 py-2 text-xs font-bold text-black"
                    >
                      View Leaderboard
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewAnalytics(campaign.id)}
                      className="rounded-lg border border-nexid-gold/30 bg-nexid-gold/10 px-3 py-2 text-xs font-bold text-nexid-gold"
                    >
                      View Analytics
                    </button>
                    <button
                      type="button"
                      onClick={onOpenBriefs}
                      className="rounded-lg border border-[#262626] px-3 py-2 text-xs text-white"
                    >
                      Open Brief Queue
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LeaderboardView({
  campaigns,
  selectedCampaignId,
  selectedCampaign,
  leaderboardTab,
  onSelectCampaign,
  onSelectTab,
  campaignLeaderboard,
  campaignLeaderboardLoading,
  aggregateLeaderboard,
}: {
  campaigns: DashboardCampaign[];
  selectedCampaignId: number | null;
  selectedCampaign: DashboardCampaign | null;
  leaderboardTab: LeaderboardTab;
  onSelectCampaign: (campaignId: number) => void;
  onSelectTab: (tab: LeaderboardTab) => void;
  campaignLeaderboard: CampaignLeaderboardRow[];
  campaignLeaderboardLoading: boolean;
  aggregateLeaderboard: AggregateLeaderboardRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-nexid-gold">
            Performance
          </div>
          <h2 className="mt-2 font-display text-3xl text-white">
            {leaderboardTab === "selected"
              ? selectedCampaign?.title ?? "Campaign Leaderboard"
              : "All Campaigns Leaderboard"}
          </h2>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex gap-2 rounded-lg border border-[#222] bg-[#0a0a0a] p-1">
            <button
              type="button"
              onClick={() => onSelectTab("selected")}
              className={`rounded-md px-3 py-2 text-xs font-medium ${
                leaderboardTab === "selected"
                  ? "bg-[#181818] text-white"
                  : "text-[#8d8d8d]"
              }`}
            >
              This Campaign
            </button>
            <button
              type="button"
              onClick={() => onSelectTab("aggregate")}
              className={`rounded-md px-3 py-2 text-xs font-medium ${
                leaderboardTab === "aggregate"
                  ? "bg-[#181818] text-white"
                  : "text-[#8d8d8d]"
              }`}
            >
              All Campaigns
            </button>
          </div>
          <select
            value={selectedCampaignId ?? ""}
            onChange={(event) => onSelectCampaign(Number(event.target.value))}
            className="b2b-input min-w-[260px] px-4 py-3 text-sm"
          >
            {campaigns.length === 0 ? (
              <option value="">No campaigns</option>
            ) : (
              campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.title}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {leaderboardTab === "selected" ? (
        campaignLeaderboardLoading ? (
          <Panel label="Leaderboard" title="Loading">
            <div className="py-8 text-center text-sm text-[#8f8f8f]">
              Loading campaign leaderboard...
            </div>
          </Panel>
        ) : campaignLeaderboard.length === 0 ? (
          <Panel label="Leaderboard" title="No Entries">
            <EmptyState message="This campaign does not have leaderboard data yet." />
          </Panel>
        ) : (
          <LeaderboardPanel
            title={selectedCampaign?.title ?? "Selected Campaign"}
            rows={campaignLeaderboard.map((row, index) => ({
              rank: row.rank ?? index + 1,
              wallet: row.walletAddress,
              primaryMetric: `${formatNumber(row.score)} pts`,
              secondaryMetric: row.rewardAmountUsdc
                ? formatCurrency(row.rewardAmountUsdc, true)
                : "Pending reward",
            }))}
          />
        )
      ) : aggregateLeaderboard.length === 0 ? (
        <Panel label="Leaderboard" title="No Aggregate Data">
          <EmptyState message="Aggregate performance data will appear once your campaigns have participants." />
        </Panel>
      ) : (
        <LeaderboardPanel
          title="Partner-Wide Ranking"
          rows={aggregateLeaderboard.map((row, index) => ({
            rank: index + 1,
            wallet: row.walletAddress,
            primaryMetric: `${formatNumber(row.totalScore)} pts`,
            secondaryMetric: `${row.campaignCount} campaigns • ${formatCurrency(row.totalRewardAmountUsdc, true)}`,
          }))}
        />
      )}
    </div>
  );
}

function BriefsView({
  requests,
  requestSuccess,
  onNewCampaign,
}: {
  requests: DashboardRequest[];
  requestSuccess: string | null;
  onNewCampaign: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-nexid-gold">
            Request History
          </div>
          <h2 className="mt-2 font-display text-3xl text-white">Campaign Brief Queue</h2>
        </div>
        <button
          type="button"
          onClick={onNewCampaign}
          className="rounded-lg bg-nexid-gold px-4 py-3 text-sm font-bold text-black"
        >
          Submit Another Brief
        </button>
      </div>

      {requestSuccess ? (
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
          {requestSuccess}
        </div>
      ) : null}

      {requests.length === 0 ? (
        <Panel label="Briefs" title="No Briefs Submitted">
          <EmptyState message="Your campaign request history will appear here after you submit the first brief." />
        </Panel>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className="premium-panel overflow-hidden border border-[#171717]"
            >
              <div className="flex flex-col gap-4 border-b border-[#171717] px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">
                    {request.campaignTitle}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6f6f6f]">
                    {formatTierLabel(request.tier)} • {formatCurrency(request.prizePoolUsdc)} • Submitted {formatDate(request.createdAt)}
                  </div>
                </div>
                <StatusBadge status={request.status} />
              </div>

              <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#6f6f6f]">
                      Primary Objective
                    </div>
                    <p className="text-sm leading-6 text-[#d0d0d0]">
                      {request.primaryObjective}
                    </p>
                  </div>

                  {request.reviewNotes ? (
                    <div className="rounded-xl border border-[#1d1d1d] bg-[#080808] p-4">
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-nexid-gold">
                        Review Notes
                      </div>
                      <p className="text-sm leading-6 text-[#d0d0d0]">
                        {request.reviewNotes}
                      </p>
                    </div>
                  ) : null}

                  {request.linkedCampaignId ? (
                    <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4">
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-green-400">
                        Campaign Created
                      </div>
                      <p className="text-sm leading-6 text-[#d0ffd8]">
                        {request.linkedCampaignTitle || request.campaignTitle} is now visible in your campaigns view.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 rounded-xl border border-[#1d1d1d] bg-[#070707] p-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-nexid-gold">
                    Strategy Call
                  </div>
                  <div className="text-sm text-white">
                    {request.callBookedFor && request.callTimeSlot
                      ? `${formatDate(request.callBookedFor)} • ${request.callTimeSlot} (${request.callTimezone ?? "UTC"})`
                      : "Not scheduled"}
                  </div>
                  <div className="text-sm text-[#a7a7a7]">
                    {request.callBookingNotes?.trim()
                      ? request.callBookingNotes
                      : "No briefing notes provided."}
                  </div>
                  <div className="border-t border-[#171717] pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6d6d6d]">
                    Request ID • {request.id}
                  </div>
                  {request.linkedCampaignId ? (
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-green-400">
                      Campaign • #{request.linkedCampaignId} • {request.linkedCampaignStatus ?? "DRAFT"}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PayoutsView({
  summary,
  campaigns,
  featuredCampaign,
  payouts,
}: {
  summary: DashboardSummary | null;
  campaigns: DashboardCampaign[];
  featuredCampaign: DashboardCampaign | null;
  payouts: PayoutRecord[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Panel label="Settlement Snapshot" title={featuredCampaign?.title ?? "No Campaign"}>
          {featuredCampaign ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <MiniStat
                  label="Prize Pool"
                  value={formatCurrency(featuredCampaign.prizePoolUsdc)}
                  tone="text-nexid-gold"
                />
                <MiniStat
                  label="Distributed"
                  value={formatCurrency(featuredCampaign.totalDistributedUsdc)}
                />
                <MiniStat
                  label="Recipients"
                  value={formatNumber(featuredCampaign.recipientCount)}
                />
                <MiniStat
                  label="Payout Events"
                  value={formatNumber(featuredCampaign.distributionCount)}
                />
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-6 text-[#d8c79a]">
                Self-serve payout execution is not wired for partners yet. The records shown here are real reward distributions already written by the server-side settlement flow.
              </div>
            </div>
          ) : (
            <EmptyState message="No campaign payout data is available yet." />
          )}
        </Panel>

        <Panel label="History Summary" title="Partner Distribution Totals">
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat
              label="Total Distributed"
              value={formatCurrency(summary?.totalDistributedUsdc ?? 0)}
              tone="text-green-400"
            />
            <MiniStat
              label="Total Recipients"
              value={formatNumber(summary?.totalRecipients ?? 0)}
            />
            <MiniStat
              label="Payout Records"
              value={formatNumber(payouts.length)}
            />
            <MiniStat
              label="Outstanding Pool"
              value={formatCurrency(
                Math.max(
                  Number(summary?.totalPrizePoolUsdc ?? 0) -
                    Number(summary?.totalDistributedUsdc ?? 0),
                  0,
                ),
              )}
            />
          </div>
        </Panel>
      </div>

      <Panel label="History" title="Reward Distribution Records">
        {payouts.length === 0 ? (
          <EmptyState message="No payout records have been written for this partner yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[#171717] bg-[#0d0d0d]">
                <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#727272]">
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Distributed</th>
                  <th className="px-4 py-3 font-medium">Recipients</th>
                  <th className="px-4 py-3 font-medium">Tx Hash</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr
                    key={payout.id}
                    className="border-b border-[#141414] text-[#cfcfcf] transition-colors hover:bg-[#0e0e0e]"
                  >
                    <td className="px-4 py-3 text-white">{payout.campaignTitle}</td>
                    <td className="px-4 py-3 font-mono text-green-400">
                      {formatCurrency(payout.totalDistributedUsdc, true)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {formatNumber(payout.recipientCount)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#9f9f9f]">
                      {payout.txHash ? shortAddress(payout.txHash) : "Not recorded"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#9f9f9f]">
                      {formatDate(payout.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ─────────── CONTRACT WHITELIST VIEW ─────────── */

interface WhitelistContractLegacy {
  id: string;
  chainId: number;
  contractAddress: string;
  actionType: string;
  label: string | null;
  isApproved: boolean;
  createdAt: string;
}

const CHAIN_LABELS_LEGACY: Record<number, string> = {
  8453: "Base",
  1: "Ethereum",
  137: "Polygon",
  42161: "Arbitrum",
  10: "Optimism",
};

const ACTION_TYPE_OPTIONS = ["LP", "SWAP", "GOVERNANCE", "STAKE", "MINT", "BRIDGE", "OTHER"] as const;

function ContractWhitelistViewLegacy() {
  const [contracts, setContracts] = useState<WhitelistContractLegacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [chainId, setChainId] = useState(8453);
  const [contractAddress, setContractAddress] = useState("");
  const [actionType, setActionType] = useState("SWAP");
  const [label, setLabel] = useState("");

  const fetchContracts = useCallback(async () => {
    try {
      const res = await fetch("/api/partner/contract-whitelist", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/partner/contract-whitelist", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          chainId,
          contractAddress: contractAddress.trim(),
          actionType,
          label: label.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to submit contract");
        return;
      }
      setSuccess("Contract submitted for approval");
      setContractAddress("");
      setLabel("");
      fetchContracts();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel label="Passport Scanner" title="Contract Whitelist">
        <p className="mb-5 text-sm leading-relaxed text-[#9d9d9d]">
          Submit your protocol&apos;s smart contract addresses so NexID&apos;s
          Living Passport can track post-campaign on-chain activity. Contracts
          require admin approval before scanning begins.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#666]">Chain</div>
              <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))} className="w-full rounded-lg border border-[#242424] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white outline-none">
                {Object.entries(CHAIN_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#666]">Action Type</div>
              <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full rounded-lg border border-[#242424] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white outline-none">
                {ACTION_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#666]">Contract Address</div>
            <input type="text" value={contractAddress} onChange={(e) => setContractAddress(e.target.value)} placeholder="0x... or Solana program address" className="w-full rounded-lg border border-[#242424] bg-[#0a0a0a] px-3 py-2.5 font-mono text-sm text-white outline-none" required />
          </div>
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#666]">Label (optional)</div>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Uniswap V3 Router" className="w-full rounded-lg border border-[#242424] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white outline-none" />
          </div>
          {error ? <div className="text-sm text-red-400">{error}</div> : null}
          {success ? <div className="text-sm text-green-400">{success}</div> : null}
          <button type="submit" disabled={submitting || !contractAddress.trim()} className="rounded-lg bg-nexid-gold px-6 py-2.5 text-sm font-bold text-black transition-opacity disabled:opacity-40">
            {submitting ? "Submitting..." : "Submit for Approval"}
          </button>
        </form>
      </Panel>

      <Panel label="Submitted" title="Your Contracts">
        {loading ? (
          <div className="py-8 text-center text-sm text-[#666]">Loading...</div>
        ) : contracts.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#666]">No contracts submitted yet.</div>
        ) : (
          <div className="space-y-2">
            {contracts.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-[#1a1a1a] px-2 py-0.5 font-mono text-[10px] text-[#888]">{CHAIN_LABELS[c.chainId] ?? `Chain ${c.chainId}`}</span>
                    <span className="rounded bg-[#1a1a1a] px-2 py-0.5 font-mono text-[10px] text-[#888]">{c.actionType}</span>
                    <span className={`rounded px-2 py-0.5 font-mono text-[10px] ${c.isApproved ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                      {c.isApproved ? "Approved" : "Pending"}
                    </span>
                  </div>
                  <div className="mt-1.5 truncate font-mono text-sm text-white/80">{c.contractAddress}</div>
                  {c.label ? <div className="mt-0.5 text-xs text-[#666]">{c.label}</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function SettingsView({
  partner,
  displayName,
  address,
  latestRequest,
}: {
  partner: PartnerProfile | null;
  displayName: string;
  address?: string;
  latestRequest: DashboardRequest | null;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="Partner Profile" title="Organization">
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label="Organization" value={partner?.orgName ?? "---"} />
            <MiniStat label="Namespace" value={displayName || "---"} />
            <MiniStat
              label="Connected Wallet"
              value={address ? shortAddress(address) : "---"}
            />
            <MiniStat
              label="Latest Brief"
              value={latestRequest ? formatDate(latestRequest.createdAt) : "None"}
            />
          </div>
        </Panel>

        <Panel label="Scheduling Policy" title="Strategy Call Slots">
          <div className="space-y-3">
            <p className="text-sm leading-6 text-[#bcbcbc]">
              Partner call slots are currently locked to shared UTC windows. The
              scheduler blocks conflicts server-side against existing pending and
              approved campaign requests.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PARTNER_CALL_SLOT_DEFINITIONS.map((slot) => (
                <div
                  key={slot.id}
                  className="rounded-lg border border-[#1d1d1d] bg-[#070707] px-3 py-2"
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6f6f6f]">
                    Slot
                  </div>
                  <div className="text-sm text-white">{slot.label}</div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <ContractWhitelistView />
    </div>
  );
}

function NewCampaignModal({
  campaignTitle,
  primaryObjective,
  tier,
  prizePool,
  briefReference,
  callSlotDays,
  callSlotsLoading,
  callSlotsError,
  callBookedFor,
  callTimeSlot,
  callTimezone,
  callBookingNotes,
  requestError,
  submittingRequest,
  timeZoneOptions,
  selectedCallDay,
  onClose,
  onCampaignTitleChange,
  onPrimaryObjectiveChange,
  onTierChange,
  onPrizePoolChange,
  onBriefReferenceChange,
  onCallDateChange,
  onCallTimeSlotChange,
  onCallTimezoneChange,
  onCallBookingNotesChange,
  onSubmit,
}: {
  campaignTitle: string;
  primaryObjective: string;
  tier: PartnerCampaignPlanId;
  prizePool: number;
  briefReference: string;
  callSlotDays: CallSlotDay[];
  callSlotsLoading: boolean;
  callSlotsError: string | null;
  callBookedFor: string;
  callTimeSlot: string;
  callTimezone: string;
  callBookingNotes: string;
  requestError: string | null;
  submittingRequest: boolean;
  timeZoneOptions: readonly string[];
  selectedCallDay: CallSlotDay | null;
  onClose: () => void;
  onCampaignTitleChange: (value: string) => void;
  onPrimaryObjectiveChange: (value: string) => void;
  onTierChange: (value: PartnerCampaignPlanId) => void;
  onPrizePoolChange: (value: number) => void;
  onBriefReferenceChange: (value: string) => void;
  onCallDateChange: (value: string) => void;
  onCallTimeSlotChange: (value: string) => void;
  onCallTimezoneChange: (value: string) => void;
  onCallBookingNotesChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const availableCallDays = callSlotDays.filter((day) =>
    day.slots.some((slot) => slot.available),
  );

  return (
    <Modal title="Submit Campaign Brief" onClose={onClose} maxWidth="max-w-4xl">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-5">
          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8f8f8f]">
              Campaign Title
            </label>
            <input
              type="text"
              value={campaignTitle}
              onChange={(event) => onCampaignTitleChange(event.target.value)}
              placeholder="e.g. HyperEVM Deep Dive"
              className="b2b-input w-full px-4 py-3 text-sm"
            />
          </div>

          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8f8f8f]">
              Primary Objective
            </label>
            <textarea
              value={primaryObjective}
              onChange={(event) => onPrimaryObjectiveChange(event.target.value)}
              placeholder="Describe the campaign brief, target user action, and what the NexID team should optimize for."
              className="b2b-input h-36 w-full resize-none px-4 py-3 text-sm"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8f8f8f]">
                Plan
              </label>
              <select
                value={tier}
                onChange={(event) =>
                  onTierChange(event.target.value as PartnerCampaignPlanId)
                }
                className="b2b-input w-full px-4 py-3 text-sm"
              >
                {TIER_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8f8f8f]">
                Prize Pool (USDC)
              </label>
              <input
                type="number"
                min={15000}
                value={prizePool}
                onChange={(event) => onPrizePoolChange(Number(event.target.value || 0))}
                className="b2b-input w-full px-4 py-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8f8f8f]">
              Brief Reference
            </label>
            <input
              type="text"
              value={briefReference}
              onChange={(event) => onBriefReferenceChange(event.target.value)}
              placeholder="Filename, doc URL, or internal reference"
              className="b2b-input w-full px-4 py-3 text-sm"
            />
            <p className="mt-2 text-xs text-[#737373]">
              File storage is not wired yet, so this field stores a brief reference string only.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-[#1c1c1c] bg-[#050505] p-4">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-nexid-gold">
              Strategy Call Scheduler
            </div>

            <div className="mb-4">
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#8f8f8f]">
                Display Timezone
              </label>
              <select
                value={callTimezone}
                onChange={(event) => onCallTimezoneChange(event.target.value)}
                className="b2b-input w-full px-4 py-3 text-sm"
              >
                {timeZoneOptions.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>

            {callSlotsLoading ? (
              <div className="rounded-lg border border-[#1d1d1d] bg-[#0a0a0a] p-4 text-sm text-[#8f8f8f]">
                Loading available call windows...
              </div>
            ) : callSlotsError ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                {callSlotsError}
              </div>
            ) : availableCallDays.length === 0 ? (
              <div className="rounded-lg border border-[#1d1d1d] bg-[#0a0a0a] p-4 text-sm text-[#8f8f8f]">
                No open call slots are currently available in the next two weeks.
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8f8f8f]">
                    Select Date
                  </div>
                  <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto pr-1">
                    {availableCallDays.map((day) => (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => onCallDateChange(day.date)}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                          callBookedFor === day.date
                            ? "border-nexid-gold bg-nexid-gold/10 text-nexid-gold"
                            : "border-[#252525] bg-[#0a0a0a] text-[#d6d6d6]"
                        }`}
                      >
                        <div className="font-medium text-inherit">{formatDate(day.date)}</div>
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#727272]">
                          {day.slots.filter((slot) => slot.available).length} open
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8f8f8f]">
                    Select Time
                  </div>
                  <div className="grid gap-2">
                    {selectedCallDay?.slots.map((slot) => (
                      <button
                        key={`${selectedCallDay.date}-${slot.id}`}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => onCallTimeSlotChange(slot.id)}
                        className={`rounded-lg border px-3 py-3 text-left text-xs transition-colors ${
                          !slot.available
                            ? "cursor-not-allowed border-[#1f1f1f] bg-[#090909] text-[#565656]"
                            : callTimeSlot === slot.id
                              ? "border-nexid-gold bg-nexid-gold/10 text-nexid-gold"
                              : "border-[#252525] bg-[#0a0a0a] text-[#e3e3e3]"
                        }`}
                      >
                        <div className="font-medium">{getCallSlotLocalLabel(slot, callTimezone)}</div>
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#727272]">
                          {slot.available ? `Locked to ${slot.label}` : "Unavailable"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8f8f8f]">
              Call Notes
            </label>
            <textarea
              value={callBookingNotes}
              onChange={(event) => onCallBookingNotesChange(event.target.value)}
              placeholder="What should NexID prepare before the call?"
              className="b2b-input h-28 w-full resize-none px-4 py-3 text-sm"
            />
          </div>

          <div className="rounded-xl border border-[#1c1c1c] bg-[#050505] p-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-nexid-gold">
              Submission Summary
            </div>
            <div className="space-y-2 text-sm text-[#d2d2d2]">
              <div className="flex justify-between gap-4">
                <span className="text-[#8f8f8f]">Plan</span>
                <span>{formatTierLabel(tier)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#8f8f8f]">Prize Pool</span>
                <span>{formatCurrency(prizePool)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#8f8f8f]">Call Slot</span>
                <span>
                  {callBookedFor && callTimeSlot
                    ? `${formatDate(callBookedFor)} • ${callTimeSlot}`
                    : "Not selected"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {requestError ? (
        <div className="mt-5 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {requestError}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 border-t border-[#171717] pt-5 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[#252525] px-4 py-3 text-sm text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submittingRequest || callSlotsLoading}
          className="rounded-lg bg-nexid-gold px-5 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submittingRequest ? "Submitting..." : "Submit Campaign Brief"}
        </button>
      </div>
    </Modal>
  );
}

function NavItem({
  label,
  active,
  note,
  onClick,
}: {
  label: string;
  active: boolean;
  note?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
        active
          ? "border-[#252525] bg-[#111] text-white"
          : "border-transparent text-[#8a8a8a] hover:bg-[#0f0f0f] hover:text-white"
      }`}
    >
      <span>{label}</span>
      {note ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#7b7b7b]">
          {note}
        </span>
      ) : null}
    </button>
  );
}

function Panel({
  label,
  title,
  action,
  children,
}: {
  label: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="premium-panel overflow-hidden border border-[#171717]">
      <div className="flex items-start justify-between gap-3 border-b border-[#171717] px-5 py-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-nexid-gold">
            {label}
          </div>
          <div className="mt-1 text-lg font-semibold text-white">{title}</div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="premium-panel border border-[#171717] p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#6f6f6f]">
        {label}
      </div>
      <div className={`mt-3 font-display text-3xl ${accent ?? "text-white"}`}>{value}</div>
      <div className="mt-2 text-sm text-[#8f8f8f]">{sub}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-[#1d1d1d] bg-[#070707] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6f6f6f]">
        {label}
      </div>
      <div className={`mt-2 text-lg font-semibold ${tone ?? "text-white"}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${statusBadgeClasses(
        status,
      )}`}
    >
      {status === "LIVE" || status === "DRAFT" || status === "ENDED" || status === "ARCHIVED"
        ? status
        : formatRequestStatus(status)}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#272727] bg-[#070707] px-4 py-10 text-center text-sm leading-6 text-[#8d8d8d]">
      {message}
    </div>
  );
}

function LeaderboardPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    rank: number;
    wallet: string;
    primaryMetric: string;
    secondaryMetric: string;
  }>;
}) {
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <Panel label="Leaderboard" title={title}>
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {podium.map((row) => (
          <div
            key={`${row.rank}-${row.wallet}`}
            className={`rounded-2xl border p-4 text-center ${
              row.rank === 1
                ? "border-[#5a470f] bg-[linear-gradient(180deg,rgba(240,165,0,0.18),rgba(240,165,0,0.03))]"
                : row.rank === 2
                  ? "border-[#373737] bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.02))]"
                  : "border-[#3f2b19] bg-[linear-gradient(180deg,rgba(205,127,50,0.12),rgba(205,127,50,0.03))]"
            }`}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#6f6f6f]">
              Rank #{row.rank}
            </div>
            <div className="mt-3 text-base font-semibold text-white">
              {shortAddress(row.wallet)}
            </div>
            <div className="mt-2 font-mono text-sm text-nexid-gold">{row.primaryMetric}</div>
            <div className="mt-1 text-xs text-[#909090]">{row.secondaryMetric}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-[#171717] bg-[#0d0d0d]">
            <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#727272]">
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Wallet</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rest.map((row) => (
              <tr
                key={`${row.rank}-${row.wallet}`}
                className="border-b border-[#141414] text-[#cfcfcf] transition-colors hover:bg-[#0e0e0e]"
              >
                <td className="px-4 py-3 font-mono text-[#8d8d8d]">#{row.rank}</td>
                <td className="px-4 py-3 text-white">{shortAddress(row.wallet)}</td>
                <td className="px-4 py-3 font-mono">{row.primaryMetric}</td>
                <td className="px-4 py-3 text-[#9d9d9d]">{row.secondaryMetric}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Modal({
  title,
  onClose,
  children,
  maxWidth = "max-w-2xl",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="modal-overlay active fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <div
        className={`modal-content relative w-full ${maxWidth} rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-6`}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-nexid-gold">
              Partner Console
            </div>
            <h3 className="mt-1 font-display text-2xl text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#252525] px-3 py-2 text-xs text-[#b0b0b0]"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface WhitelistContract {
  id: string;
  chainId: number;
  contractAddress: string;
  actionType: string;
  label: string | null;
  isApproved: boolean;
  createdAt: string;
}

const CHAIN_LABELS: Record<number, string> = {
  8453: "Base",
  1: "Ethereum",
  137: "Polygon",
  42161: "Arbitrum",
  10: "Optimism",
};

const ACTION_TYPES = ["LP", "SWAP", "GOVERNANCE", "STAKE", "MINT", "BRIDGE", "OTHER"] as const;

function ContractWhitelistView() {
  const [contracts, setContracts] = useState<WhitelistContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [chainId, setChainId] = useState(8453);
  const [contractAddress, setContractAddress] = useState("");
  const [actionType, setActionType] = useState<string>("SWAP");
  const [label, setLabel] = useState("");

  const fetchContracts = useCallback(async () => {
    try {
      const response = await fetch("/api/partner/contract-whitelist", {
        headers: authHeaders(),
      });

      if (!response.ok) {
        setContracts([]);
        return;
      }

      const data = await response.json();
      setContracts(data.contracts ?? []);
    } catch {
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchContracts();
  }, [fetchContracts]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/partner/contract-whitelist", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          chainId,
          contractAddress: contractAddress.trim(),
          actionType,
          label: label.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Failed to submit contract");
        return;
      }

      setSuccess("Contract submitted for approval.");
      setContractAddress("");
      setLabel("");
      await fetchContracts();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel label="Living Passport" title="Contract Whitelist">
      <div className="space-y-6">
        <p className="text-sm leading-6 text-[#bdbdbd]">
          Submit smart contract addresses that should count toward post-campaign
          on-chain activity. Contracts remain hidden from passport scans until an
          admin approves them.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-[#1d1d1d] bg-[#070707] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#8f8f8f]">
                Chain
              </label>
              <select
                value={chainId}
                onChange={(event) => setChainId(Number(event.target.value))}
                className="b2b-input w-full px-4 py-3 text-sm"
              >
                {Object.entries(CHAIN_LABELS_LEGACY).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#8f8f8f]">
                Action Type
              </label>
              <select
                value={actionType}
                onChange={(event) => setActionType(event.target.value)}
                className="b2b-input w-full px-4 py-3 text-sm"
              >
                {ACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#8f8f8f]">
              Contract Address
            </label>
            <input
              type="text"
              value={contractAddress}
              onChange={(event) => setContractAddress(event.target.value)}
              placeholder="0x... or Solana program address"
              className="b2b-input w-full px-4 py-3 text-sm font-mono"
            />
          </div>

          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#8f8f8f]">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. HyperEVM Router"
              className="b2b-input w-full px-4 py-3 text-sm"
            />
          </div>

          {error ? <div className="text-sm text-red-400">{error}</div> : null}
          {success ? <div className="text-sm text-green-400">{success}</div> : null}

          <button
            type="submit"
            disabled={submitting || !contractAddress.trim()}
            className="rounded-lg bg-nexid-gold px-5 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Submitting..." : "Submit Contract"}
          </button>
        </form>

        <div>
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-nexid-gold">
            Submitted Contracts
          </div>
          {loading ? (
            <div className="rounded-xl border border-[#1d1d1d] bg-[#070707] p-6 text-sm text-[#8f8f8f]">
              Loading submitted contracts...
            </div>
          ) : contracts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#272727] bg-[#070707] p-6 text-sm text-[#8f8f8f]">
              No contracts submitted yet.
            </div>
          ) : (
            <div className="space-y-3">
              {contracts.map((contract) => (
                <div
                  key={contract.id}
                  className="rounded-xl border border-[#1d1d1d] bg-[#070707] p-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-[#141414] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f8f]">
                      {CHAIN_LABELS_LEGACY[contract.chainId] ?? `Chain ${contract.chainId}`}
                    </span>
                    <span className="rounded bg-[#141414] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f8f]">
                      {contract.actionType}
                    </span>
                    <span
                      className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                        contract.isApproved
                          ? "bg-green-500/10 text-green-400"
                          : "bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {contract.isApproved ? "Approved" : "Pending"}
                    </span>
                  </div>
                  <div className="font-mono text-sm text-white">
                    {contract.contractAddress}
                  </div>
                  {contract.label ? (
                    <div className="mt-1 text-sm text-[#989898]">{contract.label}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ── Protocol Proof of Outcome Analytics ─────────────────────────────────────

interface ProtocolAnalytics {
  campaignId: number;
  campaignTitle: string;
  botRemovalRate: number;
  completionRate: number;
  averageQuizScore: number;
  onChainFailureCount: number;
  postCampaignReturnRate: number;
  postCampaignReturnCount: number;
  scoreDistribution: number[];
  qualitySegments: { chartered: number; consistent: number; verified: number; unverified: number };
  postCampaignVolume: number;
  vsPlatformAvg: { completionRate: number; quizScore: number; returnRate: number };
  totalParticipants: number;
  totalCompleted: number;
}

const ANALYTICS_SCORE_BUCKETS = ["0–20", "20–40", "40–60", "60–80", "80–100"];

function AnalyticsView({
  campaigns,
  selectedCampaignId,
  onSelectCampaign,
  authToken,
}: {
  campaigns: DashboardCampaign[];
  selectedCampaignId: number | null;
  onSelectCampaign: (id: number) => void;
  authToken: string | null;
}) {
  const [data, setData] = useState<ProtocolAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCampaignId && campaigns.length > 0) {
      onSelectCampaign(campaigns[0].id);
    }
  }, [campaigns, selectedCampaignId, onSelectCampaign]);

  useEffect(() => {
    if (!selectedCampaignId || !authToken) return;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/partner/proof-of-outcome/${selectedCampaignId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to load analytics");
        }
        setData(await res.json());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedCampaignId, authToken]);

  const maxDist = data ? Math.max(...data.scoreDistribution, 1) : 1;
  const seg = data?.qualitySegments;
  const totalSeg = seg ? seg.chartered + seg.consistent + seg.verified + seg.unverified : 0;
  const segPct = (n: number) => totalSeg > 0 ? ((n / totalSeg) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-nexid-gold">
          Proof of Outcome
        </div>
        <h2 className="mt-2 font-display text-3xl text-white">Campaign Analytics</h2>
        <p className="mt-1 text-xs text-[#777]">
          Deep performance analytics powered by NexID&apos;s weekly passport scans.
        </p>
      </div>

      {campaigns.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectCampaign(c.id)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                selectedCampaignId === c.id
                  ? "bg-nexid-gold text-black"
                  : "border border-[#262626] text-[#989898] hover:text-white"
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="py-16 text-center text-xs text-[#777] font-mono">Loading analytics...</div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AnalyticsStat label="Completion Rate" value={`${data.completionRate.toFixed(1)}%`} />
            <AnalyticsStat label="Avg Quiz Score" value={`${data.averageQuizScore.toFixed(1)}`} />
            <AnalyticsStat label="Bot Removal" value={`${data.botRemovalRate.toFixed(1)}%`} color="text-red-400" />
            <AnalyticsStat label="30-Day Return" value={`${data.postCampaignReturnRate.toFixed(1)}%`} color="text-green-400" />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AnalyticsStat label="Total Participants" value={formatNumber(data.totalParticipants)} />
            <AnalyticsStat label="Completed" value={formatNumber(data.totalCompleted)} />
            <AnalyticsStat label="On-Chain Failures" value={formatNumber(data.onChainFailureCount)} color="text-amber-400" />
            <AnalyticsStat label="Post-Campaign Volume" value={`${data.postCampaignVolume} txs`} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel label="Distribution" title="Score Distribution">
              <div className="space-y-2.5">
                {data.scoreDistribution.map((count, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 text-right text-[10px] font-mono text-[#666]">{ANALYTICS_SCORE_BUCKETS[i]}</div>
                    <div className="flex-1 h-5 rounded bg-[#111] overflow-hidden">
                      <div className="h-full rounded bg-nexid-gold/60" style={{ width: `${(count / maxDist) * 100}%` }} />
                    </div>
                    <div className="w-8 text-right text-[10px] font-mono text-[#888]">{count}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel label="Segments" title="User Quality">
              {seg && (
                <div className="space-y-3">
                  {[
                    { label: "Chartered", icon: "★", count: seg.chartered, color: "text-nexid-gold" },
                    { label: "Consistent", icon: "◈◈", count: seg.consistent, color: "text-green-400" },
                    { label: "Verified", icon: "◈", count: seg.verified, color: "text-blue-400" },
                    { label: "Unverified", icon: "○", count: seg.unverified, color: "text-[#666]" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-base ${s.color}`}>{s.icon}</span>
                        <span className="text-xs text-white">{s.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-[#888]">{s.count}</span>
                        <span className={`text-[10px] font-mono font-bold ${s.color}`}>{segPct(s.count)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel label="Benchmarks" title="vs. Platform Average">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <BenchmarkCompare label="Completion Rate" yours={data.completionRate} platform={data.vsPlatformAvg.completionRate} unit="%" />
              <BenchmarkCompare label="Quiz Score" yours={data.averageQuizScore} platform={data.vsPlatformAvg.quizScore} unit="" />
              <BenchmarkCompare label="Return Rate" yours={data.postCampaignReturnRate} platform={data.vsPlatformAvg.returnRate} unit="%" />
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function AnalyticsStat({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="premium-panel border border-[#171717] p-4">
      <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#6f6f6f] mb-1">{label}</div>
      <div className={`text-xl font-display font-bold ${color}`}>{value}</div>
    </div>
  );
}

function BenchmarkCompare({ label, yours, platform, unit }: { label: string; yours: number; platform: number; unit: string }) {
  const diff = yours - platform;
  const better = diff >= 0;
  return (
    <div className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-4">
      <div className="text-[9px] font-mono uppercase tracking-widest text-[#666] mb-2">{label}</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-lg font-display font-bold text-white">{yours.toFixed(1)}{unit}</div>
          <div className="text-[10px] text-[#666]">Your campaign</div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-mono font-bold ${better ? "text-green-400" : "text-red-400"}`}>
            {better ? "+" : ""}{diff.toFixed(1)}{unit}
          </div>
          <div className="text-[10px] text-[#666]">vs. avg {platform.toFixed(1)}{unit}</div>
        </div>
      </div>
    </div>
  );
}
