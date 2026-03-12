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
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=900";
const FALLBACK_FEATURED_IMAGE =
  "https://images.unsplash.com/photo-1642104704074-907c0698cbd9?auto=format&fit=crop&q=80&w=1600";

type CategoryFilter = "all" | "defi" | "infra" | "identity" | "ended";

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

function isInternalCoreCampaign(campaign: Campaign) {
  return campaign.ownerType === "NEXID" || campaign.contractType === "NEXID_CAMPAIGNS";
}

function getTagInfo(campaign: Campaign) {
  if (campaign.status === "ENDED") return { label: "Ended", style: "text-red-400 border-red-400/30 bg-red-400/5" };
  if (campaign.status === "LIVE") return { label: "Live", style: "text-nexid-gold border-nexid-gold/30 bg-nexid-gold/5" };
  return { label: "Evergreen", style: "text-nexid-gold border-nexid-gold/30 bg-nexid-gold/5" };
}

function getDaysRemaining(endAt: string | null): string | null {
  if (!endAt) return null;
  const end = new Date(endAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return null;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `${days} Day${days !== 1 ? "s" : ""}`;
}

function categorize(campaign: Campaign): string {
  if (campaign.status === "ENDED") return "ended";
  const t = campaign.tier?.toLowerCase() || "";
  const title = campaign.title.toLowerCase();
  if (t.includes("defi") || title.includes("swap") || title.includes("liquidity") || title.includes("token") || title.includes("staking") || title.includes("loan") || title.includes("dao") || title.includes("bags")) return "defi";
  if (t.includes("infra") || title.includes("contract") || title.includes("rollup") || title.includes("bridge") || title.includes("node") || title.includes("mempool") || title.includes("zk")) return "infra";
  if (t.includes("identity") || title.includes("ens") || title.includes(".id") || title.includes("soulbound") || title.includes("account abstraction")) return "identity";
  return "defi";
}

const PAGE_SIZE = 10;

export default function AcademyBrowsePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortBy, setSortBy] = useState<"trending" | "reward" | "newest">("trending");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchParams = useSearchParams();
  const search = searchParams.get("q") || "";

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
          setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
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
    const scored = [...campaigns].sort((a, b) => {
      const aScore = a.participantCount * 100 + a.totalScore;
      const bScore = b.participantCount * 100 + b.totalScore;
      return bScore - aScore;
    });
    return scored[0];
  }, [campaigns]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const items = campaigns
      .filter((c) => !featuredCampaign || c.id !== featuredCampaign.id)
      .filter((campaign) => {
        const cat = categorize(campaign);
        const catMatch = categoryFilter === "all" || (categoryFilter === "ended" ? campaign.status === "ENDED" : cat === categoryFilter && campaign.status !== "ENDED");
        const searchMatch = query.length === 0 ? true : campaign.title.toLowerCase().includes(query) || campaign.sponsorName.toLowerCase().includes(query);
        return catMatch && searchMatch;
      });

    if (sortBy === "reward") {
      items.sort((a, b) => Number(b.prizePoolUsdc) - Number(a.prizePoolUsdc));
    } else if (sortBy === "newest") {
      items.sort((a, b) => b.id - a.id);
    } else {
      items.sort((a, b) => {
        if (a.status === "ENDED" && b.status !== "ENDED") return 1;
        if (a.status !== "ENDED" && b.status === "ENDED") return -1;
        const aScore = a.participantCount * 100 + a.totalScore;
        const bScore = b.participantCount * 100 + b.totalScore;
        return bScore - aScore;
      });
    }

    return items;
  }, [campaigns, search, sortBy, categoryFilter, featuredCampaign]);

  const paginated = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const showFeatured = !search && categoryFilter === "all" && featuredCampaign;

  const filters: { key: CategoryFilter; label: string }[] = [
    { key: "all", label: "All Campaigns" },
    { key: "defi", label: "DeFi & Swaps" },
    { key: "infra", label: "Infrastructure" },
    { key: "identity", label: "Identity" },
    { key: "ended", label: "Ended (Claims)" },
  ];

  return (
    <section className="mx-auto w-full max-w-[1600px] px-6 pb-10 pt-12 lg:px-12">
      {/* Hero */}
      <div className="mb-10 max-w-3xl">
        <h1 className="font-display mb-4 text-4xl font-bold tracking-tight text-white md:text-5xl leading-tight">
          Master the ecosystem.
        </h1>
        <p className="text-lg text-nexid-muted leading-relaxed">
          Complete technical tracks, verify microtasks on-chain, and compete for USDC prize pools and limited sovereign assets.
        </p>
      </div>

      {error ? (
        <div className="mb-8 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {/* Featured Campaign Card */}
      {showFeatured ? (
        <Link
          href={`/academy/campaign/${featuredCampaign.id}`}
          className="course-card premium-panel group mb-10 block w-full overflow-hidden bg-[#0a0a0a] text-left"
        >
          <div className="course-image-wrapper relative h-64 overflow-hidden border-b border-[#1a1a1a] md:h-80">
            <img
              src={resolveCampaignImage(featuredCampaign.coverImageUrl, FALLBACK_FEATURED_IMAGE)}
              alt={featuredCampaign.title}
              className="absolute inset-0 h-full w-full object-cover opacity-25 blur-sm mix-blend-luminosity"
            />
            <img
              src={resolveCampaignImage(featuredCampaign.coverImageUrl, FALLBACK_FEATURED_IMAGE)}
              alt={featuredCampaign.title}
              className="absolute inset-0 h-full w-full object-contain opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
            <div className="absolute top-6 left-6 flex gap-2 z-10">
              <span className="bg-nexid-gold text-black text-[10px] font-bold px-3 py-1.5 rounded uppercase tracking-widest shadow-[0_0_15px_rgba(255,176,0,0.5)]">
                FEATURED CAMPAIGN
              </span>
              {getDaysRemaining(featuredCampaign.endAt) ? (
                <span className="bg-[#111] border border-[#333] text-white text-[10px] font-mono px-3 py-1.5 rounded flex items-center gap-2 backdrop-blur-md">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  Ends in {getDaysRemaining(featuredCampaign.endAt)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="w-full p-8 md:p-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <h2 className="font-display text-3xl text-white mb-3 md:text-4xl">
                {featuredCampaign.title}
              </h2>
              <p className="text-nexid-muted leading-relaxed max-w-2xl">
                {featuredCampaign.objective ||
                  (isInternalCoreCampaign(featuredCampaign)
                    ? `${featuredCampaign.participantCount} participants`
                    : `$${formatUsdc(featuredCampaign.prizePoolUsdc)} USDC pool - ${featuredCampaign.participantCount} participants`)}
              </p>
            </div>
            <div className="flex items-center gap-6 shrink-0 bg-[#111] border border-[#222] p-4 rounded-xl shadow-inner-glaze">
              <div className="w-12 h-12 rounded-full border border-[#333] bg-[#050505] flex items-center justify-center font-bold text-white text-xs shrink-0 uppercase">
                {featuredCampaign.sponsorName.slice(0, 4)}
              </div>
              <div>
                {isInternalCoreCampaign(featuredCampaign) ? (
                  <>
                    <div className="text-[10px] font-mono text-nexid-gold mb-1 uppercase tracking-widest">Participants</div>
                    <div className="text-base font-bold text-white">{featuredCampaign.participantCount.toLocaleString()}</div>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] font-mono text-nexid-gold mb-1 uppercase tracking-widest">Total Prize Pool</div>
                    <div className="text-base font-bold text-white">${formatUsdc(featuredCampaign.prizePoolUsdc)} USDC</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </Link>
      ) : null}

      {/* Filters & Sort */}
      <div className="mb-8 flex flex-col justify-between gap-4 border-b border-[#1a1a1a] pb-4 md:flex-row md:items-center">
        <div className="custom-scroll hide-scrollbar flex gap-2 overflow-x-auto">
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => { setCategoryFilter(filter.key); setVisibleCount(PAGE_SIZE); }}
              className={`filter-pill rounded-full border px-4 py-2 text-xs font-medium ${categoryFilter === filter.key
                  ? "active bg-[#f5f5f5] text-black border-[#f5f5f5]"
                  : "border-[#333] bg-[#0a0a0a] text-nexid-muted hover:border-white/30"
                }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-mono text-nexid-muted uppercase tracking-widest">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "trending" | "reward" | "newest")}
            className="bg-[#0a0a0a] border border-[#222] text-white text-xs rounded-lg px-3 py-2 cursor-pointer w-40 hover:border-white/20 transition-colors"
          >
            <option value="trending">Trending Status</option>
            <option value="reward">Highest Prize Pool</option>
            <option value="newest">Newly Added</option>
          </select>
        </div>
      </div>

      {/* Campaign Grid */}
      {loading ? (
        <div className="text-sm text-nexid-muted">Loading campaigns...</div>
      ) : paginated.length === 0 ? (
        <div className="text-sm text-nexid-muted">No campaigns found.</div>
      ) : (
        <div className="masonry-grid">
          {paginated.map((campaign) => {
            const tag = getTagInfo(campaign);
            return (
              <Link
                key={campaign.id}
                href={`/academy/campaign/${campaign.id}`}
                className="masonry-item course-card premium-panel flex w-full flex-col overflow-hidden bg-[#0a0a0a] text-left"
              >
                <div className="course-image-wrapper relative h-48 overflow-hidden border-b border-[#1a1a1a]">
                  <img
                    src={resolveCampaignImage(campaign.coverImageUrl, FALLBACK_IMAGE)}
                    alt={campaign.title}
                    className="absolute inset-0 h-full w-full object-cover opacity-20 blur-sm mix-blend-luminosity"
                  />
                  <img
                    src={resolveCampaignImage(campaign.coverImageUrl, FALLBACK_IMAGE)}
                    alt={campaign.title}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                  <div className="absolute bottom-4 left-4">
                    <span className={`text-[10px] font-mono border ${tag.style} px-2.5 py-1 rounded tracking-widest uppercase shadow-inner-glaze`}>
                      {tag.label}
                    </span>
                  </div>
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-display mb-1 text-lg text-white leading-tight">{campaign.title}</h3>
                  <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
                    By {campaign.sponsorName}
                  </div>
                  <div className="mt-auto border-t border-[#1a1a1a] pt-3">
                    {isInternalCoreCampaign(campaign) ? (
                      <>
                        <div className="text-[9px] font-mono text-nexid-muted mb-0.5 uppercase tracking-wider">Campaign Type</div>
                        <div className="text-xs font-bold text-white">Internal</div>
                      </>
                    ) : (
                      <>
                        <div className="text-[9px] font-mono text-nexid-muted mb-0.5 uppercase tracking-wider">Prize Pool</div>
                        <div className={`text-xs font-bold ${campaign.status === "ENDED" ? "text-nexid-muted" : "text-white"}`}>
                          ${formatUsdc(campaign.prizePoolUsdc)} USDC
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {hasMore ? (
        <div className="flex justify-center mt-10">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="px-8 py-3 bg-[#111] border border-[#333] text-white font-medium text-sm rounded-xl hover:bg-[#1a1a1a] hover:border-nexid-gold/40 transition-all"
          >
            Load More Campaigns
          </button>
        </div>
      ) : null}
    </section>
  );
}
