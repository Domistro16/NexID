"use client";

import { useState } from "react";
import Link from "next/link";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

const stages = [
  {
    title: "Resolution Card locked",
    kicker: "Before trading",
    desc: "Every native market locks the market question, primary source, deadline, Ride rule, Fade rule, Invalid rule and fallback logic before trading opens.",
    who: "Creator + launch rules",
    public: "Rules locked",
    next: "Trading opens only after the card is complete."
  },
  {
    title: "Trading open",
    kicker: "Open market",
    desc: "Ride and Fade trade on the bonding curve. Price shows what traders are paying. It does not decide the result.",
    who: "Traders",
    public: "Live market",
    next: "The market stays open until the close time in the Resolution Card."
  },
  {
    title: "Market closes",
    kicker: "Close time reached",
    desc: "Trading stops at the exact close time. The last traded price is stored as the final market probability, not the final outcome.",
    who: "Protocol clock",
    public: "Closed · awaiting settlement",
    next: "No new positions can be opened after close."
  },
  {
    title: "Outcome proposed",
    kicker: "First settlement action",
    desc: "A settlement proposal is made from the locked Resolution Card and public evidence. The proposal states Ride, Fade or Invalid and opens the challenge window.",
    who: "Eligible proposer",
    public: "Outcome proposed",
    next: "If nobody challenges inside the window, the proposal finalizes."
  },
  {
    title: "Challenge period",
    kicker: "Dispute path",
    desc: "Any valid challenger can dispute the proposal by posting the challenge bond. A valid challenge moves the market into Evidence Review.",
    who: "Challenger",
    public: "Challenge period open",
    next: "No challenge means the proposal finalizes under the locked rules."
  },
  {
    title: "Evidence Review",
    kicker: "5 Genesis Provers",
    desc: "Five eligible, conflict-free Genesis Provers are selected algorithmically. They submit private independent Evidence Notes and do not see each other's work before submission.",
    who: "Genesis Provers",
    public: "Evidence Review open",
    next: "A clean 4 of 5 agreement can finalize the market."
  },
  {
    title: "Second review if needed",
    kicker: "Fresh panel",
    desc: "If agreement fails or a serious issue appears, a new independent panel is selected. It reviews the market from scratch.",
    who: "Fresh Prover panel",
    public: "Additional review required",
    next: "This is a new independent review, not a correction class."
  },
  {
    title: "Final settlement receipt",
    kicker: "Resolved",
    desc: "The market finalizes as Ride, Fade or Invalid. The public Settlement Receipt records the rules used, the source checked, the final outcome and the payout path.",
    who: "Protocol + receipt layer",
    public: "Settlement receipt published",
    next: "Ride wins, Fade wins or Invalid redeems both sides equally."
  }
];

