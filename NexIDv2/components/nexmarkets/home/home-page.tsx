"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { marketPriceLabel, marketUiSummary } from "@/components/nexmarkets/market-ui";
import type { NexMarket } from "@/lib/types/nexmarkets";

type HomeWindow = Window & typeof globalThis & {
  home75Set?: (value: string) => void;
  home75Start?: () => void;
  home75Typing?: (value: string) => void;
  home75RotateHero?: () => void;
  home75OpenMarket?: (marketId: string) => void;
  home80OpenDashboard?: () => void;
  showView?: (view: string) => void;
};

type HomeHero = {
  marketId: string | null;
  state: string;
  category: string;
  title: string;
  summary: string;
  priceLabel: string;
  volumeLabel: string;
  route: string;
};

const NEXMIND_POWERED =
  "NexMind is the AI launch assistant inside NexMarkets.";
const ROUTED_TIP =
  "This market is routed from Polymarket. Original rules and settlement apply. NexMarkets does not control routed-market resolution.";
const NATIVE_TIP =
  "This market is native to NexMarkets. Rules, source and fallback are locked for settlement.";

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsSingle(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ");
}

function heroRouteValue(market: NexMarket) {
  if (market.origin === "native") return "creator route";
  if (market.origin === "polymarket") return "live route";
  return "no route yet";
}

function heroFromMarket(market: NexMarket): HomeHero {
  const ui = marketUiSummary(market);
  const label = marketPriceLabel(market, ui.price);

  return {
    marketId: market.id,
    state: ui.state,
    category: ui.category,
    title: market.title,
    summary: market.question || "Open NexMarkets route with live rules and market details.",
    priceLabel: label === "-" ? "&mdash;" : esc(label === "Pending" || label === "Refund" ? label : `${label} YES`),
    volumeLabel: ui.volumeLabel,
    route: heroRouteValue(market)
  };
}

function emptyHero(): HomeHero {
  return {
    marketId: null,
    state: "Live",
    category: "Markets",
    title: "No live markets are available yet.",
    summary: "Launch a native market or browse the markets page when new routes sync.",
    priceLabel: "&mdash;",
    volumeLabel: "$0",
    route: "no route yet"
  };
}

function buildHeroPool(markets: NexMarket[]) {
  const heroes = [...markets]
    .filter((market) => market.status !== "draft" && market.status !== "cancelled_before_trading")
    .sort((a, b) => {
      const aLive = a.status === "trading_live" ? 1 : 0;
      const bLive = b.status === "trading_live" ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt);
    })
    .slice(0, 4)
    .map(heroFromMarket);

  return heroes.length ? heroes : [emptyHero()];
}

function home75HeroCard(hero: HomeHero) {
  const openAction = hero.marketId ? `home75OpenMarket('${jsSingle(hero.marketId)}')` : "showView('narratives')";

  return `<div class="home75-live-card"><div><div class="home75-live-head"><span class="home75-tag">${esc(hero.state)} · ${esc(hero.category)}</span><button class="btn" onclick="${openAction}">Browse</button></div><h2>${esc(hero.title)}</h2><p>${esc(hero.summary)}</p></div><div><div class="home75-stats"><div class="home75-stat"><span>Price</span><b>${hero.priceLabel}</b></div><div class="home75-stat"><span>Volume</span><b>${esc(hero.volumeLabel)}</b></div><div class="home75-stat"><span>Route</span><b>${esc(hero.route || "Live")}</b></div></div><div class="home75-card-actions"><button class="primary" onclick="${openAction}">Browse live</button><button class="btn" onclick="showView('launch')">Create yours</button></div></div></div>`;
}

function home75SampleHtml() {
  return `<div class="home75-samples"><button onclick="home75Set('Airdrop claims will cross 600k wallets')">Airdrop wallets</button><button onclick="home75Set('Football transfer chatter will lead sports timelines')">Transfer chatter</button><button onclick="home75Set('A new chain narrative will lead crypto timelines')">Chain narrative</button></div>`;
}

