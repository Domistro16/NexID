"use client";

import { useState } from "react";
import Link from "next/link";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

const stages = [
  {
    title: "Resolution Card locked",
    kicker: "Before trading",
    desc: "Every native market locks the question, source, deadline, Ride rule, Fade rule, Invalid rule and fallback logic before trading opens. This rule set is immutable.",
    who: "Creator + launch rules",
    public: "Rules locked",
    next: "Trading opens only after the Resolution Card is complete."
  },
  {
    title: "Trading open",
    kicker: "Open market",
    desc: "Ride and Fade trade on the bonding curve. Price records what traders are paying for risk. It does not decide the result.",
    who: "Traders",
    public: "Live market",
    next: "The market stays open until the close time in the Resolution Card."
  },
  {
    title: "Market closes",
    kicker: "Close time reached",
    desc: "Trading stops at the exact close time. The final traded price is stored as market history, not as the final outcome.",
    who: "Protocol clock",
    public: "Closed / awaiting settlement",
    next: "No new positions can be opened after close."
  },
  {
    title: "Outcome proposed",
    kicker: "First settlement action",
    desc: "A settlement proposal applies the locked Resolution Card to public evidence. The proposal states Ride, Fade or Invalid and opens the challenge window.",
    who: "Eligible proposer",
    public: "Outcome proposed",
    next: "If nobody challenges inside the window, the proposal finalizes."
  },
  {
    title: "Challenge period",
    kicker: "Dispute path",
    desc: "A valid challenge moves the market into Evidence Review. The dispute is about applying the locked rules, not rewriting them.",
    who: "Challenger",
    public: "Challenge period open",
    next: "No challenge means the proposal finalizes under the locked rules."
  },
  {
    title: "Evidence Review",
    kicker: "5 Genesis Provers",
    desc: "ProofFlow algorithmically selects five eligible, conflict-free Genesis Provers. They submit independent Evidence Notes before seeing each other's work.",
    who: "Genesis Provers",
    public: "Evidence Review open",
    next: "A clean 4 of 5 agreement can finalize the market."
  },
  {
    title: "Consensus or fresh panel",
    kicker: "Transparent review",
    desc: "If Prover consensus is not reached, or if a serious process issue appears, ProofFlow can select a fresh independent panel to review the evidence again.",
    who: "Fresh Prover panel",
    public: "Additional review required",
    next: "The next panel reviews the same locked Resolution Card from scratch."
  },
  {
    title: "Settlement Receipt",
    kicker: "Resolved",
    desc: "The market finalizes as Ride, Fade or Invalid. The Settlement Receipt records the locked rules, evidence path, Prover consensus, audit summary, outcome and payout result.",
    who: "Protocol + receipt layer",
    public: "Settlement Receipt published",
    next: "Ride wins, Fade wins or Invalid redeems both sides equally."
  }
];

const proverCards = [
  { id: "01", title: "Genesis operators", text: "Genesis Provers are the first operators of the ProofFlow network and are manually onboarded by NexMarkets during Genesis." },
  { id: "02", title: "Conflict-free selection", text: "ProofFlow excludes creators, proposal participants, challenge participants, position holders and linked-wallet conflicts." },
  { id: "03", title: "Independent review", text: "Each Prover reviews the locked Resolution Card and evidence path independently before consensus is calculated." },
  { id: "04", title: "Consensus threshold", text: "The Genesis panel uses a 5 Prover panel with 4 required agreements. These values are internal protocol configuration." },
  { id: "05", title: "Network reputation", text: "Completed settlements, accuracy, responsiveness and clean participation contribute to Prover reputation." }
];

