"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const tiers = [
  "1-Week Launch Sprint",
  "1-Month Deep Dive",
  "6-Month Academy Retainer",
];

const availableDates = [17, 18, 19, 20, 21];
const availableTimes = ["10:00 AM", "11:30 AM", "2:00 PM", "4:30 PM"];

const engineCards = [
  {
    title: "Watch-Time Verification",
    description:
      "We ensure your educational content is actually consumed. Our player verifies active engagement so protocol mechanics are truly understood by participants.",
    accent:
      "hover:border-blue-500/40 bg-gradient-to-br from-[#0d0d0d] to-[#030303]",
    glow: "bg-blue-500/10 group-hover:bg-blue-500/20",
    iconWrap:
      "bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]",
    icon: (
      <svg
        className="w-7 h-7 text-blue-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
        />
      </svg>
    ),
  },
  {
    title: "Dynamic Knowledge Checks",
    description:
      "Interactive assessments confirm deep comprehension. Users must prove they grasp your ecosystem concepts to unlock the global reward leaderboard entirely.",
    accent:
      "hover:border-nexid-gold/40 bg-gradient-to-br from-[#0d0d0d] to-[#030303]",
    glow: "bg-nexid-gold/10 group-hover:bg-nexid-gold/20",
    iconWrap:
      "bg-nexid-gold/10 border-nexid-gold/20 shadow-[0_0_15px_rgba(255,176,0,0.15)]",
    icon: (
      <svg
        className="w-7 h-7 text-nexid-gold"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
        />
      </svg>
    ),
  },
  {
    title: "AI Social Insight Grading",
    description:
      "Turn casual users into highly educated advocates. We automatically grade social posts for relevance to incentivize organic, high-quality platform growth.",
    accent:
      "hover:border-nexid-purple/40 bg-gradient-to-br from-[#0d0d0d] to-[#030303]",
    glow: "bg-nexid-purple/10 group-hover:bg-nexid-purple/20",
    iconWrap:
      "bg-nexid-purple/10 border-nexid-purple/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]",
    icon: (
      <svg
        className="w-7 h-7 text-nexid-purple"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
  },
  {
    title: "Onchain Task Verification",
    description:
      "Drive actual protocol usage through guided action. We seamlessly verify testnet or mainnet interactions to build an active, loyal user network globally.",
    accent:
      "hover:border-green-500/40 bg-gradient-to-br from-[#0d0d0d] to-[#030303]",
    glow: "bg-green-500/10 group-hover:bg-green-500/20",
    iconWrap:
      "bg-green-500/10 border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.15)]",
    icon: (
      <svg
        className="w-7 h-7 text-green-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
  },
];

export default function PartnerPortalPage() {
  const [tier, setTier] = useState(1);
  const [date, setDate] = useState(19);
  const [time, setTime] = useState("11:30 AM");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("active");
            obs.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: "0px", threshold: 0.1 },
    );

    const revealElements = Array.from(document.querySelectorAll(".reveal"));
    revealElements.forEach((element) => observer.observe(element));

    const timeoutId = window.setTimeout(() => {
      revealElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight) {
          element.classList.add("active");
        }
      });
    }, 100);

    return () => {
      window.clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, []);

  const confirmBooking = () => {
    const container = document.getElementById("booking-container");
    const action = document.getElementById("booking-action");

    if (container) container.style.opacity = "0";
    if (action) action.style.opacity = "0";

    window.setTimeout(() => {
      setConfirmed(true);
      if (container) container.style.opacity = "1";
      if (action) action.style.opacity = "1";
    }, 300);
  };

  return (
    <div className="nexid-enterprise relative min-h-screen">
      <div className="bg-stardust" />
      <div className="shooting-star star-1" />
      <div className="shooting-star star-2" />
      <div className="shooting-star star-3" />

      <header className="fixed top-0 z-50 flex h-20 w-full items-center justify-between border-b border-nexid-border bg-[#030303]/80 px-6 backdrop-blur-xl lg:px-12">
        <div
          className="font-display cursor-pointer text-2xl font-black tracking-tighter"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          N<span className="hidden sm:inline">ex</span>ID
          <span className="text-nexid-gold">.</span>
          <span className="ml-2 rounded border border-[#222] px-1.5 py-0.5 font-mono text-[10px] font-normal tracking-widest text-nexid-muted shadow-inner-glaze">
            ENTERPRISE
          </span>
        </div>

        <nav className="hidden gap-8 text-sm font-medium md:flex">
          <a href="#roi" className="text-nexid-muted transition-colors hover:text-white">
            The Paradigm
          </a>
          <a href="#engine" className="text-nexid-muted transition-colors hover:text-white">
            UA Engine
          </a>
          <a href="#tiers" className="text-nexid-muted transition-colors hover:text-white">
            Pricing & Tiers
          </a>
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/partner-console"
            className="hidden rounded-lg border border-[#333] bg-transparent px-5 py-2.5 text-sm font-medium text-white transition-all hover:border-[#555] hover:bg-[#111] active:scale-95 sm:block"
          >
            Client Portal
          </Link>
          <a
            href="#book"
            className="flex items-center gap-2 rounded-lg bg-nexid-gold px-6 py-2.5 text-sm font-bold text-black transition-all hover:shadow-[0_0_20px_rgba(255,176,0,0.4)] active:scale-95"
          >
            Deploy Campaign
          </a>
        </div>
      </header>

      <main className="w-full pt-20">
        <section className="relative flex min-h-[90vh] w-full flex-col items-center justify-center overflow-hidden border-b border-[#1a1a1a] px-6 text-center">
          <div className="reveal relative z-10 flex w-full max-w-5xl flex-1 flex-col items-center justify-center py-20">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-nexid-cyan/30 bg-nexid-cyan/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-nexid-cyan shadow-inner-glaze">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-nexid-cyan shadow-cyan-glow" />
              Educational User Acquisition
            </div>

            <h1 className="crisp-text mb-6 font-display text-4xl font-black leading-[1.1] tracking-tighter text-white md:text-6xl lg:text-[4.5rem] xl:text-[5.5rem]">
              Stop acquiring bots.{" "}
              <span className="gradient-text drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                Acquire educated users.
              </span>
            </h1>

            <p className="crisp-text mx-auto mb-12 max-w-3xl text-lg leading-relaxed text-nexid-muted md:text-xl">
              Users learn about your ecosystem, actively use your protocol, share
              genuine insights, and earn rewards. Transform your documentation
              into interactive, multilingual video modules designed to build
              highly-educated communities.
            </p>

            <div className="flex w-full flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="#book"
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-sm font-bold text-black transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] active:scale-95 sm:w-auto md:text-base"
              >
                Build Your Campaign
                <svg
                  className="h-4 w-4 transition-transform group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </a>
              <a
                href="#engine"
                className="flex w-full items-center justify-center rounded-xl border border-[#333] bg-[#0a0a0a] px-8 py-4 text-sm font-medium text-white shadow-inner-glaze transition-all hover:border-[#555] hover:bg-[#111] active:scale-95 sm:w-auto md:text-base"
              >
                Explore The Architecture
              </a>
            </div>
          </div>

          <div className="reveal delay-200 w-full border-t border-[#1a1a1a]/50 bg-gradient-to-t from-[#030303] to-transparent pb-12 pt-12">
            <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 text-left md:grid-cols-4">
              <div className="flex flex-col justify-center border-l-2 border-nexid-danger pl-4">
                <div className="relative mb-2 flex h-8 w-8 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-nexid-danger/20" />
                  <div className="scanner-sweep" />
                  <div className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-nexid-danger shadow-danger-glow" />
                  <div className="absolute h-1.5 w-1.5 rounded-full bg-nexid-danger" />
                </div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-nexid-danger">
                  ANTI-SYBIL CHECK
                </div>
              </div>

              <div className="flex flex-col justify-center border-l-2 border-nexid-purple pl-4">
                <div className="relative mb-2 flex h-8 w-8 items-center justify-center">
                  <div
                    className="absolute inset-0 animate-spin rounded-full border-2 border-dashed border-nexid-purple/40"
                    style={{ animationDuration: "4s" }}
                  />
                  <div className="absolute inset-0 scale-75 rounded-full border border-nexid-purple/20" />
                  <svg
                    className="h-3.5 w-3.5 animate-pulse text-nexid-purple"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                </div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-nexid-purple">
                  AI & SOCIAL GRADING
                </div>
              </div>

              <div className="flex flex-col justify-center border-l-2 border-nexid-cyan pl-4">
                <div className="relative mb-2 flex h-8 w-8 items-center justify-center">
                  <div
                    className="absolute inset-0 animate-ping rounded-full bg-nexid-cyan/20"
                    style={{ animationDuration: "2s" }}
                  />
                  <div className="absolute inset-0 rounded-full border-2 border-nexid-cyan/30" />
                  <svg
                    className="relative left-[1px] h-3.5 w-3.5 text-nexid-cyan"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-nexid-cyan">
                  NATIVE VIDEO TRACKING
                </div>
              </div>

              <div className="flex flex-col justify-center border-l-2 border-nexid-gold pl-4">
                <div className="relative mb-2 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-nexid-gold/30 bg-nexid-gold/5">
                  <div className="arrow-drop absolute flex flex-col items-center">
                    <svg
                      className="h-4 w-4 text-nexid-gold drop-shadow-[0_0_5px_rgba(255,176,0,0.8)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  </div>
                </div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-nexid-gold">
                  LOWER COST PER CPA
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="roi"
          className="mx-auto w-full max-w-7xl border-b border-[#1a1a1a] px-6 py-24 lg:py-32"
        >
          <div className="reveal mb-16 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-5xl">
              The new standard for protocol growth.
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="premium-panel reveal border-red-500/10 bg-[#050505] p-10">
              <div className="mb-6 inline-flex rounded border border-red-500/30 bg-red-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-red-500">
                Traditional Quests
              </div>
              <h3 className="mb-4 font-display text-2xl text-white">
                Low Quality Acquisition
              </h3>
              <ul className="space-y-4">
                {[
                  "Treasury drained by bot rings & proxy farms.",
                  "Users click through docs without reading them.",
                  "Raw engagement tasks cause account shadowbans.",
                  "Immediate liquidity dumping post-distribution.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-nexid-muted">
                    <svg
                      className="h-5 w-5 shrink-0 text-red-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="premium-panel reveal delay-100 border-nexid-cyan/20 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.08),transparent_60%)] p-10 shadow-cyan-glow">
              <div className="mb-6 inline-flex rounded border border-nexid-cyan/30 bg-nexid-cyan/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-nexid-cyan shadow-inner-glaze">
                The NexID Engine
              </div>
              <h3 className="mb-4 font-display text-2xl text-white">
                Verifiable Engagement
              </h3>
              <ul className="space-y-4">
                {[
                  "Interactive video modules that verify watch-time.",
                  "Dynamic knowledge checks ensure true comprehension.",
                  "Automated social grading rewards genuine project advocacy.",
                  "Cryptographic verification for onchain task execution.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-white/90">
                    <svg
                      className="h-5 w-5 shrink-0 text-nexid-cyan"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="engine" className="w-full border-b border-[#1a1a1a] bg-[#050505] py-24 lg:py-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="reveal mb-16 text-center">
              <h2 className="mb-6 font-display text-3xl font-bold text-white md:text-5xl">
                Engineered for genuine user growth.
              </h2>
              <p className="mx-auto max-w-2xl text-lg text-nexid-muted">
                We create a rewarding ecosystem where users learn, engage, and
                earnwhile ensuring your treasury only flows to verified human
                participants.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {engineCards.map((card, index) => (
                <div
                  key={card.title}
                  className={`premium-panel hover-card reveal group border border-[#222] p-8 ${card.accent} ${
                    index === 1 ? "delay-100" : index === 2 ? "delay-200" : index === 3 ? "delay-300" : ""
                  }`}
                >
                  <div
                    className={`absolute right-0 top-0 h-48 w-48 rounded-full blur-3xl transition-all duration-500 ${card.glow}`}
                  />
                  <div
                    className={`mb-6 flex h-14 w-14 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110 ${card.iconWrap}`}
                  >
                    {card.icon}
                  </div>
                  <h4 className="mb-3 font-display text-xl font-bold text-white">
                    {card.title}
                  </h4>
                  <p className="text-sm leading-relaxed text-nexid-muted">
                    {card.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="tiers" className="mx-auto w-full max-w-7xl px-6 py-24 lg:py-32">
          <div className="reveal mb-16 text-center">
            <h2 className="mb-4 inline-flex rounded-full border border-nexid-gold/30 bg-nexid-gold/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-nexid-gold">
              Pricing & Distribution
            </h2>
            <h3 className="mb-6 font-display text-3xl font-bold tracking-tight text-white md:text-5xl">
              Transparent Capital Allocation.
            </h3>
            <p className="mx-auto max-w-2xl text-sm text-nexid-muted">
              We charge a flat Production Fee to design and build your campaign.
              You supply the Reward Pool directly to your users. All tiers
              include our core Anti-Sybil Defense and AI Grading engine to ensure
              maximum capital efficiency.
            </p>
          </div>

          <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-3">
            <div className="premium-panel hover-card reveal flex flex-col bg-[#050505] p-8">
              <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
                1-Week "Launch Sprint"
              </div>
              <div className="mb-8 font-display text-3xl font-bold text-white">
                $3,500{" "}
                <span className="text-xs font-normal uppercase text-nexid-muted">
                  Production Fee
                </span>
              </div>

              <div className="mb-6 rounded border border-[#222] bg-[#0a0a0a] p-4">
                <div className="mb-1 text-[10px] uppercase text-nexid-muted">
                  Required Reward Capital
                </div>
                <div className="font-display text-lg text-white">
                  $5,000{" "}
                  <span className="text-xs font-normal text-nexid-muted">
                    Min Reward Pool
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-nexid-gold">
                  Capped at 150 Winners max.
                </div>
              </div>

              <p className="mb-6 flex-1 border-b border-[#222] pb-6 text-xs text-nexid-muted">
                Best for launching a specific new feature or liquidity pool that
                requires immediate, focused attention.
              </p>

              <ul className="mb-8 space-y-4 text-xs text-white/80">
                {[
                  "2 Interactive Videos",
                  "2 AI-Graded Social Tasks",
                  "1 Onchain Task Verification",
                  "Active Watch-Time Tracking",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <svg
                      className="h-4 w-4 text-nexid-muted"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
                <li className="flex items-center gap-3">
                  <svg
                    className="h-4 w-4 text-nexid-cyan"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                    />
                  </svg>
                  Extra Languages on Request
                </li>
              </ul>

              <a
                href="#book"
                onClick={() => setTier(0)}
                className="block w-full rounded-lg border border-[#333] py-3 text-center text-sm font-medium text-white transition-colors hover:bg-[#111]"
              >
                Select Sprint
              </a>
            </div>

            <div className="premium-panel hover-card reveal delay-100 relative flex flex-col border-nexid-cyan/50 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.08),transparent_60%)] p-10 shadow-cyan-glow lg:-translate-y-4">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-nexid-cyan to-transparent" />
              <div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-nexid-cyan">
                1-Month "Deep Dive"
                <span className="rounded bg-nexid-cyan px-2 py-0.5 font-bold text-black">
                  POPULAR
                </span>
              </div>

              <div className="mb-8 font-display text-4xl font-bold text-white">
                $8,500{" "}
                <span className="text-xs font-normal uppercase text-white/50">
                  Production Fee
                </span>
              </div>

              <div className="mb-6 rounded border border-nexid-cyan/30 bg-[#050505] p-4">
                <div className="mb-1 text-[10px] uppercase text-nexid-cyan">
                  Required Reward Capital
                </div>
                <div className="font-display text-lg text-white">
                  $15,000{" "}
                  <span className="text-xs font-normal text-nexid-muted">
                    Min Reward Pool
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-nexid-gold">
                  Capped at 500 Winners max.
                </div>
              </div>

              <p className="mb-6 flex-1 border-b border-[#222] pb-6 text-xs text-white/70">
                Best for onboarding users to a complex ecosystem with weekly
                structured unlocks.
              </p>

              <ul className="mb-8 space-y-4 text-xs text-white">
                {[
                  "4-6 Interactive Videos",
                  "4 AI-Graded Social Tasks",
                  "4 Onchain Task Verifications",
                  "Active Watch-Time Tracking",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <svg
                      className="h-4 w-4 text-nexid-cyan"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
                <li className="flex items-center gap-3">
                  <svg
                    className="h-4 w-4 text-nexid-gold"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                    />
                  </svg>
                  Extra Languages on Request
                </li>
              </ul>

              <a
                href="#book"
                onClick={() => setTier(1)}
                className="block w-full rounded-lg bg-nexid-cyan py-3.5 text-center text-sm font-bold text-black transition-all hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]"
              >
                Select Deep Dive
              </a>
            </div>

            <div className="premium-panel hover-card reveal delay-200 flex flex-col bg-[#050505] p-8">
              <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-nexid-gold">
                6-Month "Academy Retainer"
              </div>
              <div className="mb-8 font-display text-3xl font-bold text-white">
                Custom{" "}
                <span className="text-xs font-normal uppercase text-nexid-muted">
                  Production Fee
                </span>
              </div>

              <div className="mb-6 rounded border border-[#222] bg-[#0a0a0a] p-4">
                <div className="mb-1 text-[10px] uppercase text-nexid-muted">
                  Required Reward Capital
                </div>
                <div className="font-display text-lg text-white">
                  $30,000{" "}
                  <span className="text-xs font-normal text-nexid-muted">
                    Min Pool / Month
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-nexid-gold">
                  Rolling Leaderboards.
                </div>
              </div>

              <p className="mb-6 flex-1 border-b border-[#222] pb-6 text-xs text-nexid-muted">
                Best for major protocols that require a permanent, evergreen
                onboarding academy.
              </p>

              <ul className="mb-8 space-y-4 text-xs text-white/80">
                {[
                  "Custom Interactive Modules",
                  "Continuous Onchain & Social Tasks",
                  "Dedicated Curriculum Manager",
                  "Active Watch-Time Tracking",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <svg
                      className="h-4 w-4 text-nexid-gold"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
                <li className="flex items-center gap-3">
                  <svg
                    className="h-4 w-4 text-nexid-cyan"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                    />
                  </svg>
                  Extra Languages on Request
                </li>
              </ul>

              <a
                href="#book"
                onClick={() => setTier(2)}
                className="block w-full rounded-lg border border-[#333] py-3 text-center text-sm font-medium text-white transition-colors hover:bg-[#111]"
              >
                Contact Our Team
              </a>
            </div>
          </div>
        </section>

        <section
          id="book"
          className="relative z-10 w-full border-t border-[#1a1a1a] bg-[#0a0a0a] py-24 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
        >
          <div className="reveal mx-auto max-w-4xl px-6">
            <div className="premium-panel bg-[#050505] p-8 shadow-premium md:p-12">
              {!confirmed ? (
                <>
                  <div className="mb-10 text-center">
                    <h2 className="mb-3 font-display text-3xl font-bold text-white">
                      Initiate Architecture Call
                    </h2>
                    <p className="mx-auto max-w-lg text-sm text-nexid-muted">
                      Book a 30-minute alignment call with our team to review
                      your documentation, set your reward pool distribution, and
                      confirm your onchain task integrations.
                    </p>
                  </div>

                  <div
                    id="booking-container"
                    className="grid grid-cols-1 gap-12 transition-opacity md:grid-cols-2"
                    style={{ transitionDuration: "300ms" }}
                  >
                    <div className="space-y-5">
                      <div>
                        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
                          Project / Protocol Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Acme Protocol"
                          className="b2b-input w-full px-4 py-3 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
                          Work Email
                        </label>
                        <input
                          type="email"
                          placeholder="founder@protocol.com"
                          className="b2b-input w-full px-4 py-3 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
                          Target Deployment Tier
                        </label>
                        <select
                          id="tier-select"
                          className="custom-select w-full cursor-pointer rounded-lg border border-[#222] bg-black px-4 py-3 text-sm text-white transition-colors hover:bg-white hover:text-black focus:border-nexid-cyan focus:outline-none"
                          value={tier}
                          onChange={(event) => setTier(Number(event.target.value))}
                        >
                          {tiers.map((tierLabel, index) => (
                            <option key={tierLabel} value={index} className="bg-black text-white">
                              {tierLabel}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#222] bg-[#0a0a0a] p-6 shadow-inner-glaze">
                      <div className="mb-6 flex items-center justify-between">
                        <h4 className="text-sm font-medium text-white">
                          Select Date (Mar 2026)
                        </h4>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded border border-[#333] p-1 text-white hover:bg-[#111]"
                          >
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15 19l-7-7 7-7"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="rounded border border-[#333] p-1 text-white hover:bg-[#111]"
                          >
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="mb-3 grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-nexid-muted">
                        <div>S</div>
                        <div>M</div>
                        <div>T</div>
                        <div>W</div>
                        <div>T</div>
                        <div>F</div>
                        <div>S</div>
                      </div>

                      <div className="grid grid-cols-7 gap-1 text-center text-xs text-white">
                        <div className="p-1.5 opacity-30">15</div>
                        <div className="p-1.5 opacity-30">16</div>
                        {availableDates.map((day) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => setDate(day)}
                            className={`rounded p-1.5 transition-colors ${
                              date === day
                                ? "date-active bg-nexid-cyan font-bold text-black shadow-cyan-glow"
                                : "border border-[#333] hover:bg-[#222]"
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>

                      <div className="mt-5 border-t border-[#1a1a1a] pt-5">
                        <div className="mb-3 font-mono text-[9px] uppercase tracking-widest text-nexid-muted">
                          Available Times (EST)
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {availableTimes.map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => setTime(slot)}
                              className={`rounded py-2 text-xs transition-colors ${
                                time === slot
                                  ? "bg-nexid-cyan font-bold text-black shadow-cyan-glow"
                                  : "border border-[#333] text-white hover:border-nexid-cyan"
                              }`}
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    id="booking-action"
                    className="mt-10 flex justify-center border-t border-[#1a1a1a] pt-8 transition-opacity"
                    style={{ transitionDuration: "300ms" }}
                  >
                    <button
                      type="button"
                      onClick={confirmBooking}
                      className="flex items-center gap-3 rounded-xl bg-white px-12 py-4 text-base font-bold text-black transition-all hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95"
                    >
                      Confirm Call & Request Demo
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14 5l7 7m0 0l-7 7m7-7H3"
                        />
                      </svg>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10 text-green-400 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                    <svg
                      className="h-10 w-10"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h3 className="mb-3 font-display text-3xl text-white">
                    Architecture Call Confirmed
                  </h3>
                  <p className="mx-auto mb-8 max-w-md text-nexid-muted">
                    An invite has been sent to your email. You will receive a
                    temporary access key to view the Client ROI Dashboard demo
                    before our meeting.
                  </p>
                  <button
                    type="button"
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="rounded-lg border border-[#333] bg-[#111] px-8 py-3 font-medium text-white transition-colors hover:border-nexid-cyan hover:text-nexid-cyan"
                  >
                    Return to Top
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="relative z-10 border-t border-[#1a1a1a] bg-[#030303] py-12 text-center">
          <div className="mb-3 font-display text-2xl font-black tracking-tighter text-white">
            N<span className="hidden sm:inline">ex</span>ID
            <span className="text-nexid-gold">.</span>
          </div>
          <div className="mb-6 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
            Educational User Acquisition
          </div>
          <div className="flex justify-center gap-6 text-sm font-medium text-nexid-muted">
            <Link href="/partner-console" className="transition-colors hover:text-white">
              Client Portal Login
            </Link>
            <a href="#" className="transition-colors hover:text-white">
              Security Architecture
            </a>
            <a href="#" className="transition-colors hover:text-white">
              Twitter (X)
            </a>
          </div>
          <div className="mt-8 font-mono text-[10px] text-[#444]">
            2026 NexID. Built for the decentralized web.
          </div>
        </footer>
      </main>
    </div>
  );
}
