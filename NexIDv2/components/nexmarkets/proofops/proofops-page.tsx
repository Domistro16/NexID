"use client";

import { type FormEvent, useState } from "react";

const agents = [
  {
    name: "Scout",
    icon: "⌕",
    role: "Finds broken pages and contract paths.",
    checks: [
      "Clicks through mobile and desktop journeys",
      "Captures screenshots, console errors and failed states",
      "Flags UX regressions like blocked cards, duplicate auth and unreadable text"
    ]
  },
  {
    name: "Gate",
    icon: "◇",
    role: "Confirms the bug before it is logged.",
    checks: [
      "Reproduces the bug with exact steps",
      "Labels severity and affected surfaces",
      "Rejects noise, duplicates and non-reproducible claims"
    ]
  },
  {
    name: "Patch",
    icon: "✦",
    role: "Prepares the smallest safe fix.",
    checks: [
      "Explains root cause and affected logic",
      "Drafts a patch without rewriting unrelated flows",
      "Lists regression risks before review"
    ]
  },
  {
    name: "Replay",
    icon: "↻",
    role: "Retests the affected pages on mobile, desktop and themes.",
    checks: [
      "Runs the original reproduction again",
      "Checks nearby flows for regression",
      "Verifies mobile, desktop, light and dark mode"
    ]
  },
  {
    name: "Ledger",
    icon: "▣",
    role: "Turns important fixes into QA receipts.",
    checks: [
      "Records issue, evidence, fix and replay result",
      "Creates shareable ProofOps receipts for user-facing fixes",
      "Keeps the audit trail for future human review"
    ]
  }
];

const receipts = [
  ["2m", "Mobile market filters", "Replay passed drawer + market cards", "Passed"],
  ["18m", "Mint .id focus check", "Input typing stays continuous while price updates", "Passed"],
  ["42m", "Market order receipt", "Trade card appears only after market orders", "Passed"],
  ["1h", "Contract bond accounting", "Creator bond and fee-path invariant queued", "Queued"]
] as const;

