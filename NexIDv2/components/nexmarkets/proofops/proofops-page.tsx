"use client";

import { type FormEvent, useState } from "react";

const agents = [
  {
    name: "Scout",
    icon: "S",
    role: "Finds broken flows across front end and contracts.",
    checks: [
      "Clicks through mobile and desktop journeys",
      "Captures screenshots, console errors and failed states",
      "Flags blocked cards, duplicate auth and unreadable text"
    ]
  },
  {
    name: "Gate",
    icon: "G",
    role: "Validates what is real before anything becomes confirmed.",
    checks: [
      "Reproduces the issue with exact steps",
      "Labels severity and affected surfaces",
      "Rejects noise, duplicates and non-reproducible claims"
    ]
  },
  {
    name: "Patch",
    icon: "P",
    role: "Prepares the smallest safe fix for confirmed issues.",
    checks: [
      "Explains root cause and affected logic",
      "Drafts a patch without rewriting unrelated flows",
      "Lists regression risks before review"
    ]
  },
  {
    name: "Replay",
    icon: "R",
    role: "Retests the affected journeys across devices and themes.",
    checks: [
      "Runs the original reproduction again",
      "Checks nearby flows for regression",
      "Verifies mobile, desktop, light and dark mode"
    ]
  },
  {
    name: "Ledger",
    icon: "L",
    role: "Turns important fixes into public and internal QA receipts.",
    checks: [
      "Records issue, evidence, fix and replay result",
      "Creates shareable ProofOps receipts for user-facing fixes",
      "Keeps the audit trail for future human review"
    ]
  }
];

const receipts = [
  ["2m", "Mobile market filters", "Replay passed drawer and market cards", "Passed"],
  ["18m", "Mint .id focus check", "Input typing stays continuous while price updates", "Passed"],
  ["42m", "Market order receipt", "Trade card appears only after market orders", "Passed"],
  ["1h", "Contract bond accounting", "Creator bond and fee-path invariant queued", "Queued"]
] as const;

