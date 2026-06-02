"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { marketPriceLabel, marketUiSummary } from "@/components/nexmarkets/market-ui";
import type { BoardEntry } from "@/lib/types/nexid";
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

type EdgePreview = {
  mainRank: string;
  movement: string;
  cardRank: string;
};

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

  return `<div class="home75-live-card"><div><div class="home75-live-head"><span class="home75-tag">${esc(hero.state)} &middot; ${esc(hero.category)}</span><button class="btn" onclick="${openAction}">Browse</button></div><h2>${esc(hero.title)}</h2><p>${esc(hero.summary)}</p></div><div><div class="home75-stats"><div class="home75-stat"><span>Price</span><b>${hero.priceLabel}</b></div><div class="home75-stat"><span>Volume</span><b>${esc(hero.volumeLabel)}</b></div><div class="home75-stat"><span>Route</span><b>${esc(hero.route || "Live")}</b></div></div><div class="home75-card-actions"><button class="primary" onclick="${openAction}">Browse live</button><button class="btn" onclick="showView('launch')">Launch yours</button></div></div></div>`;
}

function sampleLabel(value: string) {
  return value.length > 30 ? `${value.slice(0, 27).trim()}...` : value;
}

function sampleButtonHtml(samples: string[]) {
  if (!samples.length) {
    return `<button onclick="showView('narratives')">Browse live markets</button>`;
  }

  return samples
    .slice(0, 3)
    .map((sample) => `<button onclick="home75Set('${jsSingle(sample)}')">${esc(sampleLabel(sample))}</button>`)
    .join("");
}

function home75ProofRowHtml() {
  return `<section class="home75-proof-row"><div class="home75-proof-card"><div><span class="home75-kicker"><i class="home75-dot"></i> Creator upside</span><h3>Your call can earn.</h3></div><p>Launch a native market, bring traders in and earn from the volume it creates.</p><div class="home75-actions"><button class="primary" onclick="home75Start()">Start with a thesis</button><button class="btn" onclick="showView('boards')">See EdgeBoard</button></div></div><aside class="home75-earn-live" aria-label="Creator fee preview"><div class="home75-earn-live-head"><span class="home75-tag">Creator share</span><h4>From volume</h4></div><div class="home75-earn-flow"><div class="home75-earn-orb"><span></span><i></i></div><div class="home75-earn-line"><i></i><i></i><i></i></div><div class="home75-earn-deposit"><b>$6,800</b><span>earned</span></div></div><div class="home75-earn-live-meta"><div><span>Trading volume</span><b>$680K</b></div><div><span>Trades</span><b>8,420</b></div><div><span>Claim status</span><b>Ready</b></div></div></aside></section>`;
}

function edgePreviewFromBoard(board: BoardEntry[]): EdgePreview {
  const rows = [...board]
    .filter((row) => Number.isFinite(row.rankNumber) && row.rankNumber > 0)
    .sort((a, b) => a.rankNumber - b.rankNumber);
  const leader = rows[0];
  const next = rows[1] ?? rows[0];

  return {
    mainRank: leader?.rank || (leader ? `#${leader.rankNumber}` : "NR"),
    movement: leader?.movement || "Live",
    cardRank: next?.rank || (next ? `#${next.rankNumber}` : "NR")
  };
}