export default function ProofFlowPage() {
  const [stage, setStage] = useState(0);
  const s = stages[stage];

  return (
    <NexidAppShell>
      <section className="proofflow-shell">
        <div className="pfw-hero">
          <div className="pfw-hero-grid">
            <div>
              <div className="eyebrow"><i className="dot" /> ProofFlow</div>
              <h1>The settlement network behind NexMarkets.</h1>
              <p>ProofFlow secures native markets by locking Resolution Cards before trading, selecting Provers for disputed outcomes, and publishing Settlement Receipts after resolution. NexMind audits the process, but outcomes depend on evidence and Prover consensus, not price, creators, moderators or AI.</p>
              <div className="pfw-inline-actions">
                <Link className="primary" href="/markets">Browse markets</Link>
                <Link className="btn" href="/launch">Create market</Link>
              </div>
            </div>
            <aside className="pfw-stat-panel">
              <div className="pfw-chip"><i /><span>Settlement network</span></div>
              <div className="pfw-stat"><span>Native markets</span><b>Secured by ProofFlow</b></div>
              <div className="pfw-stat"><span>Rule source</span><b>Locked Resolution Card</b></div>
              <div className="pfw-stat"><span>Dispute operators</span><b>Genesis Provers</b></div>
              <div className="pfw-stat"><span>Audit layer</span><b>NexMind only audits</b></div>
              <div className="pfw-stat"><span>Public artifact</span><b>Settlement Receipt</b></div>
            </aside>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> Why ProofFlow exists</div>
              <h2>Markets need a settlement network, not hidden discretion.</h2>
            </div>
            <p>Prediction markets only work if traders know how truth will be established before they take risk.</p>
          </div>
          <div className="pfw-lanes">
            <article className="pfw-lane">
              <span className="pill">What ProofFlow avoids</span>
              <h3>No private outcome authority.</h3>
              <p>Native NexMarkets markets should not rely on the creator, a platform moderator, market price, AI output or a hidden administrator to decide the result after money is already at stake.</p>
              <ul>
                <li>Creators cannot decide their own market outcomes.</li>
                <li>Price cannot become truth just because traders moved it.</li>
                <li>NexMind cannot override Prover consensus.</li>
              </ul>
            </article>
            <article className="pfw-lane">
              <span className="pill">What ProofFlow uses</span>
              <h3>Rules, evidence and receipts.</h3>
              <p>ProofFlow settles native markets from locked Resolution Cards, public evidence, decentralized Prover review and transparent Settlement Receipts.</p>
              <ul>
                <li>The rule set is locked before trading begins.</li>
                <li>Disputed outcomes go to conflict-free Provers.</li>
                <li>Every final result leaves a public receipt.</li>
              </ul>
            </article>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> The settlement path</div>
              <h2>Eight stages. One locked rule set.</h2>
            </div>
            <p>Price does not settle markets. ProofFlow settles from the Resolution Card, public evidence, Prover consensus and the final Settlement Receipt.</p>
          </div>
          <div className="pfw-stage-grid">
            {stages.map((x, i) => (
              <article key={i} className={`pfw-stage ${i === stage ? "active" : ""}`} onClick={() => setStage(i)}>
                <div className="pfw-stage-num">{i + 1}</div>
                <h3>{x.title}</h3>
                <p>{x.desc}</p>
                <small>{x.kicker}</small>
              </article>
            ))}
          </div>
          <div className="pfw-stage-detail">
            <div className="pfw-stage-detail-top">
              <div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
              <span className="pfw-chip"><i />{s.kicker}</span>
            </div>
            <div className="pfw-mini-grid">
              <div className="pfw-mini"><span>Who acts here</span><b>{s.who}</b></div>
              <div className="pfw-mini"><span>Public market state</span><b>{s.public}</b></div>
              <div className="pfw-mini"><span>What moves it forward</span><b>{s.next}</b></div>
            </div>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> Native and routed</div>
              <h2>Two market types. One native settlement protocol.</h2>
            </div>
            <p>NexMarkets supports both routed access and native creator-launched markets. ProofFlow powers native settlement.</p>
          </div>
          <div className="pfw-lanes">
            <article className="pfw-lane">
              <span className="pill">Native market</span>
              <h3>Settles with ProofFlow.</h3>
              <p>The market launches with a locked Resolution Card. After close, it follows proposal, challenge, Evidence Review and receipt rules until final settlement is public.</p>
              <ul>
                <li>Source, deadline and payout rules are locked before trading.</li>
                <li>Disputes move into Evidence Review when challenged.</li>
                <li>Ride, Fade or Invalid become the only final results.</li>
              </ul>
            </article>
            <article className="pfw-lane">
              <span className="pill">Existing market</span>
              <h3>Settles on the routed venue.</h3>
              <p>NexMarkets can route access to an external market. In that case, the original venue's market rules and settlement process apply. NexMarkets reflects the routed result where available.</p>
              <ul>
                <li>No ProofFlow panel for routed settlement.</li>
                <li>No native Resolution Card controls the final outcome.</li>
                <li>NexMarkets records routed user activity on this surface.</li>
              </ul>
            </article>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> Resolution Card</div>
              <h2>The market's contract with traders.</h2>
            </div>
            <p>The Resolution Card defines the rules that every later settlement step must follow. Neither creators, Provers nor NexMind can rewrite it after launch.</p>
          </div>
          <div className="pfw-rc-grid">
            <article className="pfw-rc-card">
              <span className="pill">Locked before trading</span>
              <h3>Resolution Card anatomy.</h3>
              <p>Provers do not guess the outcome and NexMind does not invent new rules. ProofFlow asks the network to apply the market's own locked rule card.</p>
              <div className="pfw-rc-list">
                <div className="pfw-rc-item"><span>Market question</span><b>What exact outcome is being traded?</b></div>
                <div className="pfw-rc-item"><span>Primary source</span><b>Which public source decides the result?</b></div>
                <div className="pfw-rc-item"><span>Deadline</span><b>When does trading stop and what timestamp counts?</b></div>
                <div className="pfw-rc-item"><span>Ride / Fade / Invalid</span><b>What must happen for each final state?</b></div>
                <div className="pfw-rc-item"><span>Fallback rule</span><b>What happens if the source is unavailable or fails?</b></div>
              </div>
            </article>
            <div className="pfw-rule-list">
              <div className="pfw-rule">
                <i>1</i>
                <div>
                  <b>Ride wins if</b>
                  <span>The Resolution Card condition is satisfied within the defined source and time window.</span>
                </div>
              </div>
              <div className="pfw-rule">
                <i>2</i>
                <div>
                  <b>Fade wins if</b>
                  <span>The Ride condition is not satisfied by the deadline, or the defined negative condition is explicitly met.</span>
                </div>
              </div>
              <div className="pfw-rule">
                <i>3</i>
                <div>
                  <b>Invalid if</b>
                  <span>The source fails materially, the rules cannot prove truth, or the Resolution Card says the market should void.</span>
                </div>
              </div>
              <div className="pfw-rule">
                <i>4</i>
                <div>
                  <b>Nothing rewrites the card</b>
                  <span>Creators, Provers and NexMind all operate under the same locked instructions traders saw before trading.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> Evidence Review</div>
              <h2>How disputed outcomes are validated.</h2>
            </div>
            <p>During Genesis, disputed native markets go to eligible Genesis Provers. They are the first operators of ProofFlow and are manually onboarded while the network bootstraps.</p>
          </div>
          <div className="pfw-review-grid">
            {proverCards.map((r) => (
              <article key={r.id} className="pfw-reviewer">
                <div className="pfw-icon">{r.id}</div>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </article>
            ))}
          </div>
          <div className="pfw-note" style={{ marginTop: "14px" }}>
            <b>Genesis onboarding is temporary:</b> Genesis determines how the first Provers join the network, not how settlement works. The settlement engine is designed so permissionless Provers can join later without changing the core ProofFlow path.
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> Genesis Phase</div>
              <h2>An intentional launch phase for the network.</h2>
            </div>
            <p>ProofFlow is launching in Genesis so the settlement network can operate with accountable Provers while native market liquidity grows.</p>
          </div>
          <div className="pfw-card-grid">
            <article className="pfw-card">
              <div className="pfw-icon">G</div>
              <h3>Genesis Provers</h3>
              <p>Manually onboarded Provers bootstrap settlement coverage and build the first operating history for the network.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">M</div>
              <h3>Genesis Markets</h3>
              <p>Official NexMarkets markets help bootstrap liquidity. Their Genesis badge never changes how the market settles.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">T</div>
              <h3>Temporary privileges</h3>
              <p>Genesis has configured limits. When the phase ends, native markets continue using the same ProofFlow settlement engine.</p>
            </article>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> Provers Pool</div>
              <h2>How settlement work is compensated.</h2>
            </div>
            <p>Provers are rewarded for protecting settlement integrity across the network. The settlement engine requests rewards from the Provers Pool after settlement is finalized.</p>
          </div>
          <div className="pfw-card-grid">
            <article className="pfw-card">
              <div className="pfw-icon">P</div>
              <h3>Protocol-owned pool</h3>
              <p>The Provers Pool exists to compensate Provers for independent review, consensus participation and clean settlement work.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">G</div>
              <h3>Genesis funding</h3>
              <p>During Genesis, NexMarkets funds the pool to bootstrap the network and make disputed settlement work economically viable.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">R</div>
              <h3>Reward source agnostic</h3>
              <p>ProofFlow does not depend on where rewards originate. The pool can later receive protocol-approved funding without changing settlement logic.</p>
            </article>
          </div>
          <div className="pfw-note" style={{ marginTop: "14px" }}>
            <b>Reward rules are configurable:</b> Base settlement rewards, allocation rules and future funding sources belong to the Provers Pool layer. The settlement engine only finalizes outcomes and asks the pool to reward the selected Provers.
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> NexMind's role</div>
              <h2>NexMind audits the process. It never decides outcomes.</h2>
            </div>
            <p>NexMind is an auditing and transparency layer. It checks process integrity, evidence consistency and receipt quality, but it never overrides Prover consensus.</p>
          </div>
          <div className="pfw-card-grid">
            <article className="pfw-card">
              <div className="pfw-icon">A</div>
              <h3>What it checks</h3>
              <p>Timestamp integrity, locked Resolution Cards, evidence consistency, source alignment, failed reveals and material contradictions.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">S</div>
              <h3>What it produces</h3>
              <p>Audit summaries, inconsistency flags and transparency notes that help users understand how the settlement record was formed.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">N</div>
              <h3>What it cannot do</h3>
              <p>NexMind does not decide market outcomes, rewrite Resolution Cards, replace Provers or settle a market by itself.</p>
            </article>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> Final outcomes</div>
              <h2>The only three settlement results.</h2>
            </div>
            <p>Native markets end in one of three states. ProofFlow makes those states evidence-backed and readable from the final receipt.</p>
          </div>
          <div className="pfw-metric-row">
            <div className="pfw-metric"><span>Ride</span><b>Ride shares redeem at $1</b></div>
            <div className="pfw-metric"><span>Fade</span><b>Fade shares redeem at $1</b></div>
            <div className="pfw-metric"><span>Invalid</span><b>Ride and Fade redeem equally</b></div>
            <div className="pfw-metric"><span>Receipt</span><b>Result is published with the rule path used</b></div>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> Settlement Receipt</div>
              <h2>The public proof of settlement.</h2>
            </div>
            <p>The Settlement Receipt is the permanent public record of how a native market reached its final result.</p>
          </div>
          <div className="pfw-card-grid">
            <article className="pfw-card">
              <div className="pfw-icon">R</div>
              <h3>Locked rules</h3>
              <p>Market question, source, timestamp window, outcome conditions, fallback logic and whether the market was native or routed.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">C</div>
              <h3>Consensus path</h3>
              <p>Evidence path, Prover panel, agreement result, audit summary and whether additional review was required.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">$</div>
              <h3>Outcome and payout</h3>
              <p>Final result, payout state, redemption treatment and receipt-level metadata needed to verify the settlement trail.</p>
            </article>
          </div>
          <div className="pfw-quote">
            <b>The curve prices belief. ProofFlow settles truth.</b>
            <p>That is the core distinction for native NexMarkets settlement. Markets can move, narratives can change and disputes can happen, but the final result stays anchored to locked rules, public evidence and Prover consensus.</p>
            <div className="pfw-inline-actions">
              <Link className="btn" href="/markets">Open a live market</Link>
              <Link className="primary" href="/launch">Draft a native market</Link>
            </div>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> The future of ProofFlow</div>
              <h2>ProofFlow becomes more decentralized over time.</h2>
            </div>
            <p>Genesis is the first operating phase. The settlement engine is structured so onboarding can evolve without rewriting how markets settle.</p>
          </div>
          <div className="pfw-metric-row">
            <div className="pfw-metric"><span>Phase 1</span><b>Genesis</b></div>
            <div className="pfw-metric"><span>Phase 2</span><b>Permissionless Provers</b></div>
            <div className="pfw-metric"><span>Phase 3</span><b>Decentralized settlement network</b></div>
            <div className="pfw-metric"><span>Constant</span><b>Rules, evidence and receipts</b></div>
          </div>
        </div>
      </section>
    </NexidAppShell>
  );
}