export function ProofOpsPage() {
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState("");
  const agent = agents[active];

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

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
      setMessage("Product/security issue queued for Gate review. Receipt PO-recorded.");
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
              <h1>Every fix should leave a record.</h1>
              <p>NexMarkets runs AI-supported QA and security checks across pages, trading, launches, receipts, .id, APIs and contracts so bugs are found, fixed and retested before users hit them.</p>
              <div className="hero-ctas">
                <button className="primary" type="button" onClick={() => scrollTo("poReport")}>Submit product/security issue</button>
                <button className="btn" type="button" onClick={() => scrollTo("poReceipts")}>View recent checks</button>
              </div>
            </div>
            <aside className="po-status">
              <div className="po-status-row"><span>Status</span><b><i className="po-pulse" />Running</b></div>
              <div className="po-status-row"><span>Coverage</span><b>Front end + Contracts</b></div>
              <div className="po-status-row"><span>Current check</span><b>Replay: mobile trade flow</b></div>
              <div className="po-status-row"><span>Release rule</span><b>Human review required</b></div>
            </aside>
          </div>
        </div>

        <div className="po-section">
          <div className="po-intro">
            <div>
              <div className="eyebrow"><i className="dot" /> The loop</div>
              <h2>Find. Confirm. Fix. Retest. Record.</h2>
            </div>
            <p>AI helps check more pages, but no agent can approve its own fix. Important changes need evidence, reproduction, replay and human review.</p>
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
            <div><div className="eyebrow"><i className="dot" /> Coverage</div><h2>It tests the full product, not one page.</h2></div>
            <p>ProofOps is designed around real journeys: visitors who browse, traders who place orders, creators who launch markets, and power users who care about receipts, .id, dashboards, bots and contract paths.</p>
          </div>
          <div className="po-grid">
            <article className="po-card"><div className="po-agent-icon">⌁</div><h3>Trading flows</h3><p>Market and limit orders, charts, hover history, comments, receipts, order tickets, dashboards and profile links.</p><span className="tag id">Front end</span></article>
            <article className="po-card"><div className="po-agent-icon">◈</div><h3>Native launch</h3><p>AI drafts, required fields, source structure, route checks, creator bond, market cards and launch receipts.</p><span className="tag id">Creator flow</span></article>
            <article className="po-card"><div className="po-agent-icon">⛓</div><h3>Contract paths</h3><p>Bond accounting, settlement states, reward claims, creator fees, referral deductions and EdgeBoard balances.</p><span className="tag id">Contracts</span></article>
          </div>
        </div>

        <div className="po-section">
          <div className="po-intro">
            <div><div className="eyebrow"><i className="dot" /> What users should know</div><h2>Open launches still need rules.</h2></div>
            <p>Users can report product and security issues. ProofOps does not become a market disputes desk; it focuses on product safety, UX breakage, contract correctness and security concerns.</p>
          </div>
          <div className="po-split">
            <article className="po-card">
              <span className="pill">What AI helps with</span>
              <h3>More checks on every path.</h3>
              <ul>
                <li>Finds blank pages, broken routing and bad mobile states.</li>
                <li>Checks market order, limit order, receipt and dashboard updates.</li>
                <li>Tests launch composer completeness and route-check behavior.</li>
                <li>Scans contract test output for invariant failures and edge cases.</li>
              </ul>
            </article>
            <article className="po-card">
              <span className="pill">What AI does not do</span>
              <h3>What AI cannot promise.</h3>
              <ul>
                <li>Does not auto-deploy fixes.</li>
                <li>Does not approve sources or decide outcomes.</li>
                <li>Does not judge users or investigate private market motives.</li>
                <li>Does not guarantee the system has zero vulnerabilities.</li>
              </ul>
            </article>
          </div>
        </div>

        <div className="po-section" id="poReceipts">
          <div className="po-intro">
            <div><div className="eyebrow"><i className="dot" /> Latest receipts</div><h2>Public QA receipts without sensitive logs.</h2></div>
            <p>Important user-facing fixes can get a public QA receipt. Internal receipts keep deeper evidence, logs and patches for the team and future human audits.</p>
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
            <div><div className="eyebrow"><i className="dot" /> Responsible reports</div><h2>Report product and security issues.</h2></div>
            <p>Use this for broken flows, wallet/transaction issues, UI bugs, contract/security concerns and receipt errors. This is not for reporting insider trading, source disputes or market fairness claims.</p>
          </div>
          <div className="po-form-grid">
            <form className="po-form-card" onSubmit={submitIssue}>
              <label htmlFor="poIssueType">Issue type</label>
              <select id="poIssueType" name="issueType" defaultValue="Broken page or flow">
                <option>Broken page or flow</option>
                <option>Trading issue</option>
                <option>Launch issue</option>
                <option>Receipt/card issue</option>
                <option>Dashboard issue</option>
                <option>Mint .id issue</option>
                <option>Mobile layout issue</option>
                <option>Contract/security concern</option>
              </select>
              <label htmlFor="poPage">Affected page</label>
              <input id="poPage" name="page" placeholder="Markets, detail page, launch, mint, dashboard..." required />
              <label htmlFor="poDesc">What happened?</label>
              <textarea id="poDesc" name="description" placeholder="Describe the issue, expected behavior and what actually happened." required />
              <label htmlFor="poSteps">Steps to reproduce</label>
              <textarea id="poSteps" name="steps" placeholder="1. Open... 2. Click... 3. See..." required />
              <button className="primary" type="submit" style={{ width: "100%" }}>Submit to ProofOps</button>
              {message ? <div className="wallet-note" style={{ marginTop: "12px" }}>{message}</div> : null}
            </form>
            <aside className="po-submit-note">
              <h3>What happens after you submit?</h3>
              <p>Scout records the lead, Gate confirms if it is reproducible, Patch prepares a fix, Replay tests it on the affected surfaces, and Ledger creates the receipt when it passes.</p>
              <div className="po-metric-grid">
                <div className="po-metric"><span>Scope</span><b>Product + contracts</b></div>
                <div className="po-metric"><span>Auto deploy</span><b>No</b></div>
                <div className="po-metric"><span>Review</span><b>Human</b></div>
              </div>
            </aside>
          </div>
          <div className="po-quote">ProofOps is the fix loop: evidence, reproduction, patch, replay and receipt.</div>
        </div>
      </div>
    </section>
  );
}