function home75ProofRowHtml() {
  return `<section class="home75-proof-row"><div class="home75-proof-card"><div><span class="home75-kicker"><i class="home75-dot"></i> Creator fees</span><h3>Earn when it trades.</h3></div><p>Create market, bring traders in, and earn fees as volume grows.</p><div class="home75-actions"><button class="primary" onclick="home75Start()">Start with a thesis</button><button class="btn" onclick="showView('boards')">See EdgeBoard</button></div></div><aside class="home75-earn-live" aria-label="Creator fee preview"><div class="home75-earn-live-head"><span class="home75-tag">Creator share</span><h4>Up to 1%</h4></div><div class="home75-earn-flow"><div class="home75-earn-orb"><span></span><i></i></div><div class="home75-earn-line"><i></i><i></i><i></i></div><div class="home75-earn-deposit"><b>$6,800</b><span>earned</span></div></div><div class="home75-earn-live-meta"><div><span>Trading volume</span><b>$680K</b></div><div><span>Creator share</span><b>Half of trading fees</b></div><div><span>Claim status</span><b>Ready</b></div></div></aside></section>`;
}

function home75IntelRowHtml() {
  return `<section class="home75-intel-row"><article class="home75-intel-card"><div><span class="home75-kicker"><i class="home75-dot"></i> ProofFlow</span><h3>Native markets settle with ProofFlow.</h3></div><p>Locked rules first. If a result is challenged, the market moves through review and finishes with a Settlement Receipt.</p><div class="home75-proof-visual" aria-hidden="true"><div class="home75-proof-cinema"><div class="home75-proof-track"><div class="home75-proof-node"><i>1</i><b>Rules locked</b><span>Source, time and outcome rules are fixed.</span></div><div class="home75-proof-node"><i>2</i><b>Proposal</b><span>Outcome is proposed after the market closes.</span></div><div class="home75-proof-node"><i>3</i><b>Review</b><span>Challenges move the market into review.</span></div><div class="home75-proof-node"><i>4</i><b>Receipt</b><span>Final settlement becomes public.</span></div></div><div class="home75-proof-receipt"><div><span>Settlement Receipt</span><b>Ride &middot; Fade &middot; Invalid</b><i></i><i></i><i></i></div><span>Finalized</span></div></div><div class="home75-proof-outcomes"><span class="home75-proof-chip"><i></i>Ride</span><span class="home75-proof-chip"><i></i>Fade</span><span class="home75-proof-chip"><i></i>Invalid</span></div></div><div class="home75-actions"><button class="primary" onclick="showView('proofflow')">View ProofFlow</button><button class="btn" onclick="showView('narratives')">Browse native markets</button></div></article><article class="home75-intel-card"><div><span class="home75-kicker"><i class="home75-dot"></i> Agent launch</span><h3>Agents can launch markets via Nex CLI or API.</h3></div><p>Humans launch from the web. Agents launch with agent .id through API or CLI, then follow the same native market path.</p><div class="home75-agent-visual" aria-hidden="true"><div class="home75-agent-link l1"><i></i></div><div class="home75-agent-link l2"><i></i></div><div class="home75-agent-link l3"><i></i></div><div class="home75-agent-link out"><i></i></div><div class="home75-agent-source human"><b>Web</b><span>Human</span></div><div class="home75-agent-source api"><b>API</b><span>Agent</span></div><div class="home75-agent-source cli"><b>CLI</b><span>Agent</span></div><div class="home75-agent-core"><b>.id</b><span>Launch key</span></div><div class="home75-agent-idchip">agent.id required</div><div class="home75-agent-market"><div><span>Native market</span><b>Market open</b><p>Identity checked. Rules locked. Launch confirmed.</p><div class="home75-agent-market-lines"><i></i><i></i><i></i></div></div><div class="home75-agent-status"><span>Identity checked</span><span>Rules locked</span><span>Live</span></div></div></div><div class="home75-fact-row"><div class="home75-fact"><span>Required</span><b>Agent .id first</b></div><div class="home75-fact"><span>Launch paths</span><b>Web, API and CLI</b></div><div class="home75-fact"><span>Settlement</span><b>Same ProofFlow steps</b></div></div><div class="home75-actions"><button class="primary" onclick="showView('points')">Explore agents</button><button class="btn" onclick="showView('mint')">Mint .id</button></div></article></section>`;
}

