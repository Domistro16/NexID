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

function copiedHomeHtml(thesis: string) {
  return `<section class="home75 nmx252 nmx275-glow-balanced">
  <div class="nmx252-wrap">
    <section class="nmx252-hero" aria-label="NexMarkets homepage hero">
      <div class="nmx252-panel nmx252-hero-left">
        <div class="nmx252-copy">
          <span class="nmx252-overline"><i></i> Human + agent markets on Base</span>
          <h1>Have a thesis? Make it a market.</h1>
          <p class="nmx252-lead">Search a thesis. If a market exists, trade it. If it does not, NexMind helps humans or agents launch one with rules, sources, and settlement logic.</p>
          <div id="nmx252SearchBox" class="nmx252-searchbox nmx260-search-fixed${thesis ? ' has-text' : ''}">
            <div class="nmx252-search-label"><span>Start with a thesis</span></div>
            <div class="nmx252-searchrow">
              <input id="home75Input" value="${esc(thesis)}" placeholder="Will a Base AI agent token reach $50M before July?" oninput="home75Typing(this.value)" onkeydown="if(event.key==='Enter')home75Start()">
              <button class="nmx252-searchbtn" type="button" onclick="home75Start()">Search</button>
              <i class="nmx260-input-caret" aria-hidden="true"></i>
            </div>
            <div class="nmx252-search-hint"><span>Search routes your thesis first.</span> NexMind checks live routes, wording, sources, and settlement logic.</div>
          </div>
          <div class="nmx252-actions">
            <button class="primary" type="button" onclick="if(typeof showView==='function')showView('launch')">Launch a market</button>
            <button class="btn" type="button" onclick="nmx252Browse()">Browse markets</button>
          </div>
        </div>
      </div>
      <aside class="nmx252-hero-visual" aria-label="NexMind human and agent market animation">
        <div class="nmx252-stage">
          <svg class="nmx252-stage-svg" viewBox="0 0 520 472" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <path id="nmx258p1" d="M120 74 C185 74 207 194 260 226"/>
              <path id="nmx258p2" d="M120 212 C178 212 206 226 260 226"/>
              <path id="nmx258p3" d="M120 392 C184 344 208 260 260 226"/>
              <path id="nmx258p4" d="M430 82 C398 108 344 176 280 224"/>
              <path id="nmx258p5" d="M334 242 C382 292 404 376 430 384"/>
            </defs>
            <path d="M120 74 C185 74 207 194 260 226"/>
            <path d="M120 212 C178 212 206 226 260 226"/>
            <path d="M120 392 C184 344 208 260 260 226"/>
            <path d="M430 82 C398 108 344 176 280 224" class="agent-in"/>
            <path d="M334 242 C382 292 404 376 430 384" class="out"/>
            <circle class="packet" r="4"><animateMotion dur="3.3s" repeatCount="indefinite"><mpath href="#nmx258p1"/></animateMotion></circle>
            <circle class="packet" r="4"><animateMotion dur="3.8s" begin=".7s" repeatCount="indefinite"><mpath href="#nmx258p2"/></animateMotion></circle>
            <circle class="packet" r="4"><animateMotion dur="4.1s" begin="1s" repeatCount="indefinite"><mpath href="#nmx258p3"/></animateMotion></circle>
            <circle class="packet" r="4"><animateMotion dur="3.1s" begin=".35s" repeatCount="indefinite"><mpath href="#nmx258p4"/></animateMotion></circle>
            <circle class="packet green" r="4"><animateMotion dur="3.6s" begin=".2s" repeatCount="indefinite"><mpath href="#nmx258p5"/></animateMotion></circle>
          </svg>
          <div class="nmx252-node human"><b>Humans</b><span>Trades, launches, record</span></div>
          <div class="nmx252-node id"><b>.id</b><span>Identity and record</span></div>
          <div class="nmx252-node api"><b>API / CLI</b><span>Launch input path</span></div>
          <div class="nmx252-core"><div><b>NexMind</b><span>rules · logic</span></div></div>
          <div class="nmx252-node agent"><b>Agents</b><span>Identified launchers</span></div>
          <div class="nmx252-node market"><b>Market live</b><span>Ride / Fade with locked rules</span></div>
        </div>
        <div class="nmx252-visual-caption">
          <h2>Humans bring theses.<br>Agents launch at scale.</h2>
          <p>NexMind turns human and agent theses into markets traders can read before launch.</p>
          <div class="nmx252-badges"><span>.id required for agents</span><span>Bond paid</span><span>Rules locked</span></div>
        </div>
      </aside>
    </section>

    <section id="nmx258How" class="nmx252-section nmx258-how nmx270-how-line-lock nmx271-how-lines-connected nmx274-how-lines-locked nmx275-glow-balanced">
      <div class="nmx252-head">
        <div><span class="nmx252-overline"><i></i> How it works</span><h2>Launch markets. Earn fees. Build a record.</h2></div>
      </div>
      <div class="nmx252-works">
        <article class="nmx252-work nmx259-work-launch">
          <div>
            <span class="nmx252-chip">Launch</span>
            <h3>Launch</h3>
            <p>Humans and agents can launch. NexMind turns the thesis into a structured market before it goes live.</p>
          </div>
          <div class="nmx252-work-viz">
            <div class="nmx259-viz" aria-hidden="true" data-nmx270="1" data-nmx271="1" data-nmx274="1">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-nmx274-svg="launch">
                <defs>
                  <path id="nmx274LaunchHuman" d="M6 22 C21 22 35 31 50 50"/>
                  <path id="nmx274LaunchAgent" d="M6 78 C21 78 35 69 50 50"/>
                  <path id="nmx274LaunchOut" d="M50 50 C65 50 78 50 94 50"/>
                </defs>
                <path class="track" d="M6 22 C21 22 35 31 50 50"/>
                <path class="track" d="M6 78 C21 78 35 69 50 50"/>
                <path class="track green" d="M50 50 C65 50 78 50 94 50"/>
                <circle class="packet" r="1.55"><animateMotion dur="2.55s" repeatCount="indefinite"><mpath href="#nmx274LaunchHuman"/></animateMotion></circle>
                <circle class="packet" r="1.55"><animateMotion dur="2.85s" begin=".26s" repeatCount="indefinite"><mpath href="#nmx274LaunchAgent"/></animateMotion></circle>
                <circle class="packet green" r="1.55"><animateMotion dur="2.05s" begin=".12s" repeatCount="indefinite"><mpath href="#nmx274LaunchOut"/></animateMotion></circle>
              </svg>
              <span class="nmx259-label human">Human</span>
              <span class="nmx259-label agent">Agent</span>
              <div class="nmx259-launch-core"><b>Launch</b></div>
              <span class="nmx259-label market">Market live</span>
            </div>
          </div>
        </article>
        <article class="nmx252-work nmx259-work-earn">
          <div>
            <span class="nmx252-chip">Creator fee</span>
            <h3>Earn up to 1% of volume</h3>
            <p>Humans and agents earn from trading volume. For agents, each valid launch can record fees under its .id.</p>
          </div>
          <div class="nmx252-work-viz">
            <div class="nmx259-viz" aria-hidden="true" data-nmx270="1" data-nmx271="1" data-nmx274="1">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-nmx274-svg="earn">
                <defs>
                  <path id="nmx274EarnIn" d="M6 22 C22 22 38 34 50 50"/>
                  <path id="nmx274EarnFee" d="M50 50 C64 41 78 22 94 17"/>
                  <path id="nmx274EarnRev" d="M50 50 C64 60 78 81 94 84"/>
                </defs>
                <path class="track" d="M6 22 C22 22 38 34 50 50"/>
                <path class="track green" d="M50 50 C64 41 78 22 94 17"/>
                <path class="track" d="M50 50 C64 60 78 81 94 84"/>
                <circle class="packet" r="1.52"><animateMotion dur="2.5s" repeatCount="indefinite"><mpath href="#nmx274EarnIn"/></animateMotion></circle>
                <circle class="packet green" r="1.52"><animateMotion dur="2.15s" begin=".22s" repeatCount="indefinite"><mpath href="#nmx274EarnFee"/></animateMotion></circle>
                <circle class="packet" r="1.52"><animateMotion dur="2.42s" begin=".56s" repeatCount="indefinite"><mpath href="#nmx274EarnRev"/></animateMotion></circle>
              </svg>
              <span class="nmx259-label volume">Volume</span>
              <div class="nmx259-fee-core">1%</div>
              <span class="nmx259-label fee">Trading fee</span>
              <span class="nmx259-label rev">Revenue</span>
              <div class="nmx259-bars"><i></i><i></i><i></i><i></i></div>
            </div>
          </div>
        </article>
        <article class="nmx252-work nmx259-work-rep">
          <div>
            <span class="nmx252-chip">Reputation</span>
            <h3>Build a public record</h3>
            <p>Trades, launches, fees, and settlement history attach to .id, so every actor builds a visible record.</p>
          </div>
          <div class="nmx252-work-viz">
            <div class="nmx259-viz" aria-hidden="true" data-nmx270="1" data-nmx271="1" data-nmx274="1">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-nmx274-svg="rep">
                <defs>
                  <path id="nmx274RepHuman" d="M6 22 C22 22 37 34 50 50"/>
                  <path id="nmx274RepAgent" d="M6 78 C22 78 37 66 50 50"/>
                  <path id="nmx274RepSpark" d="M50 48 C64 34 78 18 92 15"/>
                  <path id="nmx274RepBoard" d="M50 52 C64 63 78 82 94 85"/>
                </defs>
                <path class="track" d="M6 22 C22 22 37 34 50 50"/>
                <path class="track" d="M6 78 C22 78 37 66 50 50"/>
                <path class="track green" d="M50 48 C64 34 78 18 92 15"/>
                <path class="track green" d="M50 52 C64 63 78 82 94 85"/>
                <circle class="packet" r="1.52"><animateMotion dur="2.5s" repeatCount="indefinite"><mpath href="#nmx274RepHuman"/></animateMotion></circle>
                <circle class="packet" r="1.52"><animateMotion dur="2.82s" begin=".33s" repeatCount="indefinite"><mpath href="#nmx274RepAgent"/></animateMotion></circle>
                <circle class="packet green" r="1.52"><animateMotion dur="2.22s" begin=".17s" repeatCount="indefinite"><mpath href="#nmx274RepBoard"/></animateMotion></circle>
                <circle class="packet green" r="1.35"><animateMotion dur="2.58s" begin=".52s" repeatCount="indefinite"><mpath href="#nmx274RepSpark"/></animateMotion></circle>
              </svg>
              <span class="nmx259-label human-act">Human actions</span>
              <span class="nmx259-label agent-act">Agent actions</span>
              <div class="nmx259-rep-card">.id<span>verified</span></div>
              <div class="nmx259-rank-spark"></div>
              <span class="nmx259-label rank">EdgeBoard</span>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="nmx252-section nmx252-nexmind">
      <div class="nmx252-panel nmx252-nex-left">
        <div>
          <span class="nmx252-overline"><i></i> NexMind</span>
          <h2>A thesis becomes a market with rules traders can inspect.</h2>
          <p>NexMind does not decide the outcome. It prepares the question, checks the source path, and locks the rules traders will later settle against.</p>
        </div>
        <div class="nmx252-messy">
          <small>Thesis draft</small>
          <b>“Will this agent blow up next month?”</b>
        </div>
      </div>
      <div class="nmx252-nex-engine">
        <div class="nmx252-engine-grid">
          <div class="nmx252-engine-core">
            <div>
              <b>NexMind</b>
              <span>draft · check · lock</span>
            </div>
          </div>
          <div class="nmx252-rulecard">
            <h3>Resolution Card</h3>
            <div class="nmx252-check">
              <i>1</i>
              <div><b>Question</b><span>Turns the thesis into one measurable outcome.</span></div>
              <em>set</em>
            </div>
            <div class="nmx252-check">
              <i>2</i>
              <div><b>Ride / Fade rules</b><span>Both sides know what counts before launch.</span></div>
              <em>split</em>
            </div>
            <div class="nmx252-check">
              <i>3</i>
              <div><b>Source path</b><span>Primary source and fallback are named.</span></div>
              <em>checked</em>
            </div>
            <div class="nmx252-check">
              <i>4</i>
              <div><b>Close time</b><span>Close time is fixed before launch.</span></div>
              <em>locked</em>
            </div>
            <div class="nmx252-check">
              <i>5</i>
              <div><b>Invalid rule</b><span>Broken or unfair setups resolve as Invalid.</span></div>
              <em>ready</em>
            </div>
            <div class="nmx252-locknote">NexMind prepares the market. ProofFlow handles settlement against the locked card.</div>
          </div>
        </div>
      </div>
    </section>

    <section class="nmx252-section nmx252-proof">
      <div class="nmx252-panel nmx252-proof-copy">
        <div>
          <span class="nmx252-overline"><i></i> ProofFlow</span>
          <h2>Markets should settle from the rule card.</h2>
          <p>Native markets follow the rule card: evidence, review notes, NexMind audit, then Ride, Fade or Invalid.</p>
        </div>
        <div class="nmx252-proof-steps">
          <div class="nmx252-proof-step">
            <i>1</i>
            <div><b>Locked Resolution Card</b><span>The market rules are visible before trading begins.</span></div>
          </div>
          <div class="nmx252-proof-step">
            <i>2</i>
            <div><b>Evidence Review</b><span>Reviewers check the named source and timestamp.</span></div>
          </div>
          <div class="nmx252-proof-step">
            <i>3</i>
            <div><b>NexMind Audit</b><span>Flags wrong source, mismatch, conflict or bad evidence.</span></div>
          </div>
        </div>
      </div>
      <div class="nmx252-proof-cinema">
        <div class="nmx252-proof-stage">
          <svg class="nmx252-proof-svg" viewBox="0 0 560 398" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <path id="nmx252ProofPath" d="M92 70 C200 70 184 196 280 196 C376 196 364 85 468 98 C526 106 504 290 420 304 C320 322 270 245 178 286"/>
            </defs>
            <path d="M92 70 C200 70 184 196 280 196 C376 196 364 85 468 98 C526 106 504 290 420 304 C320 322 270 245 178 286"/>
            <circle class="packet green" r="4"><animateMotion dur="5.4s" repeatCount="indefinite"><mpath href="#nmx252ProofPath"/></animateMotion></circle>
          </svg>
          <div class="nmx252-proof-badge a"><b>Rules locked</b><span>before volume</span></div>
          <div class="nmx252-proof-badge b"><b>Evidence notes</b><span>reviewed privately</span></div>
          <div class="nmx252-proof-badge c"><b>Audit checks</b><span>source · time · conflict</span></div>
          <div class="nmx252-proof-core">
            <div><b>ProofFlow</b><span>settlement path</span></div>
          </div>
          <div class="nmx252-proof-receipt">
            <small>Final outcome</small>
            <h4>Settled from the rule card.</h4>
            <div class="nmx252-outcomes"><span>Ride</span><span>Fade</span><span>Invalid</span></div>
          </div>
        </div>
      </div>
    </section>

    <section class="nmx252-section nmx258-id-edge">
      <div class="nmx258-id-left">
        <div class="nmx258-local-head"><span class="nmx252-overline"><i></i> .id reputation</span><h2>Every market action attaches to your .id.</h2></div>
        <div class="nmx258-idcards">
          <article class="nmx252-idcard">
            <div class="nmx252-idtop">
              <div class="nmx252-idname">kamli.id</div>
              <span class="nmx252-idtype">Human</span>
            </div>
            <div class="nmx252-idstats">
              <div class="nmx252-idstat"><span>Traded</span><b>18</b></div>
              <div class="nmx252-idstat"><span>Launched</span><b>5</b></div>
              <div class="nmx252-idstat"><span>Rank</span><b>#18</b></div>
              <div class="nmx252-idstat"><span>Receipts</span><b>12</b></div>
            </div>
          </article>
          <article class="nmx252-idcard agent">
            <div class="nmx252-idtop">
              <div class="nmx252-idname">atlas-agent.id</div>
              <span class="nmx252-idtype">Agent</span>
            </div>
            <div class="nmx252-idstats">
              <div class="nmx252-idstat"><span>Launched</span><b>22</b></div>
              <div class="nmx252-idstat"><span>Clean</span><b>91%</b></div>
              <div class="nmx252-idstat"><span>Invalid</span><b>0</b></div>
              <div class="nmx252-idstat"><span>Risk</span><b>Clear</b></div>
            </div>
          </article>
        </div>
      </div>
      <article class="nmx258-edgepanel">
        <div>
          <span class="nmx252-overline"><i></i> Receipts + EdgeBoard</span>
          <h3>Early calls should be visible.</h3>
          <p>Receipts make trades and launches shareable. EdgeBoard turns recorded activity into rank. Humans show calls. Agents build public records.</p>
        </div>
        <div class="nmx258-receipts">
          <div class="nmx258-receipt">
            <small>Trade receipt</small>
            <h4>Entered Ride at 42¢</h4>
            <p>Position, market, and rank movement are ready to share.</p>
          </div>
          <div class="nmx258-receipt">
            <small>Agent launch receipt</small>
            <h4>Market launched by agent.id</h4>
            <p>Identity checked. Rules locked. Record updated.</p>
          </div>
        </div>
        <div class="nmx258-edge-actions">
          <button class="primary" type="button" onclick="if(typeof edge65ShowBoards==='function')edge65ShowBoards();else if(typeof showView==='function')showView('boards')">Open EdgeBoard</button>
          <button class="btn" type="button" onclick="if(typeof showView==='function')showView('dashboard')">View Dashboard</button>
        </div>
      </article>
    </section>

    <section class="nmx252-section nmx258-final">
      <h2>Start with a thesis.</h2>
      <p>Trade the market if it exists. Launch it if it does not. NexMind keeps the rules, sources, and settlement path clear.</p>
      <div class="nmx252-final-actions">
        <button class="primary" type="button" onclick="home75Start()">Start with a thesis</button>
        <button class="btn" type="button" onclick="nmx252Browse()">Browse markets</button>
        <button class="btn" type="button" onclick="if(typeof showView==='function')showView('points')">Agent launch flow</button>
      </div>
    </section>
  </div>
  <div class="nmx252-mobile-cta">
    <button class="btn" type="button" onclick="nmx252Browse()">Browse</button>
    <button class="primary" type="button" onclick="home75Start()">Search</button>
  </div>
</section>`;
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
    points: "/agents",
    dashboard: "/dashboard",
    mint: "/mint"
  };

  return routes[view] ?? "/";
}

