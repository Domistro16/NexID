"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import AdminShell from "../_components/AdminShell";
import {
  useAdminContract,
  type PartnerCreateParams,
  type NexIDCreateParams,
} from "@/hooks/useAdminContract";

type Project = {
  id: string;
  numericId: number;
  partner: string;
  symbol: string;
  campaign: string;
  tier: string;
  status: "Active" | "Draft" | "Ended";
  escrow: string;
  students: string;
  live: boolean;
  contractType?: string;
  onChainCampaignId?: number | null;
  escrowId?: number | null;
  prizePoolUsdc?: number;
  objective?: string;
  coverImageUrl?: string;
  modules?: { type: string; title: string }[];
  keyTakeaways?: string[];
  type: string;
  title: string;
};

type CampaignRequest = {
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
};

type LeaderboardRow = {
  rank: number | null;
  score: number;
  rewardAmountUsdc: string | null;
  walletAddress: string;
};

function shortAddress(value: string) {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function AdminProjectsPage() {
  const { address } = useAccount();
  const {
    createCampaignOnChain,
    deactivateCampaignOnChain,
    approveUSDC,
    fundEscrowCampaign,
    isEscrowConfigured,
    loading: contractLoading,
    txHash,
    error: contractError,
    isConfigured,
  } = useAdminContract();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [campaignRequests, setCampaignRequests] = useState<CampaignRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [txStep, setTxStep] = useState<string | null>(null);
  const [txMessage, setTxMessage] = useState<string | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("");

  // Campaign notes
  const [notes, setNotes] = useState<Array<{ id: string; content: string; createdAt: string }>>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const selected = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;

  async function fetchCampaigns() {
    setProjectsLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) return;

      const res = await fetch("/api/admin/campaigns", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.campaigns)) {
        return;
      }

      const mapped: Project[] = data.campaigns.map((campaign: any) => {
        // On-chain status is the source of truth; fall back to DB
        let status: "Active" | "Draft" | "Ended";
        if (campaign.onChainStatus) {
          status = campaign.onChainStatus === "Active" ? "Active" : "Ended";
        } else {
          const isTimeEnded = campaign.endAt && new Date(campaign.endAt).getTime() < Date.now();
          status =
            isTimeEnded || campaign.status === "ENDED" || campaign.status === "ARCHIVED"
              ? "Ended"
              : campaign.status === "LIVE"
                ? "Active"
                : "Draft";
        }

        const participantCount = campaign.participantCount ?? 0;

        return {
          id: `C-${String(campaign.id).padStart(3, "0")}`,
          numericId: campaign.id,
          partner: campaign.sponsorName || "Unknown",
          symbol: campaign.sponsorName?.[0]?.toUpperCase() || "C",
          campaign: campaign.title || "Untitled",
          tier: campaign.tier || "STANDARD",
          status,
          escrow: `$${Number(campaign.prizePoolUsdc || 0).toLocaleString()}`,
          students: participantCount > 0 ? participantCount.toLocaleString() : "-",
          live: status === "Active",
          contractType: campaign.contractType,
          onChainCampaignId: campaign.onChainCampaignId ?? null,
          escrowId: campaign.escrowId ?? null,
          prizePoolUsdc: Number(campaign.prizePoolUsdc || 0),
          objective: campaign.objective,
          coverImageUrl: campaign.coverImageUrl,
          modules: campaign.modules,
          keyTakeaways: campaign.keyTakeaways,
        } as Project;
      });

      setProjects(mapped);
      setSelectedId((current) =>
        current && mapped.some((c) => c.id === current) ? current : mapped[0]?.id ?? null,
      );
    } catch {
      // Leave projects empty on failure
    } finally {
      setProjectsLoading(false);
    }
  }

  async function fetchLeaderboard(campaignId: number) {
    setLeaderboardLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.leaderboard)) {
        setLeaderboard(data.leaderboard);
      } else {
        setLeaderboard([]);
      }
    } catch {
      setLeaderboard([]);
    } finally {
      setLeaderboardLoading(false);
    }
  }

  async function fetchCampaignRequests() {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setRequestsError("Missing admin token.");
        return;
      }

      const res = await fetch("/api/admin/campaign-requests?status=PENDING", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setRequestsError(data?.error || "Failed to fetch requests.");
        return;
      }

      setCampaignRequests(data.requests || []);
    } catch {
      setRequestsError("Failed to fetch requests.");
    } finally {
      setRequestsLoading(false);
    }
  }

  async function reviewRequest(id: string, decision: "APPROVE" | "REJECT") {
    setRequestActionId(id);
    setRequestsError(null);
    setTxStep(null);
    setTxMessage(null);
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setRequestsError("Missing admin token.");
        return;
      }

      // Step 1: Approve/reject in DB
      setTxStep(decision === "APPROVE" ? "Approving and creating campaign in DB..." : "Rejecting request...");
      const res = await fetch(`/api/admin/campaign-requests/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          decision,
          createCampaign: decision === "APPROVE",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRequestsError(data?.error || "Failed to review request.");
        return;
      }

      // Step 2: If approved, also create on-chain
      if (decision === "APPROVE" && data?.campaign?.id) {
        const dbCampaignId = data.campaign.id;
        const campaignData = data.campaign;
        // Determine contract type (default to PARTNER_CAMPAIGNS for partner campaign requests)
        const contractType = (campaignData.contractType || "PARTNER_CAMPAIGNS").toUpperCase() as "NEXID_CAMPAIGNS" | "PARTNER_CAMPAIGNS";

        if (isConfigured(contractType)) {
          setTxStep("Please confirm the on-chain createCampaign transaction in your wallet...");

          let contractResult: { onChainCampaignId: number; txHash: string } | null = null;

          if (contractType === "NEXID_CAMPAIGNS") {
            const params: NexIDCreateParams = {
              title: campaignData.title || "",
              description: campaignData.objective || "",
              longDescription: campaignData.objective || "",
              instructor: campaignData.sponsorName || "NexID",
              objectives: campaignData.keyTakeaways || [],
              prerequisites: [],
              category: campaignData.tier || "STANDARD",
              level: "Beginner",
              thumbnailUrl: campaignData.coverImageUrl || "",
              duration: "4 weeks",
              totalLessons: BigInt(campaignData.modules?.length || 1),
            };
            contractResult = await createCampaignOnChain("NEXID_CAMPAIGNS", params);
          } else {
            const params: PartnerCreateParams = {
              title: campaignData.title || "",
              description: campaignData.objective || "",
              category: campaignData.tier || "STANDARD",
              level: "Beginner",
              thumbnailUrl: campaignData.coverImageUrl || "",
              duration: "4 weeks",
              totalTasks: BigInt(campaignData.modules?.length || 1),
              sponsor: (address || "0x0000000000000000000000000000000000000000") as `0x${string}`,
              sponsorName: campaignData.sponsorName || "",
              sponsorLogo: campaignData.coverImageUrl || "",
              prizePool: BigInt(Math.round((Number(campaignData.prizePoolUsdc) || 0) * 1e6)),
              startTime: BigInt(Math.floor(Date.now() / 1000)),
              endTime: BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60),
            };
            contractResult = await createCampaignOnChain("PARTNER_CAMPAIGNS", params);
          }

          // Step 3: Store on-chain campaign ID in DB
          if (contractResult) {
            setTxStep("Storing on-chain ID in database...");
            await fetch(`/api/admin/campaigns/${dbCampaignId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                onChainCampaignId: contractResult.onChainCampaignId,
              }),
            });
            setTxMessage(
              `Campaign created on-chain! ID: ${contractResult.onChainCampaignId} | Tx: ${contractResult.txHash.slice(0, 10)}...`,
            );
          } else {
            setTxMessage("Campaign created in DB but contract tx failed or was rejected.");
          }
        } else {
          setTxMessage("Campaign created in DB. Contract not configured — skipped on-chain.");
        }
      }

      setTxStep(null);
      await fetchCampaignRequests();
      if (decision === "APPROVE") {
        await fetchCampaigns();
      }
    } catch {
      setRequestsError("Failed to review request.");
    } finally {
      setRequestActionId(null);
      setTxStep(null);
    }
  }

  async function deactivateCampaign(project: Project) {
    if (!project.onChainCampaignId && project.onChainCampaignId !== 0) {
      setRequestsError("Campaign has no on-chain ID — cannot deactivate on-chain.");
      return;
    }

    const contractType = (project.contractType || "PARTNER_CAMPAIGNS") as "NEXID_CAMPAIGNS" | "PARTNER_CAMPAIGNS";
    if (!isConfigured(contractType)) {
      setRequestsError(`${contractType} contract not configured.`);
      return;
    }

    setTxStep("Please confirm the deactivateCampaign transaction in your wallet...");
    setTxMessage(null);

    const result = await deactivateCampaignOnChain(contractType, BigInt(project.onChainCampaignId));

    if (result) {
      // Update DB status to ARCHIVED
      const token = localStorage.getItem("auth_token");
      if (token) {
        await fetch(`/api/admin/campaigns/${project.numericId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: "ARCHIVED" }),
        });
      }

      setTxMessage(`Campaign deactivated on-chain! Tx: ${result.txHash.slice(0, 14)}...`);
      await fetchCampaigns();
    } else {
      setTxMessage("Deactivation failed or was rejected.");
    }

    setTxStep(null);
  }

  useEffect(() => {
    fetchCampaigns();
    fetchCampaignRequests();
  }, []);

  useEffect(() => {
    if (selected?.numericId) {
      fetchLeaderboard(selected.numericId);
    } else {
      setLeaderboard([]);
    }
  }, [selected?.numericId]);

  return (
    <AdminShell active="projects">
      <section className="max-w-[1600px] mx-auto space-y-4">
        <div className="admin-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-mono uppercase tracking-widest text-nexid-gold">
              Pending Campaign Requests
            </h3>
            <span className="text-[10px] font-mono text-nexid-muted">
              {campaignRequests.length} pending
            </span>
          </div>
          {requestsError ? <p className="mb-3 text-xs text-red-500">{requestsError}</p> : null}
          {contractError ? <p className="mb-3 text-xs text-red-500">{contractError}</p> : null}
          {txStep ? <p className="mb-3 text-xs text-nexid-gold animate-pulse">{txStep}</p> : null}
          {txMessage ? <p className="mb-3 text-xs text-green-400">{txMessage}</p> : null}
          {txHash ? (
            <p className="mb-3 text-[10px] font-mono text-nexid-muted">
              Tx: <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-nexid-gold hover:underline">{String(txHash).slice(0, 14)}...</a>
            </p>
          ) : null}
          {requestsLoading ? (
            <p className="text-xs text-nexid-muted">Loading requests...</p>
          ) : campaignRequests.length === 0 ? (
            <p className="text-xs text-nexid-muted">No pending campaign requests.</p>
          ) : (
            <div className="space-y-2">
              {campaignRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-lg border border-[#222] bg-[#0a0a0a] p-3"
                >
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-white">
                      {request.campaignTitle}
                    </div>
                    <div className="font-mono text-[10px] text-nexid-muted">
                      {request.tier} - ${Number(request.prizePoolUsdc).toLocaleString()} USDC
                    </div>
                  </div>
                  <div className="mb-2 text-[11px] text-nexid-muted">
                    {request.partnerName}
                    {request.partnerNamespace ? ` (${request.partnerNamespace})` : ""}
                  </div>
                  <p className="mb-3 line-clamp-2 text-xs text-white/80">
                    {request.primaryObjective}
                  </p>
                  <div className="mb-3 rounded border border-[#222] bg-[#050505] px-3 py-2 text-[11px] text-white/70">
                    <span className="font-mono uppercase tracking-wider text-nexid-gold">
                      Strategy Call:
                    </span>{" "}
                    {request.callBookedFor
                      ? `${new Date(request.callBookedFor).toLocaleDateString()} at ${request.callTimeSlot ?? "TBD"} (${request.callTimezone ?? "UTC"})`
                      : "Not booked"}
                    {request.callBookingNotes ? (
                      <div className="mt-1 text-nexid-muted">
                        Notes: {request.callBookingNotes}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => reviewRequest(request.id, "APPROVE")}
                      disabled={requestActionId === request.id}
                      className="rounded border border-green-500/30 bg-green-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-green-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Approve + Create Campaign
                    </button>
                    <button
                      type="button"
                      onClick={() => reviewRequest(request.id, "REJECT")}
                      disabled={requestActionId === request.id}
                      className="rounded border border-red-500/30 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-[#050505] p-2 rounded-lg border border-[#1a1a1a]">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input type="text" placeholder="Filter campaigns (Cmd+K)" className="admin-input px-3 py-1.5 w-64 border-none" />
            <select className="admin-input px-3 py-1.5 w-32 border-none">
              <option>Status: All</option>
              <option>Live</option>
              <option>Draft</option>
              <option>Ended</option>
            </select>
          </div>
          <button className="px-4 py-1.5 bg-white text-black text-xs font-bold rounded hover:bg-gray-200 transition-colors shrink-0">
            + New Campaign
          </button>
        </div>

        <div className="admin-panel overflow-hidden flex flex-col lg:flex-row h-[600px]">
          <div className="w-full lg:w-2/3 border-r border-[#1a1a1a] overflow-y-auto custom-scroll">
            {projectsLoading ? (
              <div className="p-6 text-sm text-nexid-muted">Loading campaigns...</div>
            ) : projects.length === 0 ? (
              <div className="p-6 text-sm text-nexid-muted">No campaigns found. Create one from the Campaign Architect.</div>
            ) : (
              <table className="linear-table">
                <thead>
                  <tr>
                    <th className="w-12">ID</th>
                    <th className="w-48">Partner Protocol</th>
                    <th className="w-auto">Campaign Designation</th>
                    <th className="w-24">Tier</th>
                    <th className="w-24">Status</th>
                    <th className="w-24 text-right">Escrow</th>
                    <th className="w-24 text-right">Students</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr
                      key={project.id}
                      className={`${selected?.id === project.id ? "active-row" : ""} ${project.status === "Ended" ? "opacity-60" : ""}`}
                      onClick={() => setSelectedId(project.id)}
                    >
                      <td className="font-mono text-nexid-muted">{project.id}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-sm bg-[#111] border border-[#333] flex items-center justify-center text-[8px] font-bold text-white">
                            {project.symbol}
                          </div>
                          <span className="font-medium text-white">{project.partner}</span>
                        </div>
                      </td>
                      <td className="text-white/90">{project.campaign}</td>
                      <td>
                        <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#333] bg-[#111] text-nexid-muted">{project.tier}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${project.status === "Active" ? "bg-green-500" : project.status === "Draft" ? "bg-nexid-gold animate-pulse" : "bg-[#555]"}`} />
                          <span className={project.status === "Draft" ? "text-nexid-gold" : project.status === "Ended" ? "text-[#888]" : "text-white"}>
                            {project.status}
                          </span>
                        </div>
                      </td>
                      <td className={`font-mono text-right ${project.live ? "text-nexid-gold" : "text-white/50"}`}>{project.escrow}</td>
                      <td className={`font-mono text-right ${project.live ? "text-white/80" : "text-white/30"}`}>{project.students}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="w-full lg:w-1/3 bg-[#030303] flex flex-col">
            <div className="p-4 border-b border-[#1a1a1a] bg-[#0a0a0a]">
              <div className="flex justify-between items-start mb-2">
                <div className="text-[9px] font-mono text-nexid-gold tracking-widest uppercase">Project Leaderboard</div>
                <div className="text-[9px] font-mono text-nexid-muted">{selected?.id ?? "-"}</div>
              </div>
              <h3 className="text-sm font-bold text-white truncate">{selected?.campaign ?? "Select a campaign"}</h3>
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll p-2">
              {leaderboardLoading ? (
                <div className="p-4 text-xs text-nexid-muted">Loading leaderboard...</div>
              ) : !selected ? (
                <div className="p-4 text-xs text-nexid-muted">No campaign selected.</div>
              ) : leaderboard.length === 0 ? (
                <div className="p-4 text-xs text-nexid-muted">No leaderboard entries yet.</div>
              ) : (
                leaderboard.map((row, idx) => {
                  const rank = row.rank ?? idx + 1;
                  const color = rank === 1 ? "text-[#FFD700]" : rank === 2 ? "text-[#C0C0C0]" : rank === 3 ? "text-[#CD7F32]" : "text-nexid-muted";
                  return (
                    <div key={`${row.walletAddress}-${rank}`} className="flex justify-between items-center p-2.5 border-b border-[#111] hover:bg-[#111] rounded transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`w-4 text-center font-mono text-xs font-bold ${color}`}>{rank}</span>
                        <span className="text-xs text-white">{shortAddress(row.walletAddress)}</span>
                      </div>
                      <span className={`font-mono text-xs ${color}`}>{row.score.toLocaleString()} pts</span>
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-3 border-t border-[#1a1a1a] bg-[#0a0a0a]">
              <button className="w-full py-2 border border-[#333] text-xs text-white rounded hover:bg-[#111] transition-colors">Export CSV Data</button>
              {selected && (
                <a
                  href={`/admin/builder?edit=${selected.numericId}`}
                  className="block w-full mt-2 py-2 border border-nexid-gold/30 bg-nexid-gold/10 text-xs font-bold text-nexid-gold text-center rounded hover:bg-nexid-gold/20 transition-colors"
                >
                  Edit Campaign
                </a>
              )}

              {selected && selected.status === "Active" && (
                <button
                  type="button"
                  onClick={() => deactivateCampaign(selected)}
                  disabled={contractLoading}
                  className="w-full mt-2 py-2 border border-red-500/30 bg-red-500/10 text-xs font-bold text-red-500 rounded hover:bg-red-500/20 transition-colors disabled:opacity-60"
                >
                  {contractLoading ? "Processing..." : "Deactivate Campaign"}
                </button>
              )}

              {/* Fund Campaign */}
              {selected && selected.escrowId != null && isEscrowConfigured && (
                <>
                  {!fundingOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFundingOpen(true);
                        setFundAmount(String(selected.prizePoolUsdc ?? 0));
                      }}
                      className="w-full mt-2 py-2 border border-nexid-gold/30 bg-nexid-gold/10 text-xs font-bold text-nexid-gold rounded hover:bg-nexid-gold/20 transition-colors"
                    >
                      Fund Campaign (USDC)
                    </button>
                  ) : (
                    <div className="mt-2 rounded-lg border border-nexid-gold/20 bg-[#0a0a0a] p-3 space-y-3">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-nexid-gold">
                        Fund Escrow #{selected.escrowId}
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-mono text-nexid-muted uppercase">Amount (USDC)</label>
                        <input
                          type="number"
                          min={1}
                          value={fundAmount}
                          onChange={(e) => setFundAmount(e.target.value)}
                          className="admin-input w-full font-mono"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={contractLoading || !fundAmount}
                          onClick={async () => {
                            const usdcAmount = BigInt(Math.round(Number(fundAmount) * 1e6));
                            if (usdcAmount <= 0n) return;

                            setTxStep("Step 1/2: Approving USDC — confirm in wallet...");
                            setTxMessage(null);
                            const approval = await approveUSDC(usdcAmount);
                            if (!approval) {
                              setTxStep(null);
                              return;
                            }

                            setTxStep("Step 2/2: Funding escrow — confirm in wallet...");
                            const fund = await fundEscrowCampaign(selected.escrowId!, usdcAmount);
                            setTxStep(null);

                            if (fund) {
                              setTxMessage(`Funded! ${Number(fundAmount).toLocaleString()} USDC deposited. Tx: ${fund.txHash.slice(0, 14)}...`);
                              setFundingOpen(false);
                            }
                          }}
                          className="flex-1 py-2 bg-nexid-gold text-black text-xs font-bold rounded disabled:opacity-60"
                        >
                          {contractLoading ? "Processing..." : `Fund $${Number(fundAmount || 0).toLocaleString()}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFundingOpen(false)}
                          className="px-3 py-2 border border-[#333] text-xs text-white rounded hover:bg-[#111]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {/* ── Campaign Notes ── */}
              <div className="mt-4 border-t border-[#222] pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setNotesOpen(!notesOpen);
                    if (!notesOpen && selected) {
                      setNotesLoading(true);
                      const token = localStorage.getItem("auth_token");
                      fetch(`/api/admin/campaigns/${selected.numericId}/notes`, {
                        headers: { Authorization: `Bearer ${token}` },
                      })
                        .then((r) => r.json())
                        .then((body) => setNotes(body.notes ?? []))
                        .catch(() => setNotes([]))
                        .finally(() => setNotesLoading(false));
                    }
                  }}
                  className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-nexid-muted hover:text-white transition-colors w-full"
                >
                  <span>{notesOpen ? "▾" : "▸"}</span>
                  <span>Notes ({notes.length})</span>
                </button>
                {notesOpen && (
                  <div className="mt-3 space-y-3">
                    <div className="flex gap-2">
                      <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add an encrypted note..."
                        className="admin-input flex-1 h-16 resize-none text-xs"
                      />
                      <button
                        type="button"
                        disabled={!newNote.trim() || noteSaving}
                        onClick={async () => {
                          if (!selected) return;
                          setNoteSaving(true);
                          try {
                            const token = localStorage.getItem("auth_token");
                            const res = await fetch(`/api/admin/campaigns/${selected.numericId}/notes`, {
                              method: "POST",
                              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                              body: JSON.stringify({ content: newNote }),
                            });
                            if (res.ok) {
                              const body = await res.json();
                              setNotes([body.note, ...notes]);
                              setNewNote("");
                            }
                          } catch { /* ignore */ }
                          setNoteSaving(false);
                        }}
                        className="self-end rounded border border-nexid-gold/30 bg-nexid-gold/10 px-3 py-1.5 text-[10px] font-bold uppercase text-nexid-gold disabled:opacity-40 hover:bg-nexid-gold/20"
                      >
                        {noteSaving ? "..." : "Add"}
                      </button>
                    </div>
                    {notesLoading ? (
                      <div className="text-xs text-nexid-muted">Loading...</div>
                    ) : notes.length === 0 ? (
                      <div className="text-xs text-nexid-muted">No notes yet.</div>
                    ) : (
                      notes.map((note) => (
                        <div key={note.id} className="rounded-lg border border-[#222] bg-[#050505] p-3">
                          <div className="flex justify-between items-start mb-1">
                            <div className="text-[9px] font-mono text-nexid-muted">
                              {new Date(note.createdAt).toLocaleString()}
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!selected) return;
                                const token = localStorage.getItem("auth_token");
                                await fetch(`/api/admin/campaigns/${selected.numericId}/notes?noteId=${note.id}`, {
                                  method: "DELETE",
                                  headers: { Authorization: `Bearer ${token}` },
                                });
                                setNotes(notes.filter((n) => n.id !== note.id));
                              }}
                              className="text-[9px] text-red-500/60 hover:text-red-400"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="text-xs text-white/80 whitespace-pre-wrap">{note.content}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
