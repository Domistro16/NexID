"use client";

import { useEffect } from "react";

type NexidWindow = Window & typeof globalThis & {
  openConnectionModal?: (target: string) => void;
  launchAction?: (text: string) => void;
  closeModal?: () => void;
};

type LandingCampaign = {
  id: number;
  title: string;
  sponsorName: string;
  ownerType: string;
  contractType: string;
  prizePoolUsdc: string;
  coverImageUrl: string | null;
  status: string;
  endAt: string | null;
  isPublished: boolean;
};

const CAMPAIGN_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=800";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatUsdc(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString();
}

function getCampaignBadge(campaign: LandingCampaign) {
  if (campaign.status === "LIVE") {
    const endAt = campaign.endAt ? new Date(campaign.endAt) : null;
    if (endAt && !Number.isNaN(endAt.getTime())) {
      const diff = endAt.getTime() - Date.now();
      if (diff > 0) {
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return {
          text: `Live Ends ${days}d`,
          className:
            "text-[10px] font-mono border border-nexid-gold/50 bg-nexid-gold/20 text-nexid-gold px-3 py-1.5 rounded tracking-widest uppercase shadow-gold-glow flex items-center gap-2 backdrop-blur-sm",
          dotClass: "w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_#ef4444]",
        };
      }
    }
    return {
      text: "Live",
      className:
        "text-[10px] font-mono border border-nexid-gold/30 bg-nexid-gold/10 text-nexid-gold px-3 py-1.5 rounded tracking-widest uppercase shadow-inner-glaze backdrop-blur-sm",
      dotClass: "",
    };
  }

  return {
    text: "Evergreen",
    className:
      "text-[10px] font-mono border border-[#333] bg-[#111] text-nexid-muted px-3 py-1.5 rounded tracking-widest uppercase shadow-inner-glaze backdrop-blur-sm",
    dotClass: "",
  };
}

function renderCampaignCard(campaign: LandingCampaign, delayClass: string) {
  const image = campaign.coverImageUrl || CAMPAIGN_FALLBACK_IMAGE;
  const badge = getCampaignBadge(campaign);
  const isInternal =
    campaign.ownerType === "NEXID" || campaign.contractType === "NEXID_CAMPAIGNS";
  const rewardLabel = isInternal
    ? "Internal Campaign"
    : `$${formatUsdc(campaign.prizePoolUsdc)} USDC`;

  return `
      <div onclick="window.location.assign('/academy/campaign/${campaign.id}')" class="course-card hover-card premium-panel flex flex-col overflow-hidden bg-[#0a0a0a] reveal ${delayClass} cursor-pointer">
        <div class="course-image-wrapper relative h-64 overflow-hidden border-b border-[#1a1a1a]">
          <img src="${escapeHtml(image)}" class="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-luminosity" alt="${escapeHtml(campaign.title)}">
          <div class="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent"></div>
          <div class="absolute top-5 left-5 ${badge.className}">
            ${badge.dotClass ? `<span class="${badge.dotClass}"></span>` : ""}
            ${escapeHtml(badge.text)}
          </div>
        </div>
        <div class="p-8 flex flex-col flex-1">
          <h3 class="text-2xl font-display text-white mb-2 leading-tight">${escapeHtml(campaign.title)}</h3>
          <div class="text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-6">By ${escapeHtml(campaign.sponsorName)}</div>
          <div class="mt-auto border-t border-[#1a1a1a] pt-5 flex justify-between items-end">
            <div>
              <div class="text-[10px] font-mono text-nexid-muted mb-1 uppercase tracking-wider">${isInternal ? "Campaign Type" : "Total Prize Pool"}</div>
              <div class="text-base font-bold text-white">${escapeHtml(rewardLabel)}</div>
            </div>
            <div class="text-xs font-bold text-nexid-gold transition-colors flex items-center gap-1 group">Enter Track</div>
          </div>
        </div>
      </div>
    `;
}