function home75EdgeBoardSectionHtml() {
  return `<section class="home75-section"><div class="home75-section-head"><div><span class="home75-kicker"><i class="home75-dot"></i> EdgeBoard</span><h2>Rise when your trades hit.</h2></div><p>Valid launches, trades and settled receipts can raise your rank.</p></div><div class="home75-edge-visual-grid"><article class="home75-edge-visual home75-edge-v-rank" onclick="showView('boards')" aria-label="Open EdgeBoard"><div class="home75-v-rank-stage"><span class="home75-v-rank-main">#3</span><span class="home75-v-rank-move">+18</span><div class="home75-v-ladder"><i></i><i></i><i></i><i></i></div><svg class="home75-v-path" viewBox="0 0 260 120"><path d="M16 96 C 64 86, 75 54, 116 62 S 175 34, 244 20"/><circle cx="244" cy="20" r="5"/></svg></div></article><article class="home75-edge-visual home75-edge-v-card" onclick="home80OpenDashboard()" aria-label="Open Dashboard"><div class="home75-v-card-stack"><div class="home75-v-card-shadow"></div><div class="home75-v-card-face"><div class="home75-v-card-brand"><i></i><span></span></div><b>#15</b><div class="home75-v-card-lines"><i></i><i></i><i></i></div><div class="home75-v-card-stats"><span></span><span></span><span></span></div></div></div></article><article class="home75-edge-visual home75-edge-v-record" onclick="showView('launch')" aria-label="Open Launch"><div class="home75-v-orbit"><span></span><span></span><span></span><span></span><div class="home75-v-core"><i></i></div><div class="home75-v-ring one"></div><div class="home75-v-ring two"></div></div></article></div></section>`;
}

function copiedHomeHtml(hero: HomeHero) {
  return `<section class="home75"><section class="home75-hero"><div class="home75-left"><div class="home75-copy"><span class="home75-kicker"><i class="home75-dot"></i> Trade it or launch any narrative</span><h1>Have a thesis? Make it a market.</h1><p class="home75-lead">Start with a belief. If a market already exists, trade it. If it does not, launch yours natively and earn from trading fees.</p><div class="home75-actions"><button class="primary" onclick="showView('launch')">Create market</button><button class="btn" onclick="showView('narratives')">Browse markets</button></div></div><div class="home75-route"><div class="home75-route-top"><b id="home75RouteTitle">Start with a thesis</b><span id="home75RouteDesc">Describe the belief traders should take a side on.</span></div><div class="home75-input-row"><input id="home75Input" value="" placeholder="Example: A new narrative leads crypto timelines this week" oninput="home75Typing(this.value)"><button class="primary" onclick="home75Start()">Draft market</button></div>${home75SampleHtml()}<div class="home75-path"><div class="home75-path-card active" data-step="1"><span>1</span><b>Type the thesis</b><p>Say what traders should take a side on.</p></div><div class="home75-path-card " data-step="2"><span>2</span><b>Draft market</b><p>We structure the market draft.</p></div><div class="home75-path-card " data-step="3"><span>3</span><b>Launch the market</b><p class="home75-one-line">Locked rules, fixed stake.</p></div></div></div></div><aside class="home75-right"><div id="home75HeroSlot">${home75HeroCard(hero)}</div><div class="home75-side-note"><h3>If it is missing, you can make it real.</h3><p>Native creators earn half of trading fees, up to 1% of trade value.</p></div></aside></section>${home75ProofRowHtml()}${home75IntelRowHtml()}${home75EdgeBoardSectionHtml()}<div class="home75-mobile-cta"><button class="btn" onclick="showView('narratives')">Browse</button><button class="primary" onclick="home75Start()">Prepare</button></div></section>`;
}

