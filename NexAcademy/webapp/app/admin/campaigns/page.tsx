"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import AdminShell from "../_components/AdminShell";
import {
  useAdminContract,
  type NexIDCreateParams,
  type PartnerCreateParams,
} from "@/hooks/useAdminContract";
import { normalizeCampaignModules } from "@/lib/campaign-modules";
import {
  formatPartnerCampaignPlan,
  type PartnerCampaignPlanId,
} from "@/lib/partner-campaign-plans";

type CampaignFilter = "all" | "LIVE" | "DRAFT" | "ENDED" | "ARCHIVED";
type RequestFilter = "all" | "PENDING" | "APPROVED" | "REJECTED" | "linked";

interface AdminCampaign {
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
  escrowAddress: string | null;
  escrowId: number | null;
  onChainCampaignId: number | null;
  rewardSchedule: { winnerCap?: number } | null;
  requestId: string | null;
  requestStatus?: string | null;
  requestCampaignTitle?: string | null;
  requestPartnerName?: string | null;
  participantCount: number;
  topScore: number;
  totalScore: number;
  onChainStatus?: string;
}

interface AdminRequest {
  id: string;
  partnerName: string;
  partnerNamespace: string | null;
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
  createdAt: string;
  updatedAt: string;
}

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function formatDate(value: string | null | undefined) {
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

function getCampaignState(campaign: AdminCampaign) {
  if (campaign.onChainStatus === "Ended") return "ENDED";
  if (campaign.onChainStatus === "Inactive") return "ARCHIVED";
  if (campaign.onChainStatus === "Active") return "LIVE";
  return campaign.status;
}

function statusPillClasses(status: string) {
  if (status === "LIVE") return "border-green-500/30 bg-green-500/10 text-green-400";
  if (status === "ENDED") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  if (status === "ARCHIVED") return "border-[#333] bg-[#161616] text-[#8d8d8d]";
  if (status === "APPROVED") return "border-green-500/30 bg-green-500/10 text-green-400";
  if (status === "REJECTED") return "border-red-500/30 bg-red-500/10 text-red-400";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

function summarizeModules(rawModules: unknown) {
  const groups = normalizeCampaignModules(rawModules);
  const itemCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const questionCount = groups.reduce(
    (sum, group) => sum + group.items.filter((item) => item.type === "quiz").length,
    0,
  );

  return {
    groupCount: groups.length,
    itemCount,
    questionCount,
  };
}

function StatCard({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#1c1c1c] bg-[#0a0a0a] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#727272]">{label}</div>
      <div className={`mt-3 font-display text-3xl ${tone}`}>{value}</div>
    </div>
  );
}

export default function AdminCampaignsPage() {
  const router = useRouter();
  const { address } = useAccount();
  const {
    createCampaignOnChain,
    createEscrowCampaign,
    deactivateCampaignOnChain,
    isEscrowConfigured,
    loading: contractLoading,
    txHash,
    error: contractError,
    isConfigured,
  } = useAdminContract();

  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>("all");
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedCampaignId, setExpandedCampaignId] = useState<number | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [linkingCampaignId, setLinkingCampaignId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txStep, setTxStep] = useState<string | null>(null);
  const [txMessage, setTxMessage] = useState<string | null>(null);

  const selectedRequest =
    requests.find((request) => request.id === selectedRequestId) ?? requests[0] ?? null;

  async function fetchCampaigns() {
    setCampaignsLoading(true);
    try {
      const response = await fetch("/api/admin/campaigns", {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "Failed to load campaigns.");
        setCampaigns([]);
        return;
      }
      const nextCampaigns = (data.campaigns ?? []) as AdminCampaign[];
      setCampaigns(nextCampaigns);
      setExpandedCampaignId((current) => current ?? nextCampaigns[0]?.id ?? null);
    } catch {
      setError("Failed to load campaigns.");
      setCampaigns([]);
    } finally {
      setCampaignsLoading(false);
    }
  }

  async function fetchRequests() {
    setRequestsLoading(true);
    try {
      const response = await fetch("/api/admin/campaign-requests", {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "Failed to load campaign requests.");
        setRequests([]);
        return;
      }
      const nextRequests = (data.requests ?? []) as AdminRequest[];
      setRequests(nextRequests);
      setSelectedRequestId((current) => current ?? nextRequests[0]?.id ?? null);
    } catch {
      setError("Failed to load campaign requests.");
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }

  useEffect(() => {
    void fetchCampaigns();
    void fetchRequests();
  }, []);

  async function reviewRequest(request: AdminRequest, decision: "APPROVE" | "REJECT") {
    setRequestActionId(request.id);
    setError(null);
    setTxMessage(null);
    setTxStep(decision === "APPROVE" ? "Creating campaign from request..." : "Rejecting request...");

    try {
      const response = await fetch(`/api/admin/campaign-requests/${request.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          decision,
          createCampaign: decision === "APPROVE",
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Failed to review request.");
        return;
      }

      if (decision === "APPROVE" && data?.campaign?.id) {
        const dbCampaignId = Number(data.campaign.id);
        const contractType = (data.campaign.contractType || "PARTNER_CAMPAIGNS").toUpperCase() as
          | "NEXID_CAMPAIGNS"
          | "PARTNER_CAMPAIGNS";

        if (isConfigured(contractType)) {
          setTxStep("Confirm the on-chain campaign creation in your wallet...");

          let contractResult: { onChainCampaignId: number; txHash: string } | null = null;

          if (contractType === "NEXID_CAMPAIGNS") {
            const params: NexIDCreateParams = {
              title: data.campaign.title || "",
              description: data.campaign.objective || "",
              longDescription: data.campaign.objective || "",
              instructor: data.campaign.sponsorName || "NexID",
              objectives: data.campaign.keyTakeaways || [],
              prerequisites: [],
              category: data.campaign.tier || "LAUNCH_SPRINT",
              level: "Beginner",
              thumbnailUrl: data.campaign.coverImageUrl || "",
              duration: "4 weeks",
              totalLessons: BigInt(data.campaign.modules?.length || 1),
            };
            contractResult = await createCampaignOnChain("NEXID_CAMPAIGNS", params);
          } else {
            const rewardSchedule = (data.campaign.rewardSchedule || {}) as { winnerCap?: number };
            const params: PartnerCreateParams = {
              title: data.campaign.title || "",
              description: data.campaign.objective || "",
              category: data.campaign.tier || "LAUNCH_SPRINT",
              level: "Beginner",
              thumbnailUrl: data.campaign.coverImageUrl || "",
              totalTasks: BigInt(data.campaign.modules?.length || 1),
              sponsor: (address || EMPTY_ADDRESS) as `0x${string}`,
              sponsorName: data.campaign.sponsorName || "",
              sponsorLogo: data.campaign.coverImageUrl || "",
              prizePool: BigInt(Math.round((Number(data.campaign.prizePoolUsdc) || 0) * 1e6)),
              startTime: BigInt(
                Math.floor(new Date(data.campaign.startAt || Date.now()).getTime() / 1000),
              ),
              plan: (data.campaign.tier || "LAUNCH_SPRINT") as PartnerCampaignPlanId,
              customWinnerCap: BigInt(
                data.campaign.tier === "CUSTOM" ? rewardSchedule.winnerCap || 0 : 0,
              ),
            };
            contractResult = await createCampaignOnChain("PARTNER_CAMPAIGNS", params);
          }

          if (contractResult) {
            setTxStep("Saving the on-chain campaign id...");
            await fetch(`/api/admin/campaigns/${dbCampaignId}`, {
              method: "PATCH",
              headers: authHeaders(),
              body: JSON.stringify({
                onChainCampaignId: contractResult.onChainCampaignId,
              }),
            });

            if (contractType === "PARTNER_CAMPAIGNS" && isEscrowConfigured) {
              setTxStep("Creating escrow campaign...");
              const escrowResult = await createEscrowCampaign(
                contractResult.onChainCampaignId,
                (address || EMPTY_ADDRESS) as `0x${string}`,
                BigInt(Math.floor(new Date(data.campaign.endAt || Date.now()).getTime() / 1000)),
              );

              if (escrowResult) {
                await fetch(`/api/admin/campaigns/${dbCampaignId}`, {
                  method: "PATCH",
                  headers: authHeaders(),
                  body: JSON.stringify({
                    escrowId: escrowResult.escrowId,
                  }),
                });
              }
            }

            setTxMessage(
              `Campaign created on-chain. ID ${contractResult.onChainCampaignId} • ${contractResult.txHash.slice(0, 10)}...`,
            );
          } else {
            setTxMessage("Campaign created in the database but on-chain creation was skipped.");
          }
        } else {
          setTxMessage("Campaign created in the database. Contract is not configured.");
        }

        setExpandedCampaignId(dbCampaignId);
      } else {
        setTxMessage(decision === "REJECT" ? "Request rejected." : "Request approved.");
      }

      await Promise.all([fetchCampaigns(), fetchRequests()]);
    } catch {
      setError("Failed to review request.");
    } finally {
      setRequestActionId(null);
      setTxStep(null);
    }
  }

  async function attachRequestToCampaign(campaignId: number, requestId: string) {
    setLinkingCampaignId(campaignId);
    setError(null);
    setTxMessage(null);
    setTxStep("Attaching request to campaign...");

    try {
      const response = await fetch(`/api/admin/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ requestId }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Failed to attach request to campaign.");
        return;
      }

      setTxMessage(`Request ${requestId} attached to campaign #${campaignId}.`);
      await Promise.all([fetchCampaigns(), fetchRequests()]);
    } catch {
      setError("Failed to attach request to campaign.");
    } finally {
      setLinkingCampaignId(null);
      setTxStep(null);
    }
  }

  async function deactivateCampaign(campaign: AdminCampaign) {
    if (campaign.onChainCampaignId === null || campaign.onChainCampaignId === undefined) {
      setError("Campaign has no on-chain ID.");
      return;
    }

    const contractType = (campaign.contractType || "PARTNER_CAMPAIGNS") as
      | "NEXID_CAMPAIGNS"
      | "PARTNER_CAMPAIGNS";

    if (!isConfigured(contractType)) {
      setError(`${contractType} contract is not configured.`);
      return;
    }

    setError(null);
    setTxMessage(null);
    setTxStep("Deactivating campaign on-chain...");

    const result = await deactivateCampaignOnChain(contractType, BigInt(campaign.onChainCampaignId));

    if (!result) {
      setTxStep(null);
      return;
    }

    await fetch(`/api/admin/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ status: "ARCHIVED" }),
    });

    setTxMessage(`Campaign archived • ${result.txHash.slice(0, 10)}...`);
    setTxStep(null);
    await fetchCampaigns();
  }

  const filteredCampaigns = useMemo(() => {
    const term = search.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      const state = getCampaignState(campaign);
      const matchesFilter = campaignFilter === "all" ? true : state === campaignFilter;
      const matchesSearch =
        term.length === 0
          ? true
          : [campaign.title, campaign.sponsorName, campaign.requestId ?? "", campaign.slug]
              .join(" ")
              .toLowerCase()
              .includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [campaignFilter, campaigns, search]);

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      if (requestFilter === "all") return true;
      if (requestFilter === "linked") return Boolean(request.linkedCampaignId);
      return request.status === requestFilter;
    });
  }, [requestFilter, requests]);

  const stats = useMemo(() => {
    const liveCount = campaigns.filter((campaign) => getCampaignState(campaign) === "LIVE").length;
    const draftCount = campaigns.filter((campaign) => getCampaignState(campaign) === "DRAFT").length;
    const endedCount = campaigns.filter((campaign) =>
      ["ENDED", "ARCHIVED"].includes(getCampaignState(campaign)),
    ).length;
    const pendingRequests = requests.filter((request) => request.status === "PENDING").length;

    return {
      liveCount,
      draftCount,
      endedCount,
      pendingRequests,
    };
  }, [campaigns, requests]);

  return (
    <AdminShell active="campaigns" noPadding>
      <div className="flex h-full flex-col bg-black text-white">
        <div className="border-b border-[#151515] bg-[#040404] px-6 py-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-nexid-gold">
                Campaign Management
              </div>
              <h1 className="mt-2 font-display text-3xl text-white">Campaigns + Request Intake</h1>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push("/admin/builder")}
                className="rounded-lg border border-[#2a2a2a] px-4 py-3 text-sm text-white transition-colors hover:bg-[#111]"
              >
                Open Builder
              </button>
              {selectedRequest ? (
                <button
                  type="button"
                  onClick={() => router.push(`/admin/builder?request=${selectedRequest.id}`)}
                  className="rounded-lg bg-nexid-gold px-4 py-3 text-sm font-bold text-black"
                >
                  Build From Selected Request
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Total Campaigns" value={String(campaigns.length)} />
            <StatCard label="Live" value={String(stats.liveCount)} tone="text-green-400" />
            <StatCard label="Drafts" value={String(stats.draftCount)} tone="text-amber-300" />
            <StatCard label="Closed" value={String(stats.endedCount)} tone="text-blue-300" />
            <StatCard label="Pending Requests" value={String(stats.pendingRequests)} tone="text-nexid-gold" />
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}
          {contractError ? (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {contractError}
            </div>
          ) : null}
          {txStep ? (
            <div className="mt-4 rounded-xl border border-nexid-gold/20 bg-nexid-gold/10 px-4 py-3 text-sm text-nexid-gold">
              {txStep}
            </div>
          ) : null}
          {txMessage ? (
            <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
              {txMessage}
            </div>
          ) : null}
          {txHash ? (
            <div className="mt-4 text-[11px] font-mono text-[#8e8e8e]">Tx {txHash.slice(0, 12)}...</div>
          ) : null}
        </div>

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto bg-[#060606] px-6 py-5 custom-scroll">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all", label: `All (${campaigns.length})` },
                  { id: "LIVE", label: `Live (${stats.liveCount})` },
                  { id: "DRAFT", label: `Draft (${stats.draftCount})` },
                  { id: "ENDED", label: `Done (${stats.endedCount})` },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setCampaignFilter(filter.id as CampaignFilter)}
                    className={`rounded-full border px-3 py-2 text-[11px] font-mono uppercase tracking-[0.16em] transition-colors ${
                      campaignFilter === filter.id
                        ? "border-nexid-gold bg-nexid-gold/10 text-nexid-gold"
                        : "border-[#262626] bg-[#0a0a0a] text-[#9a9a9a] hover:text-white"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search campaigns, partner, request id"
                className="w-full max-w-md rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-[#5f5f5f] focus:border-nexid-gold/40"
              />
            </div>

            <div className="space-y-3">
              {campaignsLoading ? (
                <div className="rounded-2xl border border-[#1c1c1c] bg-[#0a0a0a] p-6 text-sm text-[#8c8c8c]">
                  Loading campaigns...
                </div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#2a2a2a] bg-[#0a0a0a] p-8 text-sm text-[#8c8c8c]">
                  No campaigns matched the current filter.
                </div>
              ) : (
                filteredCampaigns.map((campaign) => {
                  const isOpen = expandedCampaignId === campaign.id;
                  const state = getCampaignState(campaign);
                  const moduleSummary = summarizeModules(campaign.modules);
                  const canAttachSelectedRequest =
                    selectedRequest &&
                    !selectedRequest.linkedCampaignId &&
                    !campaign.requestId &&
                    selectedRequest.status !== "REJECTED";

                  return (
                    <div
                      key={campaign.id}
                      className="overflow-hidden rounded-2xl border border-[#1b1b1b] bg-[#0a0a0a]"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedCampaignId((current) => (current === campaign.id ? null : campaign.id))}
                        className="flex w-full items-center gap-4 px-5 py-4 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-display text-lg text-white">{campaign.title}</div>
                          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7f7f7f]">
                            {campaign.sponsorName} • {formatPartnerCampaignPlan(campaign.tier)} • {campaign.participantCount.toLocaleString()} participants
                          </div>
                        </div>

                        {campaign.requestId ? (
                          <span className="rounded-full border border-nexid-gold/20 bg-nexid-gold/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-nexid-gold">
                            Request {campaign.requestId}
                          </span>
                        ) : null}

                        <span
                          className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] ${statusPillClasses(
                            state,
                          )}`}
                        >
                          {state}
                        </span>

                        <div className="font-display text-base text-nexid-gold">
                          ${Number(campaign.prizePoolUsdc || 0).toLocaleString()}
                        </div>
                      </button>

                      {isOpen ? (
                        <div className="border-t border-[#171717] px-5 py-5">
                          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
                            <div className="space-y-4">
                              <div className="rounded-2xl border border-[#1b1b1b] bg-[#070707] p-4">
                                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-nexid-gold">
                                  Objective
                                </div>
                                <p className="mt-3 text-sm leading-6 text-[#d0d0d0]">
                                  {campaign.objective || "No objective added yet."}
                                </p>
                              </div>

                              <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-xl border border-[#1b1b1b] bg-[#070707] p-4">
                                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#727272]">Modules</div>
                                  <div className="mt-2 text-2xl font-display text-white">{moduleSummary.groupCount}</div>
                                </div>
                                <div className="rounded-xl border border-[#1b1b1b] bg-[#070707] p-4">
                                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#727272]">Items</div>
                                  <div className="mt-2 text-2xl font-display text-white">{moduleSummary.itemCount}</div>
                                </div>
                                <div className="rounded-xl border border-[#1b1b1b] bg-[#070707] p-4">
                                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#727272]">Quiz Steps</div>
                                  <div className="mt-2 text-2xl font-display text-white">{moduleSummary.questionCount}</div>
                                </div>
                              </div>

                              {campaign.keyTakeaways?.length ? (
                                <div className="rounded-2xl border border-[#1b1b1b] bg-[#070707] p-4">
                                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#727272]">
                                    Key Takeaways
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {campaign.keyTakeaways.map((takeaway) => (
                                      <span
                                        key={takeaway}
                                        className="rounded-full border border-[#2a2a2a] bg-[#0c0c0c] px-3 py-1.5 text-xs text-[#d3d3d3]"
                                      >
                                        {takeaway}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div className="space-y-4">
                              <div className="rounded-2xl border border-[#1b1b1b] bg-[#070707] p-4">
                                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-nexid-gold">
                                  Campaign Ops
                                </div>
                                <div className="mt-4 space-y-2 text-sm text-[#bdbdbd]">
                                  <div>Starts {formatDate(campaign.startAt)}</div>
                                  <div>Ends {formatDate(campaign.endAt)}</div>
                                  <div>On-chain ID {campaign.onChainCampaignId ?? "Not created"}</div>
                                  <div>Escrow ID {campaign.escrowId ?? "Not created"}</div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => router.push(`/admin/builder?edit=${campaign.id}`)}
                                    className="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-white transition-colors hover:bg-[#111]"
                                  >
                                    Edit Campaign
                                  </button>

                                  {canAttachSelectedRequest ? (
                                    <button
                                      type="button"
                                      disabled={linkingCampaignId === campaign.id}
                                      onClick={() => {
                                        if (!selectedRequest) return;
                                        void attachRequestToCampaign(campaign.id, selectedRequest.id);
                                      }}
                                      className="rounded-lg border border-nexid-gold/20 bg-nexid-gold/10 px-3 py-2 text-xs text-nexid-gold disabled:opacity-50"
                                    >
                                      {linkingCampaignId === campaign.id ? "Attaching..." : "Attach Selected Request"}
                                    </button>
                                  ) : null}

                                  {state === "LIVE" ? (
                                    <button
                                      type="button"
                                      disabled={contractLoading}
                                      onClick={() => deactivateCampaign(campaign)}
                                      className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400 disabled:opacity-50"
                                    >
                                      {contractLoading ? "Processing..." : "Deactivate"}
                                    </button>
                                  ) : null}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-[#1b1b1b] bg-[#070707] p-4">
                                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#727272]">
                                  Request Link
                                </div>
                                <div className="mt-3 text-sm text-[#d0d0d0]">
                                  {campaign.requestId ? (
                                    <>
                                      Linked to {campaign.requestCampaignTitle || "request"} • {campaign.requestId}
                                    </>
                                  ) : (
                                    "Not attached to a campaign request yet."
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </main>

          <aside className="w-full max-w-[420px] overflow-y-auto border-l border-[#161616] bg-[#040404] px-4 py-5 custom-scroll">
            <div className="mb-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-nexid-gold">
                Request Queue
              </div>
              <div className="mt-2 text-xl font-display text-white">Partner Campaign Requests</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { id: "all", label: `All (${requests.length})` },
                  { id: "PENDING", label: `Pending (${stats.pendingRequests})` },
                  {
                    id: "linked",
                    label: `Linked (${requests.filter((request) => Boolean(request.linkedCampaignId)).length})`,
                  },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setRequestFilter(filter.id as RequestFilter)}
                    className={`rounded-full border px-3 py-2 text-[11px] font-mono uppercase tracking-[0.16em] transition-colors ${
                      requestFilter === filter.id
                        ? "border-nexid-gold bg-nexid-gold/10 text-nexid-gold"
                        : "border-[#262626] bg-[#0a0a0a] text-[#9a9a9a] hover:text-white"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {requestsLoading ? (
                <div className="rounded-2xl border border-[#1c1c1c] bg-[#0a0a0a] p-5 text-sm text-[#8c8c8c]">
                  Loading requests...
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#2a2a2a] bg-[#0a0a0a] p-6 text-sm text-[#8c8c8c]">
                  No requests matched the current filter.
                </div>
              ) : (
                filteredRequests.map((request) => {
                  const isSelected = selectedRequest?.id === request.id;
                  return (
                    <div
                      key={request.id}
                      className={`rounded-2xl border p-4 transition-colors ${
                        isSelected
                          ? "border-nexid-gold/30 bg-nexid-gold/5"
                          : "border-[#1c1c1c] bg-[#0a0a0a]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedRequestId(request.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {request.campaignTitle}
                            </div>
                            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6f6f6f]">
                              {request.partnerName} • {formatPartnerCampaignPlan(request.tier)}
                            </div>
                          </div>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] ${statusPillClasses(
                              request.status,
                            )}`}
                          >
                            {request.status}
                          </span>
                        </div>
                      </button>

                      <div className="mt-3 text-sm leading-6 text-[#c9c9c9]">{request.primaryObjective}</div>

                      <div className="mt-3 rounded-xl border border-[#1b1b1b] bg-[#070707] p-3 text-xs text-[#9d9d9d]">
                        Call {request.callBookedFor ? formatDate(request.callBookedFor) : "Not booked"}
                        {request.callTimeSlot ? ` • ${request.callTimeSlot}` : ""}
                        {request.callTimezone ? ` • ${request.callTimezone}` : ""}
                      </div>

                      {request.linkedCampaignId ? (
                        <div className="mt-3 rounded-xl border border-green-500/20 bg-green-500/10 p-3">
                          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-green-400">
                            Linked Campaign
                          </div>
                          <div className="mt-1 text-sm text-white">
                            {request.linkedCampaignTitle || request.campaignTitle}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/builder?request=${request.id}`)}
                          className="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-white transition-colors hover:bg-[#111]"
                        >
                          Open In Builder
                        </button>

                        {!request.linkedCampaignId && request.status !== "REJECTED" ? (
                          <button
                            type="button"
                            disabled={requestActionId === request.id}
                            onClick={() => reviewRequest(request, "APPROVE")}
                            className="rounded-lg bg-nexid-gold px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
                          >
                            {requestActionId === request.id ? "Processing..." : "Quick Create"}
                          </button>
                        ) : null}

                        {!request.linkedCampaignId && request.status === "PENDING" ? (
                          <button
                            type="button"
                            disabled={requestActionId === request.id}
                            onClick={() => reviewRequest(request, "REJECT")}
                            className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        ) : null}

                        {request.linkedCampaignId ? (
                          <button
                            type="button"
                            onClick={() => setExpandedCampaignId(request.linkedCampaignId)}
                            className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-300"
                          >
                            Open Campaign
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      </div>
    </AdminShell>
  );
}