export function ProofOpsPage() {
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState("");
  const agent = agents[active];

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Submitting report...");
    const form = new FormData(event.currentTarget);
    const metadata = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/analytics/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "proofops_issue_reported", metadata })
      });
      if (!response.ok) throw new Error("Report could not be recorded.");
      event.currentTarget.reset();
      setMessage("Report recorded. ProofOps will review the affected flow.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report could not be recorded.");
    }
  }

  return (
    <section id="proofops" className="view active">
      <div className="proofops-shell">
        <div className="po-hero">
          <div className="po-hero-grid">
            <div>
              <div className="eyebrow"><i className="dot" /> ProofOps</div>
              <h1>Every market needs trust. Every fix leaves a receipt.</h1>
              <p>NexMarkets runs an agent-assisted QA and security loop across market creation, trading, receipts, EdgeBoard, dashboard, .id minting, APIs and contracts.</p>
              <div className="hero-ctas">
                <a className="primary" href="#poReport">Submit product/security issue</a>
                <a className="btn" href="#poReceipts">View latest checks</a>
              </div>
            </div>
            <aside className="po-status">
              <div className="po-status-row"><span>Status</span><b><i className="po-pulse" />Running</b></div>
              <div className="po-status-row"><span>Coverage</span><b>Front end + Contracts</b></div>
              <div className="po-status-row"><span>Current run</span><b>Replay: mobile trade flow</b></div>
              <div className="po-status-row"><span>Ship rule</span><b>Human review required</b></div>
            </aside>
          </div>
        </div>

        <div className="po-section">
          <div className="po-intro">
            <div><div className="eyebrow"><i className="dot" /> The loop</div><h2>Scout finds. Gate confirms. Patch prepares. Replay tests. Ledger records.</h2></div>
            <p>AI helps cover more surface area, but no agent gets to find, approve and ship its own fix. Important changes need evidence, reproduction, replay and human review.</p>
          </div>
          <div className="po-loop">
            {agents.map((item, index) => (
              <article className={`po-agent ${index === active ? "active" : ""}`} key={item.name} onClick={() => setActive(index)}>
                <div className="po-agent-icon">{item.icon}</div>
                <h3>{item.name}</h3>
                <p>{item.role}</p>
              </article>
            ))}
          </div>
          <div className="po-detail">
            <div><h3>{agent.name}</h3><p>{agent.role}</p></div>
            <div className="po-checks">
              {agent.checks.map((check) => <div className="po-check" key={check}>{check}</div>)}
            </div>
          </div>
        </div>

        <div className="po-section">
          <div className="po-intro">
            <div><div className="eyebrow"><i className="dot" /> Coverage</div><h2>It watches the full product, not just one page.</h2></div>
            <p>ProofOps is designed around real journeys: people who browse, traders who place orders, creators who launch markets, and power users who care about receipts, .id, dashboards, bots and contract paths.</p>
          </div>
          <div className="po-grid">
            <article className="po-card"><div className="po-agent-icon">T</div><h3>Trading flows</h3><p>Market and limit orders, charts, comments, receipts, order tickets, dashboards and profile links.</p><span className="tag id">Front end</span></article>
            <article className="po-card"><div className="po-agent-icon">N</div><h3>Native launch</h3><p>AI drafts, required fields, source structure, route checks, creator bond, market cards and launch receipts.</p><span className="tag id">Creator flow</span></article>
            <article className="po-card"><div className="po-agent-icon">C</div><h3>Contract paths</h3><p>Bond accounting, settlement states, reward claims, creator fees, referral deductions and EdgeBoard balances.</p><span className="tag id">Contracts</span></article>
          </div>
        </div>

        <div className="po-section" id="poReceipts">
          <div className="po-intro">
            <div><div className="eyebrow"><i className="dot" /> Latest receipts</div><h2>Public proof without exposing sensitive details.</h2></div>
            <p>Important user-facing fixes can get a public QA receipt. Internal receipts keep deeper evidence, logs and patches for the team and future audits.</p>
          </div>
          <div className="po-split">
            <div className="po-feed">
              {receipts.map((receipt) => (
                <div className="po-feed-row" key={receipt[1]}>
                  <time>{receipt[0]}</time>
                  <div><b>{receipt[1]}</b><span>{receipt[2]}</span></div>
                  <span className={`tag ${receipt[3] === "Passed" ? "rider" : "id"}`}>{receipt[3]}</span>
                </div>
              ))}
            </div>
            <div className="po-receipt-card">
              <div><span className="pill">QA Receipt</span><h3>Replay passed.</h3><p>Mobile market search, filter drawer, market detail, order ticket and receipt card checked across light and dark mode.</p></div>
              <div className="inline-actions"><button className="btn" type="button" onClick={() => setMessage("ProofOps receipt link copied.")}>Copy link</button><button className="primary" type="button" onClick={() => setMessage("ProofOps card ready to share.")}>Share card</button></div>
            </div>
          </div>
        </div>

        <div className="po-section" id="poReport">
          <div className="po-intro">
            <div><div className="eyebrow"><i className="dot" /> Report</div><h2>Submit a product or security issue.</h2></div>
            <p>The report is logged as a ProofOps event with your reproduction details. Avoid secrets, private keys, seed phrases or sensitive personal data.</p>
          </div>
          <div className="po-form-grid">
            <form className="po-form-card" onSubmit={submitIssue}>
              <label htmlFor="po-surface">Surface</label>
              <select id="po-surface" name="surface" defaultValue="Trading">
                <option>Trading</option>
                <option>Launch</option>
                <option>Dashboard</option>
                <option>EdgeBoard</option>
                <option>Mint .id</option>
                <option>Contracts</option>
                <option>Security</option>
              </select>
              <label htmlFor="po-severity">Severity</label>
              <select id="po-severity" name="severity" defaultValue="Medium">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
              <label htmlFor="po-title">Title</label>
              <input id="po-title" name="title" required maxLength={120} placeholder="Short issue title" />
              <label htmlFor="po-steps">Reproduction steps</label>
              <textarea id="po-steps" name="steps" required maxLength={900} placeholder="What happened, expected behavior, route, wallet state, device/browser." />
              <button className="primary" type="submit">Submit report</button>
              {message ? <div className="wallet-note">{message}</div> : null}
            </form>
            <aside className="po-submit-note">
              <h3>Permissionless, not careless.</h3>
              <p>ProofOps focuses on product safety, UX breakage, contract correctness and security concerns. It does not decide market outcomes or investigate private motives.</p>
              <div className="po-metric-grid">
                <div className="po-metric"><span>Intake</span><b>Analytics event</b></div>
                <div className="po-metric"><span>Review</span><b>Human required</b></div>
                <div className="po-metric"><span>Replay</span><b>Before ship</b></div>
              </div>
            </aside>
          </div>
          <div className="po-quote">Reports are useful when they include exact steps, affected route and expected behavior.</div>
        </div>
      </div>
    </section>
  );
}