function routeForView(view: string) {
  const routes: Record<string, string> = {
    home: "/",
    narratives: "/markets",
    markets: "/markets",
    launch: "/launch",
    boards: "/edgeboard",
    edgeboard: "/edgeboard",
    proofflow: "/proofops",
    proofops: "/proofops",
    points: "/points",
    dashboard: "/dashboard",
    mint: "/mint"
  };

  return routes[view] ?? "/";
}

function updateRouteText(value: string) {
  const has = value.trim().length > 4;
  const title = document.getElementById("home75RouteTitle");
  const desc = document.getElementById("home75RouteDesc");

  if (title) {
    title.textContent = has ? "Ready to launch" : "Start with a thesis";
  }

  if (desc) {
    desc.textContent = has
      ? "We’ll carry this into the launch flow."
      : "Describe the belief you want traders to take a side on.";
  }

  document
    .querySelectorAll('#home .home75-path-card[data-step="2"],#home .home75-path-card[data-step="3"]')
    .forEach((el) => el.classList.toggle("active", has));
}

export function HomePage({
  markets
}: {
  markets: NexMarket[];
}) {
  const router = useRouter();
  const heroes = useMemo(() => buildHeroPool(markets), [markets]);

  useEffect(() => {
    const appWindow = window as HomeWindow;
    let heroIndex = 0;

    appWindow.showView = (view: string) => {
      router.push(routeForView(view));
    };

    appWindow.home75OpenMarket = (marketId: string) => {
      router.push(`/market/${encodeURIComponent(marketId)}`);
    };

    appWindow.home80OpenDashboard = () => {
      router.push("/dashboard");
    };

    appWindow.home75Typing = (value: string) => {
      updateRouteText(value);
    };

    appWindow.home75Set = (value: string) => {
      const input = document.getElementById("home75Input") as HTMLInputElement | null;
      if (input) {
        input.value = value;
        input.focus();
        input.setSelectionRange(value.length, value.length);
      }

      updateRouteText(value);
    };

    appWindow.home75Start = () => {
      const input = document.getElementById("home75Input") as HTMLInputElement | null;
      const thesis = input?.value.trim() ?? "";

      const match = thesis
        ? markets.find((market) => {
            if (market.status === "draft" || market.status === "cancelled_before_trading") {
              return false;
            }

            const haystack = [market.title, market.question, market.arena, market.creatorIdentity]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            return haystack.includes(thesis.toLowerCase());
          })
        : null;

      if (match) {
        router.push(`/market/${encodeURIComponent(match.id)}`);
        return;
      }

      router.push(thesis ? `/launch?thesis=${encodeURIComponent(thesis)}` : "/launch");
    };

    appWindow.home75RotateHero = () => {
      const slot = document.getElementById("home75HeroSlot");
      if (!slot) {
        return;
      }

      heroIndex = (heroIndex + 1) % heroes.length;
      slot.classList.remove("home75-hero-swap");
      void slot.offsetWidth;
      slot.innerHTML = home75HeroCard(heroes[heroIndex]);
      slot.classList.add("home75-hero-swap");
    };

    const timer = window.setInterval(() => appWindow.home75RotateHero?.(), 5200);

    return () => {
      window.clearInterval(timer);
    };
  }, [router, heroes, markets]);

  return (
    <section
      id="home"
      className="view active"
      dangerouslySetInnerHTML={{ __html: copiedHomeHtml(heroes[0]) }}
    />
  );
}
