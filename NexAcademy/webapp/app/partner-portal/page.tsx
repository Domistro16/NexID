"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const NEGATIVES = [
  "Bots often claim a large share of rewards.",
  "Most participants skip the educational material.",
  "Many users sell tokens immediately after receiving them.",
  "Projects cannot measure whether users actually understood the protocol.",
];

const POSITIVES = [
  "Interactive lessons and quizzes help keep users engaged.",
  "Blockchain actions are checked before rewards are given.",
  "Basic filtering to reduce bot participation.",
  "Campaign completions can be recorded as on-chain credentials.",
];

const TIERS = [
  {
    name: "Standard Flow",
    price: "$15,000",
    sub: "USDC Min",
    blurb: "A basic campaign to introduce users to your protocol.",
    features: [
      "1 Week Campaign",
      "Up to 5 Video Modules",
      "Standard X/Discord Verification",
      "Advanced Smart Contract Triggers",
    ],
    cta: "Select Standard",
    featured: false,
  },
  {
    name: "Premium Hub",
    price: "$50,000",
    sub: "USDC Min",
    blurb: "A larger campaign with deeper on-chain task verification.",
    features: [
      "3 Week Campaign Logic",
      "Up to 10 Video Modules",
      "Cryptographic On-Chain Verifications",
      "Protocol SBT Mint Integration",
    ],
    cta: "Select Premium",
    featured: true,
  },
  {
    name: "Ecosystem Custom",
    price: "$100k+",
    sub: "USDC Pool",
    blurb: "Custom campaign design for large protocol launches.",
    features: [
      "1+ Month Campaign",
      "Bespoke Sybil AI Tuning",
      "Dedicated Account Manager",
      "Custom Contract Audits",
    ],
    cta: "Contact Enterprise",
    featured: false,
  },
];

const DAYS = [22, 23, 24, 25, 26, 27, 28];
const SLOTS = ["10:00 AM", "11:30 AM", "2:00 PM", "4:30 PM"];

