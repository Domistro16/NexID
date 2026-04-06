"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useENSName } from "@/hooks/getPrimaryName";

export type LeaderboardRow = {
  rank: number;
  walletAddress: string;
  displayName?: string | null;
  totalPoints: number;
  campaignsFinished: number;
  totalScore: number;
  badgeDisplayText?: string;
  badgeDisplayItems?: BadgeItem[];
  multiplierTotal?: number;
};

export type UserCampaign = {
  campaignId: number;
  title: string;
  status: string;
  score: number;
  completedUntil: number;
  rank: number | null;
  completedAt: string | null;
  enrolledAt: string;
  flowStage: string | null;
  flowState: unknown;
  modules: unknown[];
  coverImageUrl: string | null;
  sponsorName: string;
};

export type EndedCampaignClaim = {
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

export type BadgeItem = {
  id: string;
  type: string;
  glyph?: string;
  name?: string;
  description?: string;
  earnedAt?: string;
  partnerId?: string | null;
};

export type PassportData = {
  hasPassport: boolean;
  score: {
    compositeScore: number;
    frequencyScore: number;
    recencyScore: number;
    depthScore: number;
    varietyScore: number;
    volumeTier: number;
    consecutiveActiveWeeks: number;
    crossProtocolCount: number;
    lastScannedAt: string | null;
    scanCadence: string;
  } | null;
  recentScans: {
    scanDate: string;
    chainId: number;
    contractsInteracted: number;
    actionsDetected: string[];
    activeDays: number;
    txCount: number;
  }[];
};

export type MultiplierData = {
  multiplier: Record<string, number>;
  signals: Record<string, string | null>;
};

export type UserStats = {
  coursesEnrolled: number;
  coursesCompleted: number;
  lessonsCompleted: number;
  quizzesPassed: number;
  totalPoints: number;
};

export type UserProfile = {
  id: string;
  walletAddress: string;
  totalPoints: number;
  createdAt: string;
};

export type AgentSession = {
  id?: string;
  sessionType: string;
  status: string;
  overallScore: number | null;
  depthScore?: number | null;
  accuracyScore?: number | null;
  originalityScore?: number | null;
  completedAt?: string | null;
  campaignId?: number | null;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const BADGE_META: Record<string, { glyph: string; className: string }> = {
  VERIFIED: { glyph: "◈", className: "bc-v" },
  CONSISTENT: { glyph: "◈◈", className: "bc-b" },
  RIGOROUS: { glyph: "◈◈◈", className: "bc-p" },
  DEFI_ACTIVE: { glyph: "⬡", className: "bc-b" },
  DEFI_FLUENT: { glyph: "⬡⬡", className: "bc-b" },
  DEFI_NATIVE: { glyph: "⬡⬡⬡", className: "bc-b" },
  PROTOCOL_SPECIALIST: { glyph: "▲", className: "bc-p" },
  ZERO_FLAGS: { glyph: "◆", className: "bc-v" },
  AGENT_CERTIFIED: { glyph: "✦", className: "bc-p" },
  CROSS_CHAIN: { glyph: "⊕", className: "bc-b" },
  CHARTERED: { glyph: "★", className: "bc-g" },
  EARLY_ADOPTER: { glyph: "◐", className: "bc-g" },
};

export function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function shortAddr(addr: string) {
  if (!addr) return "";
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatUsdc(value: string | number | null | undefined) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString(undefined, { maximumFractionDigits: amount % 1 === 0 ? 0 : 2 });
}

export function badgeGlyph(type: string) {
  return BADGE_META[type]?.glyph ?? "◈";
}

export function badgeClassName(type: string) {
  return BADGE_META[type]?.className ?? "bc-lo";
}

export function badgeDisplayText(badges: BadgeItem[]) {
  return badges.map((badge) => badgeGlyph(badge.type)).join("");
}

function parseNumber(value: string | number | null | undefined) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function useAcademyAccountSnapshot() {
  const { address } = useAccount();
  const [hasToken, setHasToken] = useState(false);
  const [authWalletAddress, setAuthWalletAddress] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [userCampaigns, setUserCampaigns] = useState<UserCampaign[]>([]);
  const [endedClaims, setEndedClaims] = useState<EndedCampaignClaim[]>([]);
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [displayBadges, setDisplayBadges] = useState<BadgeItem[]>([]);
  const [multiplier, setMultiplier] = useState<MultiplierData | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [loadingPrivate, setLoadingPrivate] = useState(true);
  const [loadingClaims, setLoadingClaims] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncToken = () => {
      setHasToken(!!window.localStorage.getItem("auth_token"));
    };

    syncToken();
    window.addEventListener("storage", syncToken);
    window.addEventListener("nexid-auth-changed", syncToken as EventListener);

    return () => {
      window.removeEventListener("storage", syncToken);
      window.removeEventListener("nexid-auth-changed", syncToken as EventListener);
    };
  }, []);

  const identityAddress = authWalletAddress ?? address ?? null;
  const ensOwner = identityAddress && identityAddress.startsWith("0x")
    ? (identityAddress as `0x${string}`)
    : ZERO_ADDRESS;
  const { name: domainName } = useENSName({ owner: ensOwner });

  const displayName = useMemo(() => {
    if (domainName && typeof domainName === "string" && domainName.length > 0) {
      return domainName;
    }
    return identityAddress ? shortAddr(identityAddress) : null;
  }, [domainName, identityAddress]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/leaderboard", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) {
          setLeaderboard(Array.isArray(body.leaderboard) ? body.leaderboard : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeaderboard([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPublic(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!hasToken) {
      setAuthWalletAddress(null);
      setUserCampaigns([]);
      setEndedClaims([]);
      setPassport(null);
      setBadges([]);
      setDisplayBadges([]);
      setMultiplier(null);
      setStats(null);
      setProfile(null);
      setAgentSessions([]);
      setLoadingPrivate(false);
      return () => {
        cancelled = true;
      };
    }

    setLoadingPrivate(true);

    Promise.allSettled([
      fetch("/api/user/profile", { headers: authHeaders(), cache: "no-store" }),
      fetch("/api/user/campaigns", { headers: authHeaders(), cache: "no-store" }),
      fetch("/api/user/passport", { headers: authHeaders(), cache: "no-store" }),
      fetch("/api/user/badges", { headers: authHeaders(), cache: "no-store" }),
      fetch("/api/user/multiplier", { headers: authHeaders(), cache: "no-store" }),
      fetch("/api/user/stats", { headers: authHeaders(), cache: "no-store" }),
      fetch("/api/agent/session", { headers: authHeaders(), cache: "no-store" }),
    ])
      .then(async (results) => {
        if (cancelled) return;

        const [
          profileResult,
          campaignsResult,
          passportResult,
          badgesResult,
          multiplierResult,
          statsResult,
          agentSessionsResult,
        ] = results;

        if (profileResult.status === "fulfilled" && profileResult.value.ok) {
          const body = await profileResult.value.json();
          const user = body?.user;
          setProfile(user ?? null);
          setAuthWalletAddress(typeof user?.walletAddress === "string" ? user.walletAddress : null);
        } else {
          setProfile(null);
          setAuthWalletAddress(null);
        }

        if (campaignsResult.status === "fulfilled" && campaignsResult.value.ok) {
          const body = await campaignsResult.value.json();
          setUserCampaigns(Array.isArray(body?.campaigns) ? body.campaigns : []);
        } else {
          setUserCampaigns([]);
        }

        if (passportResult.status === "fulfilled" && passportResult.value.ok) {
          const body = await passportResult.value.json();
          setPassport(body ?? null);
        } else {
          setPassport(null);
        }

        if (badgesResult.status === "fulfilled" && badgesResult.value.ok) {
          const body = await badgesResult.value.json();
          setBadges(Array.isArray(body?.badges) ? body.badges : []);
          setDisplayBadges(Array.isArray(body?.displayBadges) ? body.displayBadges : []);
        } else {
          setBadges([]);
          setDisplayBadges([]);
        }

        if (multiplierResult.status === "fulfilled" && multiplierResult.value.ok) {
          const body = await multiplierResult.value.json();
          setMultiplier(body ?? null);
        } else {
          setMultiplier(null);
        }

        if (statsResult.status === "fulfilled" && statsResult.value.ok) {
          const body = await statsResult.value.json();
          setStats(body ?? null);
        } else {
          setStats(null);
        }

        if (agentSessionsResult.status === "fulfilled" && agentSessionsResult.value.ok) {
          const body = await agentSessionsResult.value.json();
          setAgentSessions(Array.isArray(body?.sessions) ? body.sessions : []);
        } else {
          setAgentSessions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPrivate(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  useEffect(() => {
    let cancelled = false;

    if (!hasToken) {
      setEndedClaims([]);
      return () => {
        cancelled = true;
      };
    }

    const endedIds = userCampaigns
      .filter((campaign) => campaign.status === "ENDED")
      .map((campaign) => campaign.campaignId);

    if (endedIds.length === 0) {
      setEndedClaims([]);
      return () => {
        cancelled = true;
      };
    }

    setLoadingClaims(true);

    Promise.all(
      endedIds.map((campaignId) =>
        fetch(`/api/campaigns/${campaignId}/claim`, {
          headers: authHeaders(),
          cache: "no-store",
        })
          .then(async (res) => (res.ok ? res.json() : null))
          .catch(() => null),
      ),
    )
      .then((results) => {
        if (!cancelled) {
          setEndedClaims(results.filter(Boolean) as EndedCampaignClaim[]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingClaims(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasToken, userCampaigns]);

  const userRow = useMemo(() => {
    if (!identityAddress) return null;
    return leaderboard.find(
      (row) => row.walletAddress.toLowerCase() === identityAddress.toLowerCase(),
    ) ?? null;
  }, [identityAddress, leaderboard]);

  const totalPoints = useMemo(() => {
    return (
      userRow?.totalPoints ??
      stats?.totalPoints ??
      profile?.totalPoints ??
      0
    );
  }, [profile?.totalPoints, stats?.totalPoints, userRow?.totalPoints]);

  const scoreOutOfThousand = useMemo(() => {
    if (totalPoints > 0) {
      return Math.min(1000, Math.round(totalPoints));
    }
    if (passport?.score?.compositeScore) {
      return Math.min(1000, Math.round(passport.score.compositeScore * 10));
    }
    return 0;
  }, [passport?.score?.compositeScore, totalPoints]);

  const multiplierTotal = useMemo(() => {
    return multiplier?.multiplier?.total ?? 1;
  }, [multiplier?.multiplier]);

  const completedCampaigns = useMemo(() => {
    return userCampaigns.filter((campaign) => !!campaign.completedAt).length;
  }, [userCampaigns]);

  const activeCampaign = useMemo(() => {
    return userCampaigns.find((campaign) => !campaign.completedAt && campaign.status === "LIVE") ?? null;
  }, [userCampaigns]);

  const earnedTotal = useMemo(() => {
    return endedClaims
      .filter((claim) => claim.claimed)
      .reduce((sum, claim) => sum + parseNumber(claim.rewardAmountUsdc), 0);
  }, [endedClaims]);

  const pendingTotal = useMemo(() => {
    return endedClaims
      .filter((claim) => !claim.claimed)
      .reduce((sum, claim) => sum + parseNumber(claim.rewardAmountUsdc), 0);
  }, [endedClaims]);

  const passedAssessments = useMemo(() => {
    return agentSessions.filter(
      (session) =>
        session.sessionType === "CAMPAIGN_ASSESSMENT" &&
        session.status === "COMPLETED" &&
        (session.overallScore ?? 0) >= 60,
    );
  }, [agentSessions]);

  const charteredSession = useMemo(() => {
    return agentSessions.find(
      (session) =>
        session.sessionType === "CHARTERED_INTERVIEW" &&
        session.status === "COMPLETED",
    ) ?? null;
  }, [agentSessions]);

  return {
    hasToken,
    leaderboard,
    loading: loadingPublic || (hasToken && (loadingPrivate || loadingClaims)),
    loadingPublic,
    loadingPrivate,
    displayName,
    domainName,
    identityAddress,
    profile,
    stats,
    userRow,
    totalPoints,
    scoreOutOfThousand,
    multiplierTotal,
    multiplier,
    userCampaigns,
    completedCampaigns,
    activeCampaign,
    passport,
    badges,
    displayBadges,
    endedClaims,
    earnedTotal,
    pendingTotal,
    passedAssessments,
    charteredSession,
  };
}