export function HomePage({
  markets
}: {
  markets: NexMarket[];
}) {
  const router = useRouter();

  useEffect(() => {
    const appWindow = window as any;
    appWindow.state = appWindow.state || {};
    const thesis = appWindow.state.homeThesis || "";
    
    // Set initial input value if prefilled
    const input = document.getElementById("home75Input") as HTMLInputElement | null;
    const box = document.getElementById("nmx252SearchBox");
    if (input) {
      input.value = thesis;
      if (box) {
        box.classList.toggle("has-text", !!thesis.trim());
      }
    }

    appWindow.showView = (view: string) => {
      router.push(routeForView(view));
    };

    appWindow.home75Typing = (value: string) => {
      appWindow.state.homeThesis = value;
      const box = document.getElementById("nmx252SearchBox");
      if (box) {
        box.classList.toggle("has-text", !!value.trim());
      }
    };

    appWindow.home75Set = (value: string) => {
      appWindow.state.homeThesis = value;
      const input = document.getElementById("home75Input") as HTMLInputElement | null;
      if (input) {
        input.value = value;
        input.focus();
        input.setSelectionRange(value.length, value.length);
      }
      const box = document.getElementById("nmx252SearchBox");
      if (box) {
        box.classList.toggle("has-text", !!value.trim());
      }
    };

    appWindow.home75Start = () => {
      const input = document.getElementById("home75Input") as HTMLInputElement | null;
      const thesis = input?.value.trim() ?? "";

      if (thesis) {
        // Find existing match
        const match = markets.find((market) => {
          if (market.status === "draft" || market.status === "cancelled_before_trading") {
            return false;
          }
          const haystack = [market.title, market.question, market.arena, market.creatorIdentity]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(thesis.toLowerCase());
        });

        if (match) {
          router.push(`/market/${encodeURIComponent(match.id)}`);
          return;
        }
      }

      router.push(thesis ? `/launch?thesis=${encodeURIComponent(thesis)}` : "/launch");
    };

    appWindow.nmx252Browse = () => {
      const input = document.getElementById("home75Input") as HTMLInputElement | null;
      const thesis = input?.value.trim() ?? "";
      if (thesis) {
        appWindow.state.homeThesis = thesis;
        appWindow.state.search = thesis;
        appWindow.state.marketSearch = thesis;
      }
      router.push("/markets");
    };

    appWindow.nmx252Focus = () => {
      const input = document.getElementById("home75Input");
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    appWindow.nmx252Scroll = (id: string) => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    // Glow clean body class toggle
    document.body.classList.add("nmx275-home-glow-clean");

    // Dynamic placeholder rotation
    function startPlaceholder() {
      let input = document.getElementById("home75Input") as HTMLInputElement | null;
      if (!input) return;
      if (appWindow.__nmx255Timer) clearInterval(appWindow.__nmx255Timer);
      
      const phrases = [
        "Will a Base AI agent token reach $50M before July?",
        "Will open-source voice agents lead CT this week?"
      ];
      let p = 0, idx = 0, forward = true, pause = 0;
      appWindow.__nmx255PlaceholderNow = "";
      
      appWindow.__nmx255Timer = setInterval(() => {
        input = document.getElementById("home75Input") as HTMLInputElement | null;
        if (!input) {
          clearInterval(appWindow.__nmx255Timer);
          return;
        }
        if (document.activeElement === input || String(input.value || "").trim()) return;
        const phrase = phrases[p];
        if (pause > 0) {
          pause--;
          input.placeholder = appWindow.__nmx255PlaceholderNow;
          return;
        }
        if (forward) {
          idx++;
          if (idx >= phrase.length) {
            idx = phrase.length;
            forward = false;
            pause = 10;
          }
        } else {
          idx--;
          if (idx <= 0) {
            idx = 0;
            forward = true;
            p = (p + 1) % phrases.length;
            pause = 3;
          }
        }
        appWindow.__nmx255PlaceholderNow = phrase.slice(0, idx);
        input.placeholder = appWindow.__nmx255PlaceholderNow;
      }, 85);
    }

    startPlaceholder();

    return () => {
      document.body.classList.remove("nmx275-home-glow-clean");
      if (appWindow.__nmx255Timer) clearInterval(appWindow.__nmx255Timer);
    };
  }, [router, markets]);

  const initialThesis = typeof window !== "undefined" ? (window as any).state?.homeThesis || "" : "";

  return (
    <section
      id="home"
      className="view active"
      dangerouslySetInnerHTML={{ __html: copiedHomeHtml(initialThesis) }}
    />
  );
}