export default function PartnerPortalPage() {
  const [date, setDate] = useState(26);
  const [time, setTime] = useState("11:30 AM");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>(".nexid-enterprise .reveal"),
    );

    const observer = new IntersectionObserver(
      (entries, io) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("active");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );

    items.forEach((item) => observer.observe(item));
    const timeout = setTimeout(() => {
      items.forEach((item) => {
        if (item.getBoundingClientRect().top < window.innerHeight) {
          item.classList.add("active");
        }
      });
    }, 100);

    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="nexid-enterprise relative min-h-screen scroll-smooth">
      <div className="bg-stardust" />
      <div className="bg-glow" />

      <header className="fixed top-0 z-50 flex h-20 w-full items-center justify-between border-b border-nexid-border bg-[#030303]/80 px-6 backdrop-blur-xl lg:px-12">
        <Link href="/" className="font-display cursor-pointer text-2xl font-black tracking-tighter">
          N<span className="hidden sm:inline">ex</span>ID<span className="text-nexid-gold">.</span>
          <span className="ml-2 rounded border border-[#222] px-1.5 py-0.5 font-mono text-[10px] font-normal tracking-widest text-nexid-muted shadow-inner-glaze">
            ENTERPRISE
          </span>
        </Link>

        <nav className="hidden gap-8 text-sm font-medium md:flex">
          <a href="#roi" className="text-nexid-muted transition-colors hover:text-white">
            The Paradigm
          </a>
          <a href="#impact" className="text-nexid-muted transition-colors hover:text-white">
            Platform Impact
          </a>
          <a href="#tiers" className="text-nexid-muted transition-colors hover:text-white">
            Deployment Tiers
          </a>
        </nav>

        <div className="flex items-center gap-4">
          <a
            href="/partner-console"
            className="hidden rounded-lg border border-[#333] px-5 py-2.5 text-sm font-medium text-white transition-all hover:border-[#555] hover:bg-[#111] sm:block"
          >
            Partner Login
          </a>
          <a
            href="#book"
            className="rounded-lg bg-nexid-gold px-6 py-2.5 text-sm font-bold text-black transition-all hover:shadow-[0_0_20px_rgba(255,176,0,0.4)]"
          >
            Book Strategy Call
          </a>
        </div>
      </header>

      <main className="w-full pt-20">
        <section className="relative flex min-h-[85vh] w-full flex-col items-center justify-between overflow-hidden border-b border-[#1a1a1a] px-6 text-center">
          <div className="reveal relative z-10 flex w-full max-w-5xl flex-1 flex-col items-center justify-center py-20">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-nexid-gold/30 bg-nexid-gold/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-nexid-gold shadow-inner-glaze">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-nexid-gold shadow-gold-glow" />
              A platform for protocols to educate and onboard users.
            </div>
            <h1 className="crisp-text font-display mb-6 text-5xl font-black leading-[1.05] tracking-tighter text-white md:text-7xl lg:text-[5.5rem]">
              Airdrops attract bots.
              <br />
              <span className="bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent">
                But we focus on real users.              </span>
            </h1>
            <p className="crisp-text mx-auto mb-14 max-w-3xl text-lg leading-relaxed text-nexid-muted md:text-xl">
              Run a campaign that teaches users your protocol and only rewards wallets that complete verified actions.
            </p>
            <div className="flex w-full flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="#book"
                className="flex w-full items-center justify-center rounded-xl bg-white px-8 py-4 text-sm font-bold text-black transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] sm:w-auto"
              >
                Deploy a Campaign
              </a>
              <a
                href="#impact"
                className="shadow-inner-glaze flex w-full items-center justify-center rounded-xl border border-[#333] bg-[#0a0a0a] px-8 py-4 text-sm font-medium text-white transition-all hover:border-[#555] hover:bg-[#111] sm:w-auto"
              >
                View Platform Capabilities
              </a>
            </div>
          </div>

          <div className="reveal delay-200 w-full border-t border-[#1a1a1a]/50 bg-gradient-to-t from-[#030303] to-transparent pb-12 pt-12">
            <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 text-left md:grid-cols-4">
              <Metric value="100%" label="Sybil Resistant" highlight />
              <Metric value="483" label="Verified Base" />
              <Metric value="$15k" label="Min. Deployment" />
              <Metric value="AI" label="Synthesia Curriculum" />
            </div>
          </div>
        </section>

        <section id="roi" className="mx-auto w-full max-w-7xl px-6 py-24 lg:py-32">
          <div className="reveal mb-16 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-5xl">
              The new standard for protocol growth.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <CardPanel
              title="High reward costs with low user quality."
              badge="Traditional Airdrops / Quests"
              badgeClass="border-red-500/30 bg-red-500/10 text-red-500"
              items={NEGATIVES}
              negative
            />
            <CardPanel
              title="User understanding can be measured."
              badge="The NexID Protocol"
              badgeClass="border-nexid-gold/30 bg-nexid-gold/10 text-nexid-gold"
              items={POSITIVES}
            />
          </div>
        </section>

        <section id="impact" className="w-full border-y border-[#1a1a1a] bg-[#050505] py-24 lg:py-32">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-12">
            <div className="reveal lg:col-span-5">
              <div className="mb-6 inline-flex rounded-full border border-white/10 bg-[#111] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white/50 shadow-inner-glaze">
                Ecosystem Architecture
              </div>
              <h2 className="font-display mb-6 text-3xl font-bold leading-tight text-white md:text-5xl">
                Designed to reward users who actually interact with the protocol.
              </h2>
              <p className="mb-8 text-lg leading-relaxed text-nexid-muted">
                Campaign rewards are given only to users who complete lessons and verified tasks.
              </p>
              <div className="inline-flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                Network Status: Ready for Deployment
              </div>
            </div>
            <div className="reveal delay-100 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:col-span-7">
              <div className="premium-panel hover-card p-8 bg-[radial-gradient(ellipse_at_bottom_right,rgba(34,197,94,0.08),transparent_60%)] flex flex-col justify-center">
                <div className="font-display text-2xl font-bold text-white mb-2">Tasks are checked against blockchain activity before rewards are assigned.</div>

              </div>
              <div className="premium-panel hover-card p-8 border-red-500/20 bg-[radial-gradient(ellipse_at_bottom_left,rgba(239,68,68,0.05),transparent_60%)] flex flex-col justify-center">
                <div className="font-display text-2xl font-bold text-white mb-2">Filtering is applied to reduce bot participation</div>
              </div>
              <div className="premium-panel hover-card border-nexid-gold/20 bg-[radial-gradient(ellipse_at_top,rgba(255,176,0,0.05),transparent_60%)] p-8 sm:col-span-2 flex flex-col justify-center">
                <div className="font-display text-2xl font-bold text-white mb-2">Rewards are distributed automatically through smart contracts.</div>
              </div>
            </div>
          </div>
        </section>

        <section id="tiers" className="mx-auto w-full max-w-7xl px-6 py-24 lg:py-32">
          <div className="reveal mb-16 text-center">
            <h2 className="font-display mb-6 text-3xl font-bold tracking-tight text-white md:text-5xl">
              Ecosystem Deployment Tiers
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-nexid-muted">
              Choose a campaign size. We help create the lessons and configure the tasks.
            </p>
          </div>
          <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-3">
            {TIERS.map((tier, idx) => (
              <TierCard key={tier.name} tier={tier} delay={idx * 100} />
            ))}
          </div>
        </section>

        <section id="book" className="relative z-10 w-full border-t border-[#1a1a1a] bg-[#0a0a0a] py-24">
          <div className="reveal mx-auto max-w-4xl px-6">
            <div className="premium-panel bg-[#050505] p-8 shadow-premium md:p-12">
              <div className="mb-10 text-center">
                <h2 className="font-display mb-3 text-3xl font-bold text-white">
                  Initiate Protocol Deployment
                </h2>
                <p className="mx-auto max-w-lg text-sm text-nexid-muted">
                  Book a 30-minute architectural alignment call with the NexID Curriculum Team.
                </p>
              </div>

              {!confirmed ? (
                <>
                  <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
                    <div className="space-y-5">
                      <Field label="Project / Protocol Name" placeholder="e.g. Acme Protocol" type="text" />
                      <Field label="Work Email" placeholder="founder@protocol.com" type="email" />
                      <div>
                        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
                          Target Deployment Tier
                        </label>
                        <select defaultValue="Premium ($50k USDC)" className="b2b-input w-full cursor-pointer px-4 py-3 text-sm text-white">
                          <option>Standard ($15k USDC)</option>
                          <option>Premium ($50k USDC)</option>
                          <option>Ecosystem ($100k+ USDC)</option>
                        </select>
                      </div>
                    </div>

                    <div className="shadow-inner-glaze rounded-xl border border-[#222] bg-[#0a0a0a] p-6">
                      <h4 className="mb-6 text-sm font-medium text-white">Select Date (Feb 2026)</h4>
                      <div className="mb-3 grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-nexid-muted">
                        {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                          <div key={day}>{day}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-center text-xs text-white">
                        {DAYS.map((d) =>
                          d < 24 ? (
                            <div key={d} className="p-1.5 opacity-30">
                              {d}
                            </div>
                          ) : (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setDate(d)}
                              className={
                                d === date
                                  ? "rounded bg-nexid-gold p-1.5 font-bold text-black shadow-gold-glow"
                                  : "rounded border border-[#333] p-1.5 transition-colors hover:bg-[#222]"
                              }
                            >
                              {d}
                            </button>
                          ),
                        )}
                      </div>

                      <div className="mt-5 border-t border-[#1a1a1a] pt-5">
                        <div className="mb-3 font-mono text-[9px] uppercase tracking-widest text-nexid-muted">
                          Available Times (EST)
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {SLOTS.map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => setTime(slot)}
                              className={
                                slot === time
                                  ? "rounded bg-nexid-gold py-2 text-xs font-bold text-black shadow-gold-glow"
                                  : "rounded border border-[#333] py-2 text-xs text-white transition-colors hover:border-nexid-gold"
                              }
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-10 flex justify-center border-t border-[#1a1a1a] pt-8">
                    <button
                      type="button"
                      onClick={() => setConfirmed(true)}
                      className="rounded-xl bg-white px-12 py-4 text-base font-bold text-black transition-all hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                    >
                      Confirm & Request Access
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-10 text-center">
                  <h3 className="font-display mb-3 text-3xl text-white">Deployment Initiated</h3>
                  <p className="mx-auto mb-8 max-w-md text-nexid-muted">
                    Your strategy call is booked for February {date}, 2026 at {time} EST.
                  </p>
                  <a
                    href="/partner-console"
                    className="inline-block rounded-lg border border-[#333] bg-[#111] px-8 py-3 font-medium text-white transition-colors hover:border-nexid-gold hover:text-nexid-gold"
                  >
                    Open Partner Console
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="relative z-10 border-t border-[#1a1a1a] bg-[#030303] py-12 text-center">
          <div className="font-display mb-3 text-2xl font-black tracking-tighter text-white">
            N<span className="hidden sm:inline">ex</span>ID<span className="text-nexid-gold">.</span>
          </div>
          <div className="mb-6 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
            Interactive Identity Protocol
          </div>
          <div className="mt-8 font-mono text-[10px] text-[#444]">2026 NexID. Built for the decentralized web.</div>
        </footer>
      </main>
    </div>
  );
}

function Metric({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {
  return (
    <div className={`border-l-2 pl-4 ${highlight ? "border-nexid-gold" : "border-[#333]"}`}>
      <div className="font-display text-2xl font-bold text-white">{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">{label}</div>
    </div>
  );
}

function CardPanel({
  title,
  badge,
  badgeClass,
  items,
  negative = false,
}: {
  title: string;
  badge: string;
  badgeClass: string;
  items: string[];
  negative?: boolean;
}) {
  return (
    <div className="premium-panel reveal bg-[#050505] p-10">
      <div className={`mb-6 inline-flex rounded border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${badgeClass}`}>
        {badge}
      </div>
      <h3 className="font-display mb-4 text-2xl text-white">{title}</h3>
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item} className={`flex items-start gap-3 text-sm ${negative ? "text-nexid-muted" : "text-white/90"}`}>
            <span className={`mt-1 h-2 w-2 rounded-full ${negative ? "bg-red-500" : "bg-nexid-gold"}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImpactCard({
  value,
  title,
  text,
  tone,
}: {
  value: string;
  title: string;
  text: string;
  tone: "green" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "bg-[radial-gradient(ellipse_at_bottom_right,rgba(34,197,94,0.08),transparent_60%)]"
      : "border-red-500/20 bg-[radial-gradient(ellipse_at_bottom_left,rgba(239,68,68,0.05),transparent_60%)]";
  const textTone = tone === "green" ? "text-green-400" : "text-red-500";

  return (
    <div className={`premium-panel hover-card p-8 ${toneClass}`}>
      <div className="font-display mb-2 text-4xl font-black text-white">{value}</div>
      <div className={`mb-1 text-sm font-bold ${textTone}`}>{title}</div>
      <div className="text-xs text-nexid-muted">{text}</div>
    </div>
  );
}

function TierCard({
  tier,
  delay,
}: {
  tier: (typeof TIERS)[number];
  delay: number;
}) {
  const delayClass = delay === 100 ? "delay-100" : delay === 200 ? "delay-200" : "";
  const featuredStyle = tier.featured
    ? "border-nexid-gold/50 bg-[radial-gradient(ellipse_at_top,rgba(255,176,0,0.08),transparent_60%)] p-10 shadow-gold-glow md:-translate-y-4"
    : "bg-[#050505] p-8";

  return (
    <div className={`premium-panel hover-card reveal ${delayClass} ${featuredStyle}`}>
      <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
        {tier.name}{" "}
        {tier.featured ? (
          <span className="ml-2 rounded bg-nexid-gold px-2 py-0.5 font-bold text-black">
            POPULAR
          </span>
        ) : null}
      </div>
      <div className="font-display mb-2 text-3xl font-bold text-white">
        {tier.price}{" "}
        <span className="text-sm font-normal text-nexid-muted">{tier.sub}</span>
      </div>
      <p className="mb-8 border-b border-[#222] pb-8 text-xs text-nexid-muted">{tier.blurb}</p>
      <ul className="mb-8 space-y-4 text-sm text-white/80">
        {tier.features.map((feature, idx) => (
          <li key={feature} className={`flex items-center gap-3 ${!tier.featured && idx === 3 ? "opacity-30" : ""}`}>
            <span className={`h-2 w-2 rounded-full ${!tier.featured && idx === 3 ? "bg-[#555]" : "bg-nexid-gold"}`} />
            {feature}
          </li>
        ))}
      </ul>
      <a
        href="#book"
        className={
          tier.featured
            ? "block w-full rounded-lg bg-nexid-gold py-3.5 text-center text-sm font-bold text-black transition-all hover:shadow-[0_0_20px_rgba(255,176,0,0.4)]"
            : "block w-full rounded-lg border border-[#333] py-3 text-center text-sm font-medium text-white transition-colors hover:bg-[#111]"
        }
      >
        {tier.cta}
      </a>
    </div>
  );
}

function Field({
  label,
  placeholder,
  type,
}: {
  label: string;
  placeholder: string;
  type: "text" | "email";
}) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
        {label}
      </label>
      <input type={type} placeholder={placeholder} className="b2b-input w-full px-4 py-3 text-sm" />
    </div>
  );
}