const reviewerCards = [
  { id: "01", title: "Genesis onboarded", text: "Genesis Prover access is manually issued by NexMarkets during the bootstrap phase." },
  { id: "02", title: "Conflict-free", text: "No market position, no creator link, no proposer/challenger role and no linked-wallet conflict." },
  { id: "03", title: "Private notes", text: "Each Prover submits an independent Evidence Note before seeing anonymized summaries." },
  { id: "04", title: "4 of 5 threshold", text: "A clean 4/5 agreement with no serious issue can finalize the market." },
  { id: "05", title: "Top note bonus", text: "Aligned Provers share the Provers Pool allocation. The strongest Evidence Note can receive the note bonus." }
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
              <h1>How native markets are settled.</h1>
              <p>ProofFlow is the settlement network behind native NexMarkets markets. It locks the Resolution Card before trading, follows proposal, challenge and Prover review steps after close, and settles only from the locked rules, evidence, and Prover consensus.</p>
              <div className="pfw-inline-actions">
                <Link className="primary" href="/markets">Browse markets</Link>
                <Link className="btn" href="/launch">Create market</Link>
              </div>
            </div>
            <aside className="pfw-stat-panel">
              <div className="pfw-chip"><i /><span>Staged settlement</span></div>
              <div className="pfw-stat"><span>Native markets</span><b>ProofFlow</b></div>
              <div className="pfw-stat"><span>Prover panel</span><b>5 Genesis Provers</b></div>
              <div className="pfw-stat"><span>Confidence rule</span><b>4 of 5 clean agreement</b></div>
              <div className="pfw-stat"><span>Final outcomes</span><b>Ride · Fade · Invalid</b></div>
              <div className="pfw-stat"><span>Public artifact</span><b>Settlement Receipt</b></div>
            </aside>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> The settlement path</div>
              <h2>Eight stages. One locked rule set.</h2>
            </div>
            <p>Price does not settle markets. They settle from the Resolution Card, public evidence and the review steps below.</p>
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
              <h2>Two market types. Two settlement processes.</h2>
            </div>
            <p>NexMarkets supports both routed access and native creator-launched markets. Only native markets use ProofFlow.</p>
          </div>
          <div className="pfw-lanes">
            <article className="pfw-lane">
              <span className="pill">Native market</span>
              <h3>Settles with ProofFlow.</h3>
              <p>The market launches with a locked Resolution Card. After close, it follows proposal, challenge and Evidence Review rules until a final Settlement Receipt is published.</p>
              <ul>
                <li>Source, deadline and payout rules are locked before trading.</li>
                <li>Disputes move into Evidence Review when challenged.</li>
                <li>Ride, Fade or Invalid become the final results.</li>
              </ul>
            </article>
            <article className="pfw-lane">
              <span className="pill">Existing market</span>
              <h3>Settles on the routed venue.</h3>
              <p>NexMarkets can route access to an external market. In that case, the original venue’s market rules and settlement process apply. NexMarkets reflects the routed result where available.</p>
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
              <h2>The rule card behind every market.</h2>
            </div>
            <p>The Resolution Card is the contract of the market. It defines what counts as Ride, what counts as Fade, when the market closes, what source decides it and what makes the market Invalid.</p>
          </div>
          <div className="pfw-rc-grid">
            <article className="pfw-rc-card">
              <span className="pill">Locked before trading</span>
              <h3>Resolution Card anatomy.</h3>
              <p>Provers do not guess the outcome. ProofFlow asks them to apply the market's own locked rule card.</p>
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
                  <b>Price does not settle the market</b>
                  <span>Bonding-curve price tracks belief. Settlement comes only from the locked card and evidence.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> Evidence Review</div>
              <h2>Who reviews disputed markets and what they do.</h2>
            </div>
            <p>During Genesis, disputed markets go to eligible, conflict-free Genesis Provers who work privately first and publish only the final result.</p>
          </div>
          <div className="pfw-review-grid">
            {reviewerCards.map((r) => (
              <article key={r.id} className="pfw-reviewer">
                <div className="pfw-icon">{r.id}</div>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </article>
            ))}
          </div>
          <div className="pfw-note" style={{ marginTop: "14px" }}>
            <b>Public wording when a second panel is needed:</b> Additional review required. A fresh Prover panel is checking the evidence before final settlement.
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> Prover economics</div>
              <h2>How Provers earn.</h2>
            </div>
            <p>Provers are paid for careful settlement work, not dispute spam. Rewards come from the Provers Pool, while reputation rewards recognize timely and reasonable participation.</p>
          </div>
          <div className="pfw-card-grid">
            <article className="pfw-card">
              <div className="pfw-icon">80</div>
              <h3>Aligned Provers</h3>
              <p>80% of the configured settlement reward goes to Provers aligned with the final outcome when their work is complete and clean.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">20</div>
              <h3>Top note bonus</h3>
              <p>20% of the configured settlement reward goes to the strongest Evidence Note, judged on source use, clarity and rule alignment.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">⊘</div>
              <h3>Reasonable minority</h3>
              <p>A reasonable minority Prover can receive reputation credit and no penalty, even when they do not receive monetary reward.</p>
            </article>
          </div>
          <div className="pfw-note" style={{ marginTop: "14px" }}>
            <b>Second panel rule:</b> The first panel does not automatically receive monetary rewards when a new independent panel is triggered. Clear Prover mistakes can mean no payout. Reasonable but inconclusive work can still receive reputation credit.
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> NexMind’s role</div>
              <h2>What NexMind does, and what it does not do.</h2>
            </div>
            <p>NexMind audits the review process. It cross-checks evidence quality and review integrity, but it never overrides Prover consensus.</p>
          </div>
          <div className="pfw-card-grid">
            <article className="pfw-card">
              <div className="pfw-icon">✓</div>
              <h3>What it checks</h3>
              <p>Source alignment, timestamps, contradictions, wrong-source usage, material evidence changes, failed reveals and coordination signals.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">→</div>
              <h3>What it can require</h3>
              <p>Generate audit summaries and flag serious issues for additional review without deciding the market outcome itself.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">×</div>
              <h3>What it does not do</h3>
              <p>It does not invent new rules, override the Resolution Card or settle a market by itself.</p>
            </article>
          </div>
        </div>

        <div className="pfw-section">
          <div className="pfw-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> Final outcomes</div>
              <h2>The only three settlement results.</h2>
            </div>
            <p>Native markets end in one of three states. ProofFlow is designed to make those states clear, evidence-backed and easy to read from the final receipt.</p>
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
              <h2>What the final public receipt shows.</h2>
            </div>
            <p>The Settlement Receipt is the public settlement receipt. It should explain the outcome clearly without turning the market into a argument thread.</p>
          </div>
          <div className="pfw-card-grid">
            <article className="pfw-card">
              <div className="pfw-icon">Q</div>
              <h3>Locked rule summary</h3>
              <p>Market question, source, timestamp window, outcome conditions and whether the market was native or routed.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">E</div>
              <h3>Outcome and evidence</h3>
              <p>Final outcome, the core evidence used, the settlement state path and whether Evidence Review was required.</p>
            </article>
            <article className="pfw-card">
              <div className="pfw-icon">$</div>
              <h3>Payout path</h3>
              <p>How Ride, Fade or Invalid pays out, plus any receipt-level metadata the user needs to trust the result.</p>
            </article>
          </div>
          <div className="pfw-quote">
            <b>The curve prices belief. ProofFlow settles truth.</b>
            <p>That is the core promise of native settlement on NexMarkets. Markets can move, narratives can change and challenges can happen, but the final settlement path stays anchored to the Resolution Card and the evidence it points to.</p>
            <div className="pfw-inline-actions">
              <Link className="btn" href="/markets">Open a live market</Link>
              <Link className="primary" href="/launch">Draft a native market</Link>
            </div>
          </div>
        </div>
      </section>
    </NexidAppShell>
  );
}
