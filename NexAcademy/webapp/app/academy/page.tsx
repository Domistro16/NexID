"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  status: string;
  isPublished: boolean;
  startAt: string | null;
  endAt: string | null;
  participantCount: number;
  topScore: number;
  totalScore: number;
  moduleCount: number;
};

type CategoryFilter = "all" | "identity" | "building" | "productivity";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=900";
const FALLBACK_FEATURED_IMAGE =
  "https://images.unsplash.com/photo-1639762681057-408e52192e55?auto=format&fit=crop&q=70&w=1000";

function formatUsdc(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString();
}

function resolveCampaignImage(url: string | null, fallback: string) {
  if (!url) return fallback;
  const lower = url.toLowerCase();
  const isEmbedUrl =
    lower.includes("share.synthesia.io/embeds/videos") ||
    lower.includes("youtube.com/watch") ||
    lower.includes("youtu.be/");
  return isEmbedUrl ? fallback : url;
}

function isIdentityTrack(campaign: Campaign) {
  const title = campaign.title.toLowerCase();
  const objective = campaign.objective.toLowerCase();
  const tier = campaign.tier.toLowerCase();
  return (
    title.includes("nexid") ||
    title.includes(".id") ||
    title.includes("passport") ||
    objective.includes(".id") ||
    objective.includes("passport") ||
    tier.includes("identity")
  );
}

function categorize(campaign: Campaign): CategoryFilter {
  if (isIdentityTrack(campaign)) return "identity";

  const title = campaign.title.toLowerCase();
  const objective = campaign.objective.toLowerCase();
  const tier = campaign.tier.toLowerCase();
  if (
    tier.includes("productivity") ||
    title.includes("habit") ||
    title.includes("focus") ||
    objective.includes("habit") ||
    objective.includes("motivation")
  ) {
    return "productivity";
  }

  return "building";
}

function campaignTypeLabel(campaign: Campaign) {
  if (isIdentityTrack(campaign)) {
    return "Campaign";
  }

  return Number(campaign.prizePoolUsdc) > 0 ? "Campaign" : "Free Course";
}

function campaignTrackLabel(campaign: Campaign) {
  if (isIdentityTrack(campaign)) {
    return "Multi-chain";
  }

  if (campaignTypeLabel(campaign) === "Free Course") {
    return "Free Course";
  }

  return campaign.sponsorName;
}