function copiedHomeHtml(hero: HomeHero, samples: string[], edgePreview: EdgePreview) {
  const placeholder = samples[0] ? `Example: ${samples[0]}` : "Search or launch a market thesis";

  return `<section class="home75"><section class="home75-hero"><div class="home75-left"><div class="home75-copy"><span class="home75-kicker"><i class="home75-dot"></i> Trade it or launch it</span><h1>Have a thesis? Make it a market.</h1><p class="home75-lead">Start with a belief. If a market already exists, trade it. If it does not, launch yours and earn from native volume.</p><div class="home75-actions"><button class="primary" onclick="showView('launch')">Launch a market</button><button class="btn" onclick="showView('narratives')">Browse markets</button></div></div><div class="home75-route"><div class="home75-route-top"><b id="home75RouteTitle">Start with a thesis</b><span id="home75RouteDesc">Describe the belief you want traders to take a side on.</span></div><div class="home75-input-row"><input id="home75Input" value="" placeholder="${esc(placeholder)}" oninput="home75Typing(this.value)"><button class="primary" onclick="home75Start()">Prepare market</button></div><div class="home75-samples">${sampleButtonHtml(samples)}</div><div class="home75-path"><div class="home75-path-card active" data-step="1"><span>1</span><b>Type the thesis</b><p>Say what traders should take a side on.</p></div><div class="home75-path-card " data-step="2"><span>2</span><b>Prepare market</b><p>NexMind turns it into a clean draft.</p></div><div class="home75-path-card " data-step="3"><span>3</span><b>Create the route.</b><p class="home75-one-line">Clear rules, fixed stake.</p></div></div></div></div><aside class="home75-right"><div id="home75HeroSlot">${home75HeroCard(hero)}</div><div class="home75-side-note"><h3>If it is missing, you can make it real.</h3><p>Native creators earn 1% of the market volume they bring in.</p></div></aside></section>${home75ProofRowHtml()}<section class="home75-section"><div class="home75-section-head"><div><span class="home75-kicker"><i class="home75-dot"></i> EdgeBoard</span><h2>Climb when your calls move.</h2></div><p>Clean launches, trades and settled receipts can move your rank.</p></div><div class="home75-edge-visual-grid"><article class="home75-edge-visual home75-edge-v-rank" onclick="showView('boards')" aria-label="Open EdgeBoard"><div class="home75-v-rank-stage"><span class="home75-v-rank-main">${esc(edgePreview.mainRank)}</span><span class="home75-v-rank-move">${esc(edgePreview.movement)}</span><div class="home75-v-ladder"><i></i><i></i><i></i><i></i></div><svg class="home75-v-path" viewBox="0 0 260 120"><path d="M16 96 C 64 86, 75 54, 116 62 S 175 34, 244 20"/><circle cx="244" cy="20" r="5"/></svg></div></article><article class="home75-edge-visual home75-edge-v-card" onclick="home80OpenDashboard()" aria-label="Open Dashboard"><div class="home75-v-card-stack"><div class="home75-v-card-shadow"></div><div class="home75-v-card-face"><div class="home75-v-card-brand"><i></i><span></span></div><b>${esc(edgePreview.cardRank)}</b><div class="home75-v-card-lines"><i></i><i></i><i></i></div><div class="home75-v-card-stats"><span></span><span></span><span></span></div></div></div></article><article class="home75-edge-visual home75-edge-v-record" onclick="showView('launch')" aria-label="Open Launch"><div class="home75-v-orbit"><span></span><span></span><span></span><span></span><div class="home75-v-core"><i></i></div><div class="home75-v-ring one"></div><div class="home75-v-ring two"></div></div></article></div></section><div class="home75-mobile-cta"><button class="btn" onclick="showView('narratives')">Browse</button><button class="primary" onclick="home75Start()">Prepare</button></div></section>`;
}

function routeForView(view: string) {
  const routes: Record<string, string> = {
    home: "/",
    narratives: "/markets",
    markets: "/markets",
    launch: "/launch",
    boards: "/edgeboard",
    edgeboard: "/edgeboard",
    proofops: "/proofops",
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
      ? "We'll carry this into the launch flow."
      : "Describe the belief you want traders to take a side on.";
  }

  document
    .querySelectorAll('#home .home75-path-card[data-step="2"],#home .home75-path-card[data-step="3"]')
    .forEach((el) => el.classList.toggle("active", has));
}

export function HomePage({
  markets,
  board
}: {
  markets: NexMarket[];
  board: BoardEntry[];
}) {
  const router = useRouter();
  const heroes = useMemo(() => buildHeroPool(markets), [markets]);
  const sampleTheses = useMemo(() => heroes.filter((hero) => hero.marketId).map((hero) => hero.title), [heroes]);
  const edgePreview = useMemo(() => edgePreviewFromBoard(board), [board]);

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
  }, [router, heroes]);

  return (
    <section
      id="home"
      className="view active"
      dangerouslySetInnerHTML={{ __html: copiedHomeHtml(heroes[0], sampleTheses, edgePreview) }}
    />
  );
}