const HOME_HTML =
  String.raw`
<div class="bg-stardust"></div>
<div class="shooting-star star-1"></div>
<div class="shooting-star star-2"></div>
<div class="shooting-star star-3"></div>

<header class="h-20 border-b border-nexid-border flex items-center justify-between px-6 lg:px-12 bg-[#030303]/80 backdrop-blur-xl z-50 fixed top-0 w-full">
  <div class="font-display font-black text-2xl tracking-tighter cursor-pointer hover:text-white/80 transition-colors" onclick="window.scrollTo(0,0)">
    N<span class="hidden sm:inline">ex</span>ID<span class="text-nexid-gold">.</span>
    <span class="text-[10px] font-mono font-normal text-nexid-muted tracking-widest ml-2 border border-[#222] px-1.5 py-0.5 rounded shadow-inner-glaze">ACADEMY</span>
  </div>

  <nav class="hidden md:flex gap-8 text-sm font-medium">
    <a href="#campaigns" class="nav-link text-nexid-muted hover:text-white transition-colors">Campaigns</a>
    <a href="#journey" class="nav-link text-nexid-muted hover:text-white transition-colors">How it Works</a>
    <a href="/partner-portal" class="nav-link text-nexid-muted hover:text-white transition-colors">For Protocols</a>
  </nav>

  <div class="flex items-center gap-4">
    <button onclick="openConnectionModal('Partner Console')" class="px-5 py-2.5 bg-transparent border border-[#333] text-white font-medium text-sm rounded-lg hover:bg-[#111] hover:border-[#555] transition-all active:scale-95 hidden sm:block">Partner Portal</button>
    <button onclick="openConnectionModal('Student Protocol')" class="px-6 py-2.5 bg-white text-black font-bold text-sm rounded-lg hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-all active:scale-95 flex items-center gap-2">
      Launch App
    </button>
  </div>
</header>

<main class="w-full pt-20">
  <section class="relative w-full min-h-[90vh] flex items-center justify-center px-6 py-20 lg:py-0 overflow-hidden" id="hero-section">
    <div class="hero-orb"></div>
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.4)_0%,transparent_60%)] pointer-events-none z-0"></div>

    <div class="max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center relative z-10 px-0 lg:px-8">
      <div class="lg:col-span-6 flex flex-col items-start text-left reveal">
        <div class="text-[10px] font-mono text-nexid-gold border border-nexid-gold/30 bg-nexid-gold/5 px-3 py-1.5 rounded-full inline-flex mb-6 uppercase tracking-widest shadow-inner-glaze items-center gap-2">
          <span class="w-1.5 h-1.5 bg-nexid-gold rounded-full animate-pulse shadow-gold-glow"></span>
          Interactive Knowledge Engine
        </div>

        <h1 class="text-5xl md:text-6xl lg:text-7xl font-display font-black text-white mb-6 tracking-tighter leading-[1.05] crisp-text">
          Interactive campaigns.<br>
          <span class="text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">Learn, verify and earn rewards.</span>
        </h1>

        <p class="text-lg md:text-xl text-nexid-muted font-sans leading-relaxed max-w-xl mb-10 crisp-text">
          Complete short courses, perform simple on-chain tasks, and receive rewards in your NexID profile.
        </p>

        <div class="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto mb-14">
          <a href="#campaigns" class="w-full sm:w-auto px-8 py-4 bg-nexid-gold text-black font-bold text-sm md:text-base rounded-xl hover:shadow-gold-glow-lg transition-all active:scale-95 flex items-center justify-center gap-2 group">
            Explore Campaigns
            <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
            </svg>
          </a>
          <a href="#b2b-portal" class="w-full sm:w-auto px-8 py-4 bg-[#0a0a0a] border border-[#333] text-white font-medium text-sm md:text-base rounded-xl hover:bg-[#111] hover:border-nexid-gold/50 transition-all active:scale-95 shadow-inner-glaze flex items-center justify-center">
            Sponsor a Track
          </a>
        </div>

        <div class="grid grid-cols-3 gap-4 sm:gap-8 w-full border-t border-[#1a1a1a] pt-8">
          <div>
            <div class="text-xl md:text-2xl font-display text-white font-bold">$0.00</div>
            <div class="text-[9px] sm:text-[10px] font-mono text-nexid-muted uppercase tracking-widest mt-1">Total rewards distributed to learners</div>
          </div>
          <div class="border-l border-[#1a1a1a] pl-4 sm:pl-8">
            <div class="text-xl md:text-2xl font-display text-white font-bold">483</div>
            <div class="text-[9px] sm:text-[10px] font-mono text-nexid-muted uppercase tracking-widest mt-1">On-chain tasks completed by users</div>
          </div>
          <div class="border-l border-[#1a1a1a] pl-4 sm:pl-8">
            <div class="text-xl md:text-2xl font-display text-nexid-gold font-bold">0 Live</div>
            <div class="text-[9px] sm:text-[10px] font-mono text-nexid-muted uppercase tracking-widest mt-1">Active campaigns currently running</div>
          </div>
        </div>
      </div>

      <div class="lg:col-span-6 relative w-full h-[450px] lg:h-[600px] reveal delay-200 mt-10 lg:mt-0 flex items-center justify-center parallax-container">
        <div class="parallax-layer w-full h-full relative" id="parallax-layer">
          <div class="interactive-card absolute w-64 md:w-80 p-4 bg-[#0a0a0a]/90 backdrop-blur-2xl border border-[#222] rounded-2xl shadow-premium top-[5%] left-[10%] rotate-6 flex flex-col gap-3" style="transform: translateZ(-50px);">
            <div class="card-glow-hover absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_70%)] pointer-events-none rounded-2xl"></div>
            <div class="w-full aspect-video bg-black rounded-xl border border-[#222] relative overflow-hidden shadow-inner-glaze">
              <img src="https://images.unsplash.com/photo-1639762681485-074b7f4ec651?auto=format&fit=crop&q=80&w=800" class="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm pointer-events-none" alt="Interactive quiz">
              <div class="absolute inset-0 bg-black/60 pointer-events-none"></div>
              <div class="absolute inset-0 flex flex-col justify-center px-5 z-10">
                <div class="flex items-center gap-1.5 text-nexid-gold mb-2">
                  <span class="w-1.5 h-1.5 rounded-full bg-nexid-gold animate-pulse"></span>
                  <span class="text-[9px] font-mono uppercase tracking-widest">Interactive Quiz</span>
                </div>
                <div class="text-sm text-white font-medium mb-3 leading-tight crisp-text">What formula governs an AMM?</div>
                <div class="space-y-2 w-full">
                  <div class="w-full bg-[#111]/80 backdrop-blur border border-[#333] rounded-md px-3 py-1.5 text-[10px] text-white/70">x + y = k</div>
                  <div class="w-full bg-nexid-gold/20 backdrop-blur border border-nexid-gold rounded-md px-3 py-1.5 text-[10px] text-nexid-gold flex justify-between items-center shadow-[inset_0_0_10px_rgba(255,176,0,0.1)]">
                    <span class="font-bold">x * y = k</span>
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                </div>
              </div>
              <div class="absolute bottom-0 left-0 w-full h-1 bg-[#222]">
                <div class="h-full bg-nexid-gold w-2/3 shadow-[0_0_10px_#ffb000]"></div>
              </div>
            </div>
            <div class="flex justify-between items-center px-1 relative z-10">
              <div class="text-xs font-medium text-white">Module 1: Tokenomics</div>
              <span class="text-[9px] font-mono text-nexid-gold px-2 py-0.5 border border-nexid-gold/30 rounded bg-nexid-gold/10">04:12</span>
            </div>
          </div>

          <div class="interactive-card absolute w-72 md:w-96 p-6 bg-[#050505]/95 backdrop-blur-3xl border border-[#222] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_30px_rgba(255,176,0,0.1)] top-[40%] left-[5%] z-10" style="transform: translateZ(20px);">
            <div class="card-glow-hover absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,176,0,0.1)_0%,transparent_70%)] pointer-events-none rounded-2xl"></div>
            <div class="flex justify-between items-start mb-5 relative z-10">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-full bg-[#111] border border-[#333] flex items-center justify-center shadow-inner-glaze">
                  <svg class="w-6 h-6 text-nexid-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                  </svg>
                </div>
                <div>
                  <div class="text-base font-bold text-white mb-0.5">On-Chain Action</div>
                  <div class="text-[10px] font-mono text-nexid-muted uppercase tracking-widest">Verifying Contract...</div>
                </div>
              </div>
              <span class="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e] mt-1"></span>
            </div>
            <div class="w-full bg-[#111] p-4 rounded-xl border border-[#222] flex justify-between items-center relative z-10 shadow-inner-glaze">
              <div class="text-sm font-mono text-white font-medium">nadya<span class="text-nexid-gold">.id</span></div>
              <div class="text-[10px] font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded uppercase tracking-widest">Synced</div>
            </div>
          </div>

          <div class="interactive-card absolute w-56 md:w-64 p-6 bg-[#0a0a0a]/95 backdrop-blur-2xl border border-green-500/30 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.9),0_0_30px_rgba(34,197,94,0.15)] bottom-[10%] right-[10%] -rotate-3 z-20" style="transform: translateZ(60px);">
            <div class="card-glow-hover absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.15)_0%,transparent_70%)] pointer-events-none rounded-2xl"></div>
            <div class="text-[10px] font-mono text-green-400 uppercase tracking-widest mb-3 border-b border-green-500/20 pb-3 relative z-10 flex justify-between items-center">
              Yield Settled
              <svg class="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <div class="text-4xl font-display font-black text-white mb-1 relative z-10 tracking-tight">+$1,833<span class="text-xl text-white/50 font-normal">.02</span></div>
            <div class="text-xs font-mono text-nexid-muted mb-6 relative z-10">USDC Allocation</div>
            <div class="w-full py-2.5 bg-green-500/10 border border-green-500/50 text-green-400 text-center text-[10px] font-bold rounded-lg uppercase tracking-widest relative z-10">Claimed 1 Hr Ago</div>
          </div>
        </div>
      </div>
    </div>
  </section>


` +
  String.raw`
  <section id="journey" class="py-24 lg:py-32 w-full max-w-7xl mx-auto px-6">
    <div class="text-center mb-20 reveal">
      <h2 class="text-4xl md:text-5xl font-display font-bold text-white mb-6 tracking-tight">The Proof of Knowledge Flow</h2>
      <p class="text-nexid-muted max-w-2xl mx-auto text-lg leading-relaxed">A simple process where users learn how a protocol works and prove it through real actions.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div class="premium-panel hover-card p-10 reveal bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.04),transparent_50%)]">
        <div class="w-14 h-14 rounded-full border border-[#333] bg-[#111] flex items-center justify-center font-mono text-white mb-8 shadow-inner-glaze animate-[float_6s_ease-in-out_infinite]">01</div>
        <h3 class="text-2xl font-display text-white mb-4">Interactive Learning</h3>
        <p class="text-sm text-nexid-muted leading-relaxed mb-8">Watch short video lessons and answer questions to show you understood the material before moving forward.</p>
        <div class="w-full h-32 rounded-xl bg-[#050505] border border-[#222] overflow-hidden relative shadow-inner-glaze flex items-center justify-center">
          <div class="absolute inset-0 flex items-center justify-center opacity-30">
            <svg class="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
          </div>
          <div class="absolute bottom-0 left-0 w-full h-1 bg-[#1a1a1a]"><div class="h-full bg-white w-[40%] shadow-[0_0_10px_#fff]"></div></div>
        </div>
      </div>

      <div class="premium-panel hover-card p-10 reveal delay-100 bg-[radial-gradient(ellipse_at_top_left,rgba(255,176,0,0.06),transparent_50%)]">
        <div class="w-14 h-14 rounded-full border border-nexid-gold/40 bg-nexid-gold/10 flex items-center justify-center font-mono text-nexid-gold mb-8 shadow-gold-glow animate-[float_5s_ease-in-out_infinite]">02</div>
        <h3 class="text-2xl font-display text-white mb-4">On-Chain Verification</h3>
        <p class="text-sm text-nexid-muted leading-relaxed mb-8">Complete simple blockchain actions like swaps or wallet signatures. The platform checks that the action happened before allowing you to continue.</p>
        <div class="w-full bg-[#050505] border border-[#222] p-5 rounded-xl flex items-center justify-between shadow-inner-glaze">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded border border-[#333] flex items-center justify-center bg-[#111]">
              <svg class="w-5 h-5 text-nexid-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <div>
              <div class="text-sm font-medium text-white mb-0.5">Verify Smart Contract</div>
              <div class="text-[10px] font-mono text-nexid-muted uppercase">Querying State...</div>
            </div>
          </div>
          <div class="w-5 h-5 rounded-full border-2 border-nexid-gold border-t-transparent animate-spin"></div>
        </div>
      </div>

      <div class="premium-panel hover-card p-10 reveal bg-[radial-gradient(ellipse_at_bottom_right,rgba(34,197,94,0.06),transparent_50%)]">
        <div class="w-14 h-14 rounded-full border border-green-500/40 bg-green-500/10 flex items-center justify-center font-mono text-green-400 mb-8 shadow-[0_0_20px_rgba(34,197,94,0.2)] animate-[float_6s_ease-in-out_infinite_reverse]">03</div>
        <h3 class="text-2xl font-display text-white mb-4">Claim Allocations</h3>
        <p class="text-sm text-nexid-muted leading-relaxed mb-8">Earn points as you complete lessons and tasks. When the campaign ends, qualifying users can claim rewards without paying gas fees.</p>
        <div class="w-full bg-[#050505] border border-green-500/20 p-6 rounded-xl text-center shadow-[inset_0_0_20px_rgba(34,197,94,0.05)]">
          <div class="text-[10px] font-mono text-green-400 uppercase tracking-widest mb-1.5">Eligible Settlement</div>
          <div class="text-3xl font-display font-bold text-white">$500.00 <span class="text-base text-nexid-muted font-normal">USDC</span></div>
        </div>
      </div>

      <div class="premium-panel hover-card p-10 reveal delay-100 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,255,255,0.04),transparent_50%)]">
        <div class="w-14 h-14 rounded-full border border-[#333] bg-[#111] flex items-center justify-center font-mono text-white mb-8 shadow-inner-glaze animate-[float_7s_ease-in-out_infinite]">04</div>
        <h3 class="text-2xl font-display text-white mb-4">Mint Interactive SBTs</h3>
        <p class="text-sm text-nexid-muted leading-relaxed mb-8">Record your completed campaigns as permanent credentials tied to your NexID profile.</p>
        <div class="flex gap-4 items-center h-24">
          <div class="w-16 h-16 rounded-xl rotate-12 border border-[#333] bg-[#0a0a0a] flex items-center justify-center shadow-premium"><div class="text-nexid-gold font-display font-black text-xl opacity-50">S</div></div>
          <div class="w-20 h-20 rounded-xl -rotate-6 border-2 border-nexid-gold/60 bg-[#111] flex items-center justify-center shadow-gold-glow z-10"><div class="text-white font-display font-black text-3xl crisp-text">O</div></div>
          <div class="w-16 h-16 rounded-xl rotate-6 border border-[#333] bg-[#0a0a0a] flex items-center justify-center shadow-premium"><div class="text-nexid-muted font-display font-black text-xl opacity-50">L</div></div>
        </div>
      </div>
    </div>
  </section>

  <section id="campaigns" class="py-24 w-full max-w-[1600px] mx-auto px-6 border-t border-[#1a1a1a] relative z-10">
    <div class="flex flex-col md:flex-row justify-between items-end mb-12 reveal">
      <div>
        <div class="text-[10px] font-mono text-nexid-gold border border-nexid-gold/30 bg-nexid-gold/10 px-2.5 py-1 rounded inline-flex mb-4 uppercase tracking-widest shadow-inner-glaze">Active Matrix</div>
        <h2 class="text-4xl md:text-5xl font-display font-bold text-white mb-2 tracking-tight">Ecosystem Campaigns</h2>
        <p class="text-nexid-muted max-w-xl text-lg">Jump into live tracks to start climbing the global leaderboard.</p>
      </div>
      <button onclick="window.open('/academy', '_blank')" class="mt-6 md:mt-0 px-6 py-3.5 bg-[#111] border border-[#333] text-white text-sm font-medium rounded-lg hover:bg-[#1a1a1a] hover:border-white/30 transition-all active:scale-95 flex items-center gap-2 shadow-inner-glaze group">
        <span id="live-campaign-count">View All Campaigns</span>
        <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
        </svg>
      </button>
    </div>

    <div id="live-campaign-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      <div onclick="launchAction('Entering Secure Track...')" class="course-card hover-card premium-panel flex flex-col overflow-hidden bg-[#0a0a0a] reveal cursor-pointer">
        <div class="course-image-wrapper relative h-64 overflow-hidden border-b border-[#1a1a1a]">
          <img src="https://images.unsplash.com/photo-1642104704074-907c0698cbd9?auto=format&fit=crop&q=80&w=800" class="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-luminosity" alt="DeFi campaign">
          <div class="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent"></div>
          <div class="absolute top-5 left-5 text-[10px] font-mono border border-nexid-gold/50 bg-nexid-gold/20 text-nexid-gold px-3 py-1.5 rounded tracking-widest uppercase shadow-gold-glow flex items-center gap-2 backdrop-blur-sm">
            <span class="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_#ef4444]"></span>
            Live Ends 14d
          </div>
        </div>
        <div class="p-8 flex flex-col flex-1">
          <h3 class="text-2xl font-display text-white mb-2 leading-tight">DeFi Ecosystem: Liquidity & Routing</h3>
          <div class="text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-6">By Core Protocol</div>
          <div class="mt-auto border-t border-[#1a1a1a] pt-5 flex justify-between items-end">
            <div>
              <div class="text-[10px] font-mono text-nexid-muted mb-1 uppercase tracking-wider">Total Prize Pool</div>
              <div class="text-base font-bold text-white">$25,000 USDC + 1k .id</div>
            </div>
            <div class="text-xs font-bold text-nexid-gold transition-colors flex items-center gap-1 group">Enter Track</div>
          </div>
        </div>
      </div>

      <div onclick="launchAction('Entering Secure Track...')" class="course-card hover-card premium-panel flex flex-col overflow-hidden bg-[#0a0a0a] reveal delay-100 cursor-pointer">
        <div class="course-image-wrapper relative h-64 overflow-hidden border-b border-[#1a1a1a]">
          <img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800" class="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-luminosity" alt="NFT campaign">
          <div class="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent"></div>
          <div class="absolute top-5 left-5 text-[10px] font-mono border border-nexid-gold/30 bg-nexid-gold/10 text-nexid-gold px-3 py-1.5 rounded tracking-widest uppercase shadow-inner-glaze backdrop-blur-sm">Live</div>
        </div>
        <div class="p-8 flex flex-col flex-1">
          <h3 class="text-2xl font-display text-white mb-2 leading-tight">NFT Tokenomics</h3>
          <div class="text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-6">By NFT Collective</div>
          <div class="mt-auto border-t border-[#1a1a1a] pt-5 flex justify-between items-end">
            <div>
              <div class="text-[10px] font-mono text-nexid-muted mb-1 uppercase tracking-wider">Total Prize Pool</div>
              <div class="text-base font-bold text-white">$10,000 USDC + Tokens</div>
            </div>
            <div class="text-xs font-bold text-nexid-gold transition-colors flex items-center gap-1 group">Enter Track</div>
          </div>
        </div>
      </div>

      <div onclick="launchAction('Entering Secure Track...')" class="course-card hover-card premium-panel flex flex-col overflow-hidden bg-[#0a0a0a] reveal delay-200 cursor-pointer">
        <div class="course-image-wrapper relative h-64 overflow-hidden border-b border-[#1a1a1a]">
          <img src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=800" class="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-luminosity" alt="Smart contract campaign">
          <div class="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent"></div>
          <div class="absolute top-5 left-5 text-[10px] font-mono border border-[#333] bg-[#111] text-nexid-muted px-3 py-1.5 rounded tracking-widest uppercase shadow-inner-glaze backdrop-blur-sm">Evergreen</div>
        </div>
        <div class="p-8 flex flex-col flex-1">
          <h3 class="text-2xl font-display text-white mb-2 leading-tight">Smart Contract Infrastructure</h3>
          <div class="text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-6">By NexID Core</div>
          <div class="mt-auto border-t border-[#1a1a1a] pt-5 flex justify-between items-end">
            <div>
              <div class="text-[10px] font-mono text-nexid-muted mb-1 uppercase tracking-wider">Total Prize Pool</div>
              <div class="text-base font-bold text-white">$5,000 USDC + SBT</div>
            </div>
            <div class="text-xs font-bold text-nexid-gold transition-colors flex items-center gap-1 group">Enter Track</div>
          </div>
        </div>
      </div>
    </div>
  </section>
` +
  String.raw`
  <section id="b2b-portal" class="py-24 lg:py-32 w-full bg-[#050505] border-t border-[#1a1a1a] relative overflow-hidden z-10">
    <div class="absolute right-0 bottom-0 w-[800px] h-[800px] bg-[radial-gradient(circle_at_bottom_right,rgba(255,176,0,0.06)_0%,transparent_50%)] pointer-events-none"></div>
    <div class="max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center justify-between gap-16 relative z-10 reveal">
      <div class="max-w-xl">
        <div class="text-[10px] font-mono text-white/60 border border-white/10 bg-[#111] px-3 py-1.5 rounded-full inline-flex mb-8 uppercase tracking-widest shadow-inner-glaze">For Protocols & Developers</div>
        <h2 class="text-4xl md:text-5xl font-display font-bold text-white mb-6 leading-tight">Educate new users and confirm they actually used your product.</h2>
        <p class="text-nexid-muted leading-relaxed mb-8 text-lg">
          Instead of rewarding wallet activity alone, create a campaign that teaches users how your protocol works and checks that they completed real actions.
        </p>
        <ul class="space-y-5 mb-10">
          <li class="flex items-center gap-4 text-sm text-white/90 font-medium">
            <div class="p-1 rounded-full bg-nexid-gold/20">
              <svg class="w-4 h-4 text-nexid-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
            </div>
            Short video lessons generated with Synthesia.
          </li>
          <li class="flex items-center gap-4 text-sm text-white/90 font-medium">
            <div class="p-1 rounded-full bg-nexid-gold/20">
              <svg class="w-4 h-4 text-nexid-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
            </div>
            Verification of basic actions like swaps, mints, and staking.
          </li>
          <li class="flex items-center gap-4 text-sm text-white/90 font-medium">
            <div class="p-1 rounded-full bg-nexid-gold/20">
              <svg class="w-4 h-4 text-nexid-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
            </div>
            Campaign packages starting at $15,000.
          </li>
        </ul>
        <button onclick="openConnectionModal('Partner Console')" class="px-8 py-4 bg-white text-black font-bold text-sm rounded-xl hover:bg-gray-200 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center gap-2 group">
          Open Partner Portal
          <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
          </svg>
        </button>
      </div>

      <div class="w-full lg:w-1/2 [perspective:1000px]">
        <div class="premium-panel hover-card p-8 transform rotate-2 shadow-premium border-nexid-gold/20 cursor-default">
          <div class="flex items-center justify-between mb-8 border-b border-[#222] pb-4">
            <div class="flex gap-2"><div class="w-3 h-3 rounded-full bg-[#ef4444]"></div><div class="w-3 h-3 rounded-full bg-[#f59e0b]"></div><div class="w-3 h-3 rounded-full bg-[#22c55e]"></div></div>
            <div class="text-[10px] font-mono text-nexid-muted uppercase tracking-widest">partner.nexid.fun</div>
          </div>
          <div class="space-y-6 pointer-events-none">
            <div class="h-10 w-3/4 bg-[#111] rounded border border-[#222]"></div>
            <div class="grid grid-cols-3 gap-4">
              <div class="h-24 bg-[#111] rounded border border-[#222] relative overflow-hidden"><div class="absolute bottom-0 w-full h-[60%] bg-nexid-gold/20 border-t border-nexid-gold/50"></div></div>
              <div class="h-24 bg-[#111] rounded border border-[#222]"></div>
              <div class="h-24 bg-[#111] rounded border border-[#222]"></div>
            </div>
            <div class="h-40 w-full bg-[#111] rounded border border-[#222] flex items-end p-5 gap-3">
              <div class="w-full bg-white/10 h-[30%] rounded-t-sm"></div>
              <div class="w-full bg-white/10 h-[50%] rounded-t-sm"></div>
              <div class="w-full bg-nexid-gold h-[90%] rounded-t-sm shadow-gold-glow relative"><div class="absolute -top-3 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full"></div></div>
              <div class="w-full bg-white/10 h-[60%] rounded-t-sm"></div>
              <div class="w-full bg-white/10 h-[40%] rounded-t-sm"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <footer class="py-10 border-t border-[#1a1a1a] bg-[#030303] text-center relative z-10">
    <div class="font-display font-black text-2xl tracking-tighter text-white mb-3">N<span class="hidden sm:inline">ex</span>ID<span class="text-nexid-gold">.</span></div>
    <div class="text-[10px] font-mono text-nexid-muted uppercase tracking-widest mb-6">Interactive Identity Protocol</div>
    <div class="flex justify-center gap-6 text-sm font-medium text-nexid-muted">
      <a href="https://x.com/SafuVerse" target="_blank" rel="noreferrer" class="nav-link hover:text-white transition-colors">X (Twitter)</a>
      <a href="https://discord.gg/safuverse" target="_blank" rel="noreferrer" class="nav-link hover:text-white transition-colors">Discord</a>
      <a href="https://safuverse.gitbook.io/safuverse-docs/" target="_blank" rel="noreferrer" class="nav-link hover:text-white transition-colors">Docs</a>
      <a href="https://github.com/" target="_blank" rel="noreferrer" class="nav-link hover:text-white transition-colors">GitHub</a>
    </div>
    <div class="mt-8 text-[10px] text-[#555] font-mono">2026 NexID. All rights reserved.</div>
  </footer>
</main>

<div id="connect-modal" class="modal-overlay fixed inset-0 flex items-center justify-center p-4">
  <div class="absolute inset-0" onclick="closeModal()"></div>
  <div class="modal-content relative w-full max-w-sm premium-panel p-8 text-center flex flex-col items-center">
    <div class="w-16 h-16 rounded-full border-2 border-nexid-gold/50 border-t-nexid-gold animate-spin mb-6 shadow-gold-glow"></div>
    <h3 class="text-xl font-display text-white mb-2" id="modal-title">Connecting...</h3>
    <p class="text-sm text-nexid-muted font-mono" id="modal-desc">Establishing secure enclave.</p>
  </div>
</div>
`;

