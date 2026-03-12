"use client";

import Link from "next/link";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useENSName } from "@/hooks/getPrimaryName";

type GlobalView = "dashboard" | "profile";
type ProfileTab = "general" | "wallets" | "security" | "prefs";

type LeaderboardRow = {
  rank: number;
  walletAddress: string;
  totalPoints: number;
  campaignsFinished: number;
  totalScore: number;
};

type UserCampaign = {
  campaignId: number;
  title: string;
  status: string;
  score: number;
  rank: number | null;
  completedAt: string | null;
  enrolledAt: string;
  modules: unknown[];
  coverImageUrl: string | null;
  sponsorName: string;
};

type FeaturedCampaign = {
  id: number;
  slug: string;
  title: string;
  objective: string;
  coverImageUrl: string | null;
  status: string;
  tier: string;
};

type EndedCampaignClaim = {
  campaignId: number;
  title: string;
  sponsorName: string;
  coverImageUrl: string | null;
  prizePoolUsdc: string;
  endAt: string | null;
  escrowId: number | null;
  escrowAddress: string | null;
  rank: number | null;
  score: number;
  rewardAmountUsdc: string | null;
  claimed: boolean;
  claimedAt: string | null;
  rewardTxHash: string | null;
  merkleProof: string[] | null;
  claimReady: boolean;
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 12) return addr || "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function InteractiveTerminalPage() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [authWalletAddress, setAuthWalletAddress] = useState<string | null>(null);
  const hasToken = typeof window !== "undefined" && !!localStorage.getItem("auth_token");
  const identityAddress = authWalletAddress ?? address ?? null;
  const { name: ensName } = useENSName({
    owner: (identityAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  });

  const displayName = ensName ? String(ensName) : shortAddr(identityAddress ?? "");

  const [view, setView] = useState<GlobalView>("dashboard");
  const [profileTab, setProfileTab] = useState<ProfileTab>("general");
  const [slide, setSlide] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [top100Open, setTop100Open] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [cardTransform, setCardTransform] = useState("rotateX(0deg) rotateY(0deg)");
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);

  // ── Data state ──
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [userCampaigns, setUserCampaigns] = useState<UserCampaign[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [featuredCampaigns, setFeaturedCampaigns] = useState<FeaturedCampaign[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);

  // ── Ended Campaigns claim state ──
  const [endedClaims, setEndedClaims] = useState<EndedCampaignClaim[]>([]);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<{ campaignId: number; txHash: string } | null>(null);

  // ── Fetch global leaderboard (public) ──
  useEffect(() => {
    fetch("/api/leaderboard")
      .then(async (res) => {
        if (res.ok) {
          const body = await res.json();
          setLeaderboard(body.leaderboard ?? []);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (!hasToken) {
      setAuthWalletAddress(null);
      return;
    }

    fetch("/api/user/profile", { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        const walletAddress = typeof body?.user?.walletAddress === "string"
          ? body.user.walletAddress
          : null;
        setAuthWalletAddress(walletAddress);
      })
      .catch(() => setAuthWalletAddress(null));
  }, [hasToken]);

  // ── Compute user rank from leaderboard ──
  useEffect(() => {
    if (!identityAddress || leaderboard.length === 0) return;
    const idx = leaderboard.findIndex(
      (r) => r.walletAddress.toLowerCase() === identityAddress.toLowerCase(),
    );
    if (idx >= 0) {
      setUserRank(idx + 1);
      setTotalPoints(leaderboard[idx].totalPoints);
    }
  }, [identityAddress, leaderboard]);

  // ── Fetch user campaigns (authenticated) ──
  useEffect(() => {
    if (!hasToken) return;
    fetch("/api/user/campaigns", { headers: authHeaders() })
      .then(async (res) => {
        if (res.ok) {
          const body = await res.json();
          setUserCampaigns(body.campaigns ?? []);
        }
      })
      .catch(() => { });
  }, [hasToken]);

  // ── Fetch user stats (authenticated) ──
  useEffect(() => {
    if (!hasToken) return;
    fetch("/api/user/stats", { headers: authHeaders() })
      .then(async (res) => {
        if (res.ok) {
          const body = await res.json();
          setTotalPoints((prev) => body.totalPoints ?? prev);
        }
      })
      .catch(() => { });
  }, [hasToken]);

  // ── Fetch featured campaigns for carousel (public) ──
  useEffect(() => {
    fetch("/api/campaigns?includeDraft=false")
      .then(async (res) => {
        if (res.ok) {
          const body = await res.json();
          const campaigns = (body.campaigns ?? []) as FeaturedCampaign[];
          setFeaturedCampaigns(campaigns.slice(0, 5));
        }
      })
      .catch(() => { });
  }, []);

  // ── Carousel rotation ──
  useEffect(() => {
    if (featuredCampaigns.length <= 1) return;
    const interval = setInterval(() => {
      setSlide((prev) => (prev + 1) % featuredCampaigns.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [featuredCampaigns.length]);

  // ── Fetch claim info for ended campaigns the user participated in ──
  useEffect(() => {
    if (!hasToken) return;
    const endedIds = userCampaigns
      .filter((c) => c.status === "ENDED")
      .map((c) => c.campaignId);
    if (endedIds.length === 0) {
      setEndedClaims([]);
      return;
    }

    Promise.all(
      endedIds.map((id) =>
        fetch(`/api/campaigns/${id}/claim`, { headers: authHeaders() })
          .then(async (res) => (res.ok ? res.json() : null))
          .catch(() => null),
      ),
    ).then((results) => {
      setEndedClaims(results.filter(Boolean) as EndedCampaignClaim[]);
    });
  }, [hasToken, userCampaigns]);

  // ── Claim reward handler (EIP-712 gasless signature) ──
  const handleClaim = useCallback(
    async (claim: EndedCampaignClaim) => {
      if (!walletClient || !address || !claim.escrowAddress || claim.escrowId === null || !claim.rewardAmountUsdc) return;

      setClaimingId(claim.campaignId);
      setClaimError(null);
      setClaimSuccess(null);

      try {
        // 10-minute deadline
        const deadline = Math.floor(Date.now() / 1000) + 600;

        // USDC has 6 decimals — rewardAmountUsdc is stored as a decimal string (e.g. "150.000000")
        const amountRaw = BigInt(
          Math.round(parseFloat(claim.rewardAmountUsdc) * 1_000_000),
        );

        const chainId = await walletClient.getChainId();

        // Sign EIP-712 typed data
        const signature = await walletClient.signTypedData({
          domain: {
            name: "CampaignEscrow",
            version: "1",
            chainId,
            verifyingContract: claim.escrowAddress as `0x${string}`,
          },
          types: {
            ClaimReward: [
              { name: "escrowId", type: "uint256" },
              { name: "claimer", type: "address" },
              { name: "amount", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          primaryType: "ClaimReward",
          message: {
            escrowId: BigInt(claim.escrowId),
            claimer: address,
            amount: amountRaw,
            deadline: BigInt(deadline),
          },
        });

        // Submit to backend relayer
        const res = await fetch(`/api/campaigns/${claim.campaignId}/claim/submit`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ signature, deadline }),
        });

        const body = await res.json();

        if (!res.ok) {
          setClaimError(body.error || "Claim failed");
          return;
        }

        setClaimSuccess({ campaignId: claim.campaignId, txHash: body.txHash });

        // Update local state
        setEndedClaims((prev) =>
          prev.map((c) =>
            c.campaignId === claim.campaignId
              ? { ...c, claimed: true, claimedAt: new Date().toISOString(), rewardTxHash: body.txHash, claimReady: false }
              : c,
          ),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Claim failed";
        if (msg.includes("rejected") || msg.includes("denied")) {
          setClaimError("Signature rejected by wallet");
        } else {
          setClaimError(msg);
        }
      } finally {
        setClaimingId(null);
      }
    },
    [walletClient, address],
  );

  const activeCampaign = useMemo(
    () => userCampaigns.find((c) => !c.completedAt && c.status === "LIVE"),
    [userCampaigns],
  );

  const leaderboardTop10 = leaderboard.slice(0, 10);

  const handleCardMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rx = ((y - cy) / cy) * -12;
    const ry = ((x - cx) / cx) * 12;
    setCardTransform(`rotateX(${rx}deg) rotateY(${ry}deg)`);
    setGlare({ x: (x / rect.width) * 100, y: (y / rect.height) * 100, opacity: 1 });
  }, []);

  const handleCardLeave = useCallback(() => {
    setCardTransform("rotateX(0deg) rotateY(0deg)");
    setGlare((prev) => ({ ...prev, opacity: 0 }));
  }, []);

  return (
    <div className="nexid-terminal flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="z-40 flex w-20 shrink-0 flex-col border-r border-nexid-border bg-nexid-base/90 backdrop-blur-xl lg:w-64">
        <Link href="/" className="flex h-20 cursor-pointer items-center justify-center border-b border-nexid-border lg:justify-start lg:px-8">
          <div className="font-display text-2xl font-black tracking-tighter">
            N<span className="hidden lg:inline">ex</span>ID
            <span className="text-nexid-gold">.</span>
          </div>
        </Link>

        <nav className="flex-1 space-y-2 px-3 py-8">
          <SideItem label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
          <SideItem label="Profile Settings" active={view === "profile"} onClick={() => setView("profile")} />
          <Link
            href="/academy"
            className="group flex w-full items-center justify-center gap-4 rounded-xl border border-transparent px-3 py-3.5 text-nexid-muted transition-all hover:bg-white/5 hover:text-white lg:justify-start lg:px-4"
          >
            <span className="hidden text-sm font-medium lg:block">Academy</span>
            <span className="text-sm lg:hidden">A</span>
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="custom-scroll relative flex h-full flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-30 flex h-20 shrink-0 items-center justify-between border-b border-nexid-border bg-nexid-base/80 px-8 backdrop-blur-md">
          <h1 className="font-display text-xl tracking-tight text-white">
            {view === "dashboard" ? "Dashboard" : "Profile Settings"}
          </h1>
          <div className="flex items-center gap-6">
            <div className="hidden items-center gap-3 md:flex">
              <div className="shadow-inner-glaze rounded-md border border-[#222] bg-[#111] px-3 py-1.5 font-mono text-[11px] text-nexid-gold">
                <span className="mr-2 text-white/40">BAL</span> {totalPoints.toLocaleString()} Nex Points
              </div>
            </div>
            <button type="button" onClick={() => setView("profile")} className="h-9 w-9 rounded-full border border-[#333] p-0.5 hover:border-nexid-gold">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-nexid-gold/20 text-xs font-bold text-nexid-gold">
                {displayName ? displayName.charAt(0).toUpperCase() : "?"}
              </div>
            </button>
          </div>
        </header>

        {/* ════════════ DASHBOARD VIEW ════════════ */}
        {view === "dashboard" ? (
          <section className="mx-auto w-full max-w-[1400px] space-y-8 p-6 lg:p-10">
            {/* Top row: ID Card · Active Campaign · Carousel */}
            <div className="grid auto-rows-fr grid-cols-1 gap-6 lg:grid-cols-3">
              {/* ── ID Card ── */}
              <div className="id-card-wrapper min-h-[220px]">
                <div
                  ref={cardRef}
                  className="id-card premium-panel relative h-full w-full cursor-crosshair overflow-hidden border-white/10 p-6 shadow-premium"
                  style={{ transform: cardTransform }}
                  onMouseMove={handleCardMove}
                  onMouseLeave={handleCardLeave}
                >
                  <div className="id-card-bg" />
                  <div
                    className="id-card-glare"
                    style={{
                      opacity: glare.opacity,
                      background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.15), transparent 50%)`,
                    }}
                  />
                  <div className="id-card-content relative z-10 flex h-full flex-col justify-between">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-display text-2xl font-black text-white">
                          NexID<span className="text-nexid-gold">.</span>
                        </div>
                        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-nexid-gold">
                          Interactive Asset
                        </div>
                      </div>
                      {isConnected ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-nexid-gold/30 bg-nexid-gold/10">
                          <span className="text-xs text-nexid-gold">&#10003;</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-8">
                      <div className="font-display mb-1 text-3xl tracking-tight text-white">
                        {displayName || "Connect Wallet"}
                      </div>
                      <div className="flex items-center justify-between font-mono text-[11px] text-white/60">
                        <span>{identityAddress ? shortAddr(identityAddress) : "--"}</span>
                        <span>{totalPoints.toLocaleString()} pts</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Active Campaign Card ── */}
              <div className="premium-panel group relative flex min-h-[220px] flex-col justify-between overflow-hidden p-6">
                {activeCampaign?.coverImageUrl ? (
                  <img src={activeCampaign.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-luminosity transition-transform duration-1000 group-hover:scale-105" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[#111] to-[#050505]" />
                )}
                <div className="relative z-10 mb-6 flex items-start justify-between">
                  <div className="shadow-inner-glaze rounded bg-white/5 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white border border-white/10">
                    {activeCampaign ? "Active Campaign" : "No Active Campaign"}
                  </div>
                  {activeCampaign ? (
                    <Link href={`/academy/campaign/${activeCampaign.campaignId}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white">&#9654;</Link>
                  ) : null}
                </div>
                <div className="relative z-10 mt-auto">
                  {activeCampaign ? (
                    <>
                      <h3 className="font-display mb-1 text-lg text-white">{activeCampaign.title}</h3>
                      <p className="mb-4 text-xs text-nexid-muted">{activeCampaign.sponsorName}</p>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-nexid-gold">{activeCampaign.score} pts</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="font-display mb-1 text-lg text-white">Browse Campaigns</h3>
                      <Link href="/academy" className="mt-2 inline-block rounded bg-nexid-gold px-4 py-2 text-xs font-bold text-black">
                        Explore Academy
                      </Link>
                    </>
                  )}
                </div>
              </div>

              {/* ── Campaigns Carousel ── */}
              <div className="premium-panel relative min-h-[220px] overflow-hidden">
                {featuredCampaigns.length > 1 ? (
                  <div className="absolute right-4 top-4 z-20 flex gap-1.5">
                    {featuredCampaigns.map((_, idx) => (
                      <div key={idx} className={`h-1.5 w-1.5 rounded-full ${slide === idx ? "bg-nexid-gold" : "bg-white/20"}`} />
                    ))}
                  </div>
                ) : null}
                {featuredCampaigns.length > 0 ? (
                  featuredCampaigns.map((c, idx) => (
                    <div key={c.id} className={`carousel-item flex h-full flex-col justify-between p-6 ${slide === idx ? "active" : ""}`}>
                      {c.coverImageUrl ? (
                        <img src={c.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-luminosity" />
                      ) : null}
                      <div className="relative z-10 self-start rounded border border-white/10 bg-black/50 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white">
                        {c.status === "LIVE" ? c.tier : c.status}
                      </div>
                      <div className="relative z-10">
                        <h3 className="font-display mb-1 text-lg text-white">{c.title}</h3>
                        <div className="mt-2 flex items-center justify-between">
                          <p className="truncate pr-4 text-xs text-nexid-muted">{c.objective}</p>
                          <Link href={`/academy/campaign/${c.id}`} className="shrink-0 rounded bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-black">
                            View
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full items-center justify-center p-6 text-sm text-nexid-muted">
                    No campaigns available yet.
                  </div>
                )}
              </div>
            </div>

            {/* ── Leaderboard + Global Comm ── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Leaderboard */}
              <div className="premium-panel flex h-[500px] flex-col lg:col-span-7">
                <div className="flex items-center justify-between border-b border-[#1a1a1a] p-5">
                  <h3 className="font-display text-lg text-white">Global Hierarchy</h3>
                </div>
                <div className="custom-scroll flex-1 overflow-y-auto p-3">
                  {/* Current user highlight */}
                  {address && userRank ? (
                    <div className="mb-4 flex items-center justify-between rounded-lg border border-nexid-gold/30 bg-[#111]/95 p-3">
                      <div className="flex items-center gap-4">
                        <div className="w-6 text-center font-mono text-sm font-bold text-nexid-gold">{userRank}</div>
                        <div className="font-medium text-white">
                          {displayName || shortAddr(identityAddress ?? "")}{" "}
                          <span className="rounded border border-white/5 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-nexid-muted">YOU</span>
                        </div>
                      </div>
                      <div className="font-mono text-sm text-nexid-gold">{totalPoints.toLocaleString()} pts</div>
                    </div>
                  ) : null}

                  {leaderboardTop10.length > 0 ? (
                    leaderboardTop10.map((row) => (
                      <RankRow
                        key={row.rank}
                        rank={row.rank}
                        name={shortAddr(row.walletAddress)}
                        score={`${row.totalPoints.toLocaleString()} pts`}
                      />
                    ))
                  ) : (
                    <div className="p-6 text-center text-sm text-nexid-muted">Leaderboard data loading...</div>
                  )}
                </div>
                <div className="rounded-b-xl border-t border-[#1a1a1a] bg-[#0a0a0a] p-4">
                  <button type="button" onClick={() => setTop100Open(true)} className="w-full rounded-lg border border-[#222] bg-[#111] py-2.5 text-sm font-medium text-white hover:border-white/20">
                    View Top 100 Ledger
                  </button>
                </div>
              </div>

              {/* Global Comm */}
              <div className="premium-panel flex h-[500px] flex-col lg:col-span-5">
                <div className="flex items-center justify-between border-b border-[#1a1a1a] p-5">
                  <h3 className="font-display flex items-center gap-2 text-lg text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                    Global Comm
                  </h3>
                  <button type="button" onClick={() => setRulesOpen(true)} className="rounded border border-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-nexid-gold hover:border-nexid-gold/30">
                    Protocol Rules
                  </button>
                </div>
                <div className="custom-scroll flex-1 space-y-5 overflow-y-auto p-5 text-sm">
                  <div className="flex h-full items-center justify-center text-sm text-nexid-muted">
                    Global comm channel coming soon.
                  </div>
                </div>
                <div className="rounded-b-xl border-t border-[#1a1a1a] bg-[#0a0a0a] p-4">
                  <div className="flex items-center rounded-lg border border-[#222] bg-[#111]">
                    <span className="absolute ml-3 font-mono text-[10px] tracking-widest text-nexid-gold">{displayName || "anon"} &gt;</span>
                    <input type="text" placeholder="Execute message..." className="w-full border-none bg-transparent py-3 pl-[90px] pr-10 text-sm text-white placeholder:text-nexid-muted/50 focus:outline-none" disabled />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Ended Campaigns — Claim Terminal ── */}
            {endedClaims.length > 0 ? (
              <div>
                <h3 className="font-display mb-4 text-xl text-white">
                  Ended Campaigns
                  <span className="ml-3 inline-block rounded border border-nexid-gold/30 bg-nexid-gold/10 px-2 py-0.5 align-middle font-mono text-[10px] uppercase tracking-widest text-nexid-gold">
                    Claim Terminal
                  </span>
                </h3>

                {claimError ? (
                  <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                    {claimError}
                    <button type="button" onClick={() => setClaimError(null)} className="ml-3 text-xs text-white/50 hover:text-white">dismiss</button>
                  </div>
                ) : null}

                {claimSuccess ? (
                  <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
                    Reward claimed successfully! Tx: <span className="font-mono text-[11px] text-white/70">{claimSuccess.txHash.slice(0, 10)}...{claimSuccess.txHash.slice(-6)}</span>
                    <button type="button" onClick={() => setClaimSuccess(null)} className="ml-3 text-xs text-white/50 hover:text-white">dismiss</button>
                  </div>
                ) : null}

                <div className="premium-panel overflow-hidden">
                  <div className="divide-y divide-[#1a1a1a]">
                    {endedClaims.map((claim) => (
                      <div key={claim.campaignId} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                        {/* Campaign info */}
                        <div className="flex flex-1 items-center gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-nexid-gold/30 bg-[#050505] shadow-inner-glaze">
                            <span className="text-nexid-gold">&#x2B22;</span>
                          </div>
                          <div className="flex-1">
                            <h4 className="mb-0.5 text-sm font-medium text-white">{claim.title}</h4>
                            <p className="text-[11px] text-nexid-muted">{claim.sponsorName}</p>
                          </div>
                        </div>

                        {/* Rank & Score */}
                        <div className="flex items-center gap-6">
                          {claim.rank ? (
                            <div className="text-center">
                              <div className="font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Rank</div>
                              <div className={`font-mono text-sm font-bold ${claim.rank <= 3 ? `rank-${claim.rank}` : "text-white"}`}>
                                #{claim.rank}
                              </div>
                            </div>
                          ) : null}
                          <div className="text-center">
                            <div className="font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Score</div>
                            <div className="font-mono text-sm text-white">{claim.score.toLocaleString()}</div>
                          </div>
                          <div className="text-center">
                            <div className="font-mono text-[10px] uppercase tracking-widest text-nexid-muted">Reward</div>
                            <div className="font-mono text-sm font-bold text-nexid-gold">
                              {claim.rewardAmountUsdc ? `$${parseFloat(claim.rewardAmountUsdc).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                            </div>
                          </div>
                        </div>

                        {/* Claim button */}
                        <div className="sm:ml-4">
                          {claim.claimed ? (
                            <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-2.5">
                              <span className="h-2 w-2 rounded-full bg-green-500" />
                              <span className="font-mono text-[11px] uppercase tracking-wider text-green-400">Claimed</span>
                            </div>
                          ) : claim.claimReady ? (
                            <button
                              type="button"
                              disabled={claimingId === claim.campaignId}
                              onClick={() => handleClaim(claim)}
                              className="relative rounded-lg bg-nexid-gold px-5 py-2.5 text-sm font-bold text-black transition-all hover:shadow-[0_0_20px_rgba(255,176,0,0.3)] disabled:opacity-50"
                            >
                              {claimingId === claim.campaignId ? (
                                <span className="flex items-center gap-2">
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
                                  Signing...
                                </span>
                              ) : (
                                "Claim USDC"
                              )}
                            </button>
                          ) : (
                            <div className="rounded-lg border border-[#222] bg-[#111] px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-nexid-muted">
                              {claim.rewardAmountUsdc ? "Pending" : "No Reward"}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── Academic Ledger ── */}
            <div>
              <h3 className="font-display mb-4 text-xl text-white">Academic Ledger</h3>
              <div className="premium-panel overflow-hidden">
                <div className="divide-y divide-[#1a1a1a]">
                  {userCampaigns.length > 0 ? (
                    userCampaigns.slice(0, 10).map((c) => (
                      <Link
                        key={c.campaignId}
                        href={`/academy/campaign/${c.campaignId}`}
                        className="flex flex-col items-center gap-5 p-5 transition-colors hover:bg-[#111] sm:flex-row"
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-[#050505] shadow-inner-glaze ${!c.completedAt ? "border-nexid-gold/30" : "border-white/5 opacity-50"}`}>
                          &#x2B22;
                        </div>
                        <div className="w-full flex-1">
                          <h4 className="mb-1 text-sm font-medium text-white">{c.title}</h4>
                          {!c.completedAt ? (
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-[10px] text-nexid-gold">{c.score} pts &middot; In Progress</span>
                            </div>
                          ) : (
                            <p className="text-[11px] text-green-400">Completed</p>
                          )}
                        </div>
                        <div className="text-xs text-nexid-muted">{c.sponsorName}</div>
                      </Link>
                    ))
                  ) : (
                    <div className="p-8 text-center text-sm text-nexid-muted">
                      {hasToken ? "No campaign enrollments yet." : "Connect wallet to view your academic ledger."}
                    </div>
                  )}
                </div>
                {userCampaigns.length > 10 ? (
                  <div className="bg-[#0a0a0a] p-4">
                    <button type="button" onClick={() => setLedgerOpen(true)} className="w-full rounded-lg border border-[#222] bg-[#111] py-3 text-sm font-medium text-white hover:border-white/20">
                      View Complete Academic Ledger
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* ════════════ PROFILE VIEW ════════════ */}
        {view === "profile" ? (
          <section className="mx-auto w-full max-w-6xl space-y-8 p-6 lg:p-10">
            <div className="flex flex-col gap-6 border-b border-nexid-border pb-8 md:flex-row md:items-end md:justify-between">
              <div className="flex items-center gap-6">
                <div className="group relative h-28 w-28 rounded-full border border-nexid-gold/50 p-1 shadow-gold-glow">
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-nexid-gold/20 text-3xl font-bold text-nexid-gold">
                    {displayName ? displayName.charAt(0).toUpperCase() : "?"}
                  </div>
                </div>
                <div>
                  <h2 className="font-display mb-1.5 flex items-center gap-3 text-4xl font-bold tracking-tight text-white">
                    {displayName || "Anonymous"} {ensName ? <span className="text-blue-400">&#10004;</span> : null}
                  </h2>
                  <div className="font-mono text-[11px] text-nexid-muted">
                    <span className="shadow-inner-glaze rounded border border-[#222] bg-[#111] px-2 py-0.5 text-white">
                      {identityAddress ? shortAddr(identityAddress) : "Not connected"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-10 md:flex-row">
              <nav className="custom-scroll flex w-full flex-row gap-1.5 overflow-x-auto pb-4 md:w-56 md:flex-col md:pb-0">
                <ProfileTabButton tab="general" active={profileTab === "general"} onClick={setProfileTab} label="Identity Matrix" />
                <ProfileTabButton tab="wallets" active={profileTab === "wallets"} onClick={setProfileTab} label="Nodes & Socials" />
                <ProfileTabButton tab="security" active={profileTab === "security"} onClick={setProfileTab} label="Security Auth" />
                <ProfileTabButton tab="prefs" active={profileTab === "prefs"} onClick={setProfileTab} label="Preferences" />
              </nav>

              <div className="min-h-[500px] max-w-3xl flex-1">
                {profileTab === "general" ? <GeneralPanel displayName={displayName} /> : null}
                {profileTab === "wallets" ? <WalletPanel address={identityAddress} /> : null}
                {profileTab === "security" ? <SecurityPanel /> : null}
                {profileTab === "prefs" ? <PrefsPanel /> : null}
              </div>
            </div>
          </section>
        ) : null}
      </main>

      {/* ═══ Modals ═══ */}

      {rulesOpen ? (
        <Modal title="Terminal Protocol" onClose={() => setRulesOpen(false)}>
          <div className="mb-8 space-y-4 border-y border-[#222] py-6 text-sm leading-relaxed text-nexid-muted">
            <p><strong className="text-white/80">No Media Attachments:</strong> Text stream only.</p>
            <p><strong className="text-white/80">Zero External Links:</strong> External URLs are removed automatically.</p>
            <p><strong className="text-white/80">No Spam or Sybil Attacks:</strong> Abuse triggers temporary bans.</p>
            <p><strong className="text-white/80">Verifiable Networking:</strong> Use `.id` namespaces for trusted collaboration.</p>
          </div>
          <button type="button" onClick={() => setRulesOpen(false)} className="w-full rounded-lg bg-nexid-gold py-3.5 text-sm font-bold uppercase tracking-widest text-black">I Acknowledge</button>
        </Modal>
      ) : null}

      {top100Open ? (
        <Modal title="Top 100 Ledger" onClose={() => setTop100Open(false)} maxWidth="max-w-2xl" fullHeight>
          <div className="custom-scroll flex-1 space-y-1 overflow-y-auto rounded-lg border border-[#1a1a1a] bg-[#050505] p-2">
            {leaderboard.length > 0 ? (
              leaderboard.map((row) => (
                <div key={row.rank} className="flex items-center justify-between rounded border-b border-[#111] p-3 text-sm last:border-0 hover:bg-[#0d0d0d]">
                  <div className="flex items-center gap-6">
                    <div className={`w-8 text-right font-mono font-black ${row.rank <= 3 ? `rank-${row.rank}` : "text-nexid-muted"}`}>{row.rank}</div>
                    <div className="text-white/90">{shortAddr(row.walletAddress)}</div>
                  </div>
                  <div className={`font-mono text-xs ${row.rank <= 3 ? `rank-${row.rank}` : "text-nexid-muted"}`}>
                    {row.totalPoints.toLocaleString()} pts
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-sm text-nexid-muted">No leaderboard data yet.</div>
            )}
          </div>
        </Modal>
      ) : null}

      {ledgerOpen ? (
        <Modal title="Complete Academic Ledger" onClose={() => setLedgerOpen(false)} maxWidth="max-w-4xl" fullHeight>
          <div className="custom-scroll flex-1 overflow-y-auto rounded-xl border border-[#1a1a1a] bg-[#050505] p-2">
            {userCampaigns.length > 0 ? (
              userCampaigns.map((c) => (
                <div key={c.campaignId} className="flex flex-col items-center gap-5 rounded-lg border-b border-[#111] p-5 transition-colors last:border-0 hover:bg-[#0d0d0d] sm:flex-row">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#333] bg-[#111]">&#x2B22;</div>
                  <div className="w-full flex-1">
                    <h4 className="mb-1 text-sm font-medium text-white">{c.title}</h4>
                    <div className={`font-mono text-[11px] uppercase tracking-wider ${c.completedAt ? "text-green-400" : "text-nexid-gold"}`}>
                      {c.completedAt ? "COMPLETED" : "IN PROGRESS"}
                    </div>
                  </div>
                  <div className="text-xs text-nexid-muted">Score: {c.score}</div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-sm text-nexid-muted">No enrollments yet.</div>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ═══════════════════ Sub-components ═══════════════════ */

function SideItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center justify-center gap-4 rounded-xl px-3 py-3.5 transition-all lg:justify-start lg:px-4 ${active ? "border border-[#222] bg-[#111] text-white" : "border border-transparent text-nexid-muted hover:bg-white/5 hover:text-white"}`}
    >
      <span className="hidden text-sm font-medium lg:block">{label}</span>
      <span className="text-sm lg:hidden">&#8226;</span>
    </button>
  );
}

function RankRow({ rank, name, score }: { rank: number; name: string; score: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-[#111]">
      <div className="flex items-center gap-4">
        <div className={`w-6 text-center font-mono text-xs ${rank <= 3 ? `rank-${rank}` : "text-nexid-muted"} ${rank <= 3 ? "font-bold" : ""}`}>
          {rank}
        </div>
        <div className="text-sm font-medium text-white/80">{name}</div>
      </div>
      <div className={`font-mono text-xs ${rank <= 3 ? `rank-${rank}` : "text-nexid-muted"}`}>
        {score}
      </div>
    </div>
  );
}

function ProfileTabButton({ tab, active, onClick, label }: { tab: ProfileTab; active: boolean; onClick: (tab: ProfileTab) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onClick(tab)}
      className={`w-full flex-shrink-0 rounded-md px-4 py-3 text-left text-sm font-medium ${active ? "border border-[#222] bg-[#111] text-white" : "border border-transparent text-nexid-muted hover:bg-[#111]/50 hover:text-white"}`}
    >
      {label}
    </button>
  );
}

function GeneralPanel({ displayName }: { displayName: string }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display mb-2 text-2xl text-white">Identity Matrix</h3>
        <p className="text-sm text-nexid-muted">Manage your public-facing resolver data.</p>
      </div>
      <div className="rounded-lg border border-nexid-gold/30 bg-nexid-gold/10 p-4 text-sm leading-relaxed text-nexid-gold/90">
        Updating fields executes a transaction to your `.id` resolver contract.
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field label="Primary Name" value={displayName || "Not set"} readOnly />
        <Field label="Timezone" value="UTC (Coordinated Universal Time)" />
      </div>
    </div>
  );
}

function WalletPanel({ address }: { address: string | null }) {
  return (
    <div className="space-y-8">
      <h3 className="font-display text-2xl text-white">Nodes & Socials</h3>
      <div className="rounded-lg border border-[#222] bg-[#0a0a0a] p-4">
        <div className="text-sm font-medium text-white">Base Mainnet</div>
        <div className="mt-0.5 font-mono text-[10px] text-nexid-muted">{address ? shortAddr(address) : "Not connected"}</div>
      </div>
    </div>
  );
}

function SecurityPanel() {
  return (
    <div className="space-y-8">
      <h3 className="font-display text-2xl text-white">Security Auth</h3>
      <div className="rounded-xl border border-[#222] bg-[#0a0a0a] p-6">
        <h4 className="mb-1 text-sm font-bold text-white">Hardware Passkey</h4>
        <p className="mb-4 text-xs text-nexid-muted">Require hardware passkey for high-risk profile actions.</p>
        <button type="button" className="rounded bg-white px-4 py-2 text-xs font-bold text-black">Initialize</button>
      </div>
    </div>
  );
}

function PrefsPanel() {
  return (
    <div className="space-y-8">
      <h3 className="font-display text-2xl text-white">Preferences</h3>
      <div className="rounded-lg border border-[#222] bg-[#0a0a0a] p-4">
        <div className="mb-1 text-sm font-medium text-white">Academic Alerts</div>
        <div className="text-[11px] text-nexid-muted">Push notifications for modules and grading.</div>
      </div>
    </div>
  );
}

function Field({ label, value, readOnly }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <div>
      <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
        {label}
      </label>
      <input type="text" defaultValue={value} readOnly={readOnly} className={`w-full rounded-lg border border-[#222] bg-[#0a0a0a] px-4 py-3 text-sm text-white ${readOnly ? "cursor-default opacity-70" : ""}`} />
    </div>
  );
}

function Modal({ title, children, onClose, maxWidth = "max-w-lg", fullHeight = false }: { title: string; children: ReactNode; onClose: () => void; maxWidth?: string; fullHeight?: boolean }) {
  return (
    <div className="modal-overlay active fixed inset-0 flex items-center justify-center p-4">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className={`modal-content premium-panel relative w-full ${maxWidth} ${fullHeight ? "h-[80vh] flex flex-col" : ""} p-6`}>
        <div className="mb-6 flex items-center justify-between">
          <h3 className="font-display text-2xl text-white">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md border border-[#222] bg-[#111] p-2 text-nexid-muted">
            X
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