function daysRemaining(endAt: string | null) {
  if (!endAt) return null;
  const end = new Date(endAt);
  if (Number.isNaN(end.getTime())) return null;
  const diff = end.getTime() - Date.now();
  if (diff <= 0) return null;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function featuredDescription(campaign: Campaign) {
  if (isIdentityTrack(campaign)) {
    return "Learn the full verification stack, earn your first badges, and unlock your .id passport in one session.";
  }

  return truncateText(campaign.objective, 170);
}

function featuredReward(campaign: Campaign) {
  if (isIdentityTrack(campaign)) {
    return {
      value: "Badges",
      label: "+ Free .id Domain",
    };
  }

  if (campaignTypeLabel(campaign) === "Free Course") {
    return {
      value: "Free Course",
      label: `+ ${campaign.moduleCount} modules`,
    };
  }

  return {
    value: `$${formatUsdc(campaign.prizePoolUsdc)}`,
    label: "USDC pool",
  };
}

export default function AcademyBrowsePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const searchParams = useSearchParams();
  const search = (searchParams.get("q") || "").trim().toLowerCase();

  useEffect(() => {
    let active = true;

    async function loadCampaigns() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/campaigns", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load campaigns");
        }

        if (active) {
          const nextCampaigns: Campaign[] = Array.isArray(data.campaigns) ? data.campaigns : [];
          setCampaigns(nextCampaigns.filter((campaign) => campaign.status !== "ENDED"));
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load campaigns");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadCampaigns();
    return () => {
      active = false;
    };
  }, []);

  const featuredCampaign = useMemo(() => {
    if (campaigns.length === 0) return null;

    const identityCampaign = campaigns.find((campaign) => isIdentityTrack(campaign));
    if (identityCampaign) {
      return identityCampaign;
    }

    return [...campaigns].sort((a, b) => {
      const aScore = a.participantCount * 100 + a.totalScore;
      const bScore = b.participantCount * 100 + b.totalScore;
      return bScore - aScore;
    })[0] ?? null;
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((campaign) => {
      const matchesFilter = categoryFilter === "all" || categorize(campaign) === categoryFilter;
      const matchesSearch =
        search.length === 0 ||
        campaign.title.toLowerCase().includes(search) ||
        campaign.sponsorName.toLowerCase().includes(search) ||
        campaign.objective.toLowerCase().includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [campaigns, categoryFilter, search]);

  const featuredRewardBlock = featuredCampaign ? featuredReward(featuredCampaign) : null;
  const filters: Array<{ key: CategoryFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "identity", label: "Identity" },
    { key: "building", label: "Building" },
    { key: "productivity", label: "Productivity" },
  ];

  return (
    <section>
      <div className="browse-head">
        <div className="ey ey-gold" style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
          <span className="live-dot" style={{ width: 4, height: 4 }} />
          Live Courses
        </div>
        <h1 className="browse-h1">Where your attention <br />gets rewarded.</h1>
        <p className="browse-sub">
          Prove your understanding through interactive lessons. Build a lasting identity that grows more valuable every time you use it.
          </p>
      </div>

      {error ? (
        <div className="q-feedback bad" style={{ marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      {featuredCampaign && featuredRewardBlock ? (
        <Link href={`/campaign/${featuredCampaign.slug || featuredCampaign.id}`} className="feat">
          <div className="feat-hero">
            <img
              src={resolveCampaignImage(featuredCampaign.coverImageUrl, FALLBACK_FEATURED_IMAGE)}
              alt={featuredCampaign.title}
            />
            <div className="feat-hero-fade" />
            <div className="feat-hero-content">
              <div className="feat-hero-left">
                <div className="feat-ey">
                  <span className="feat-ey-dot" />
                  Featured Campaign
                </div>
                <div className="feat-h">{featuredCampaign.title}</div>
                <div className="feat-desc">{featuredDescription(featuredCampaign)}</div>
              </div>
              <div className="feat-reward">
                <div className="feat-reward-val">{featuredRewardBlock.value}</div>
                <div className="feat-reward-lbl">{featuredRewardBlock.label}</div>
              </div>
            </div>
          </div>
          <div className="feat-foot">
            <div className="feat-stats">
              <div className="feat-stat"><strong>{featuredCampaign.participantCount.toLocaleString()}</strong> participants</div>
              <div className="feat-stat" style={{ color: "var(--t4)" }}>/</div>
              <div className="feat-stat">{featuredCampaign.moduleCount} modules</div>
              <div className="feat-stat" style={{ color: "var(--t4)" }}>/</div>
              <div className="feat-stat">{campaignTrackLabel(featuredCampaign)}</div>
            </div>
            <span className="btn btn-gold btn-sm">Start Course</span>
          </div>
        </Link>
      ) : null}

      <div className="filter-row">
        <div className="filter-pills">
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`fp ${categoryFilter === filter.key ? "on" : ""}`}
              onClick={() => setCategoryFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="cc-desc">Loading courses...</div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="cc-desc">No courses found.</div>
      ) : (
        <div className="course-grid">
          {filteredCampaigns.map((campaign) => {
            const liveDays = daysRemaining(campaign.endAt);
            const typeLabel = campaignTypeLabel(campaign);

            return (
              <Link key={campaign.id} href={`/campaign/${campaign.slug || campaign.id}`} className="cc">
                <div className="cc-thumb">
                  <img
                    src={resolveCampaignImage(campaign.coverImageUrl, FALLBACK_IMAGE)}
                    alt={campaign.title}
                    loading="lazy"
                  />
                  <div className="cc-fade" />
                  <div className="cc-chips">
                    {liveDays ? <span className="chip chip-live">Live / {liveDays}d</span> : null}
                    {!liveDays && typeLabel === "Free Course" ? <span className="chip chip-free">Free</span> : null}
                    {isIdentityTrack(campaign) ? <span className="chip chip-nexid">NexID</span> : null}
                  </div>
                </div>
                <div className="cc-body">
                  <div className="cc-meta">
                    <div className="cc-ico">{campaign.sponsorName.slice(0, 1).toUpperCase()}</div>
                    <span className="cc-chain">{campaignTrackLabel(campaign)}</span>
                  </div>
                  <div className="cc-title">{campaign.title}</div>
                  <div className="cc-desc">{truncateText(campaign.objective, 110)}</div>
                  <div className="cc-foot">
                    <div>
                      <div className="cc-type-val">{typeLabel}</div>
                      <div className="cc-type-lbl">{campaign.moduleCount} modules</div>
                    </div>
                    <div className="cc-count">{campaign.participantCount.toLocaleString()} enrolled</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