export default function Home() {
  useEffect(() => {
    const win = window as NexidWindow;
    let modalTimeout: ReturnType<typeof setTimeout> | null = null;
    const campaignsAbortController = new AbortController();

    const clearModalTimer = () => {
      if (modalTimeout) {
        clearTimeout(modalTimeout);
        modalTimeout = null;
      }
    };

    const closeModal = () => {
      clearModalTimer();
      document.getElementById("connect-modal")?.classList.remove("active");
    };

    const openConnectionModal = (target: string) => {
      const modal = document.getElementById("connect-modal");
      const modalTitle = document.getElementById("modal-title");
      const modalDesc = document.getElementById("modal-desc");
      if (!modal || !modalTitle || !modalDesc) {
        return;
      }

      modal.classList.add("active");
      modalTitle.textContent = `Connecting ${target}...`;
      modalDesc.textContent = "Awaiting wallet signature.";

      clearModalTimer();
      modalTimeout = setTimeout(() => {
        closeModal();
        if (target === "Partner Console") {
          window.location.assign("/partner-portal");
          return;
        }
        if (target === "Student Protocol") {
          const authToken = localStorage.getItem("auth_token");
          const hasAuthToken = Boolean(authToken && authToken.trim().length > 0);
          if (!hasAuthToken) {
            localStorage.removeItem("nexid_gateway_connected");
          }
          const destination = hasAuthToken ? "/academy" : "/academy-gateway";
          window.location.assign(destination);
          return;
        }
        window.open("/academy", "_blank", "noopener,noreferrer");
      }, 1500);
    };

    const launchAction = (text: string) => {
      const modal = document.getElementById("connect-modal");
      const modalTitle = document.getElementById("modal-title");
      const modalDesc = document.getElementById("modal-desc");
      if (!modal || !modalTitle || !modalDesc) {
        return;
      }

      modal.classList.add("active");
      modalTitle.textContent = text;
      modalDesc.textContent = "Verifying .id namespace...";

      clearModalTimer();
      modalTimeout = setTimeout(() => {
        closeModal();
        window.open("/academy", "_blank", "noopener,noreferrer");
      }, 1200);
    };

    win.openConnectionModal = openConnectionModal;
    win.launchAction = launchAction;
    win.closeModal = closeModal;

    const loadLiveCampaigns = async () => {
      const campaignGrid = document.getElementById("live-campaign-grid");
      const campaignCountEl = document.getElementById("live-campaign-count");
      if (!campaignGrid) {
        return;
      }

      try {
        const response = await fetch("/api/campaigns", {
          method: "GET",
          cache: "no-store",
          signal: campaignsAbortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch campaigns (${response.status})`);
        }

        const payload = (await response.json()) as { campaigns?: LandingCampaign[] };
        const campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];

        if (campaignCountEl) {
          const label = campaigns.length === 1 ? "Campaign" : "Campaigns";
          campaignCountEl.textContent = `View All ${campaigns.length} ${label}`;
        }

        if (campaigns.length === 0) {
          campaignGrid.innerHTML = `
            <div class="premium-panel p-8 text-center text-nexid-muted border border-[#222]">
              No live campaigns right now.
            </div>
          `;
          return;
        }

        const delayClasses = ["", "delay-100", "delay-200"];
        campaignGrid.innerHTML = campaigns
          .slice(0, 3)
          .map((campaign, index) => renderCampaignCard(campaign, delayClasses[index] ?? ""))
          .join("");

        campaignGrid.querySelectorAll<HTMLElement>(".reveal").forEach((element) => {
          element.classList.add("active");
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }
        console.error("Failed to load landing campaigns", error);
      }
    };

    void loadLiveCampaigns();

    const heroSection = document.getElementById("hero-section");
    const parallaxLayer = document.getElementById("parallax-layer");

    const handleMouseMove = (event: MouseEvent) => {
      if (!heroSection || !parallaxLayer) {
        return;
      }
      const rect = heroSection.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      const rotateY = (x / rect.width) * 15;
      const rotateX = -(y / rect.height) * 15;
      parallaxLayer.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    };

    const handleMouseLeave = () => {
      if (parallaxLayer) {
        parallaxLayer.style.transform = "rotateX(0deg) rotateY(0deg)";
      }
    };

    if (heroSection && parallaxLayer && window.innerWidth > 1024) {
      heroSection.addEventListener("mousemove", handleMouseMove);
      heroSection.addEventListener("mouseleave", handleMouseLeave);
    }

    const revealElements = Array.from(
      document.querySelectorAll<HTMLElement>(".nexid-homepage .reveal"),
    );

    const observer = new IntersectionObserver(
      (entries, intersectionObserver) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("active");
            intersectionObserver.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: "0px", threshold: 0.15 },
    );

    revealElements.forEach((element) => observer.observe(element));

    const initialRevealTimeout = setTimeout(() => {
      revealElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight) {
          element.classList.add("active");
        }
      });
    }, 100);

    return () => {
      campaignsAbortController.abort();
      clearModalTimer();
      clearTimeout(initialRevealTimeout);
      observer.disconnect();
      if (heroSection) {
        heroSection.removeEventListener("mousemove", handleMouseMove);
        heroSection.removeEventListener("mouseleave", handleMouseLeave);
      }
      delete win.openConnectionModal;
      delete win.launchAction;
      delete win.closeModal;
    };
  }, []);

  return (
    <div
      className="nexid-homepage scroll-smooth relative min-h-screen"
      dangerouslySetInnerHTML={{ __html: HOME_HTML }}
    />
  );
}
