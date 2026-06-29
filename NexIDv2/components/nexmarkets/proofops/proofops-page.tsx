"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

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

type ProofOpsReport = {
  id: string;
  receiptId: string;
  issueType: string;
  page: string;
  severity: string;
  status: string;
  summary: string;
  createdAt: string;
};

async function responseMessage(response: Response) {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "now";
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function ProofOpsPage() {
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState("");
  const [reports, setReports] = useState<ProofOpsReport[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<ProofOpsReport | null>(null);
  const agent = agents[active];
  const receiptToShare = lastReceipt ?? reports[0] ?? null;
  const receiptLink = useMemo(() => {
    if (!receiptToShare || typeof window === "undefined") return "";
    return `${window.location.origin}/proofops?receipt=${encodeURIComponent(receiptToShare.receiptId)}#poReceipts`;
  }, [receiptToShare]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    let cancelled = false;
    async function loadReports() {
      try {
        const response = await fetch("/api/proofops/reports", { cache: "no-store" });
        if (!response.ok) throw new Error(await responseMessage(response));
        const body = await response.json() as { reports?: ProofOpsReport[] };
        if (!cancelled) setReports(body.reports ?? []);
      } catch {
        if (!cancelled) setReports([]);
      }
    }
    void loadReports();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("Submitting report...");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/proofops/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = await response.json() as { report: ProofOpsReport };
      event.currentTarget.reset();
      setLastReceipt(body.report);
      setReports((current) => [body.report, ...current.filter((item) => item.id !== body.report.id)].slice(0, 8));
      setMessage(`Product/security issue queued for Gate review. Receipt ${body.report.receiptId} recorded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report could not be recorded.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyReceiptLink() {
    if (!receiptToShare || !receiptLink) {
      setMessage("Submit or select a ProofOps receipt first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(receiptLink);
      setMessage(`ProofOps receipt ${receiptToShare.receiptId} link copied.`);
    } catch {
      setMessage(`Receipt link: ${receiptLink}`);
    }
  }

  async function shareReceipt() {
    if (!receiptToShare || !receiptLink) {
      setMessage("Submit or select a ProofOps receipt first.");
      return;
    }
    const text = `${receiptToShare.receiptId}: ${receiptToShare.summary} is ${receiptToShare.status.toLowerCase()} in ProofOps.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "ProofOps receipt", text, url: receiptLink });
        setMessage(`ProofOps receipt ${receiptToShare.receiptId} shared.`);
      } else {
        await navigator.clipboard.writeText(`${text} ${receiptLink}`);
        setMessage(`ProofOps receipt ${receiptToShare.receiptId} share text copied.`);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Receipt could not be shared from this browser.");
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
              {reports.length ? reports.map((report) => (
                <button className="po-feed-row" key={report.id} type="button" onClick={() => setLastReceipt(report)}>
                  <time>{relativeTime(report.createdAt)}</time>
                  <div><b>{report.receiptId}: {report.page}</b><span>{report.issueType} / {report.severity} severity</span></div>
                  <span className={`tag ${report.status === "Passed" ? "rider" : "id"}`}>{report.status}</span>
                </button>
              )) : receipts.map((receipt) => (
                <div className="po-feed-row" key={receipt[1]}>
                  <time>{receipt[0]}</time>
                  <div><b>{receipt[1]}</b><span>{receipt[2]}</span></div>
                  <span className={`tag ${receipt[3] === "Passed" ? "rider" : "id"}`}>{receipt[3]}</span>
                </div>
              ))}
            </div>
            <div className="po-receipt-card">
              <div>
                <span className="pill">QA Receipt</span>
                <h3>{receiptToShare ? receiptToShare.receiptId : "Replay passed."}</h3>
                <p>{receiptToShare ? `${receiptToShare.summary}. Current status: ${receiptToShare.status}.` : "Mobile market search, filter drawer, market detail, order ticket and receipt card checked across light and dark mode."}</p>
              </div>
              <div className="inline-actions"><button className="btn" type="button" onClick={() => void copyReceiptLink()}>Copy link</button><button className="primary" type="button" onClick={() => void shareReceipt()}>Share card</button></div>
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
              <label htmlFor="poSeverity">Severity</label>
              <select id="poSeverity" name="severity" defaultValue="Medium">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
              <label htmlFor="poPage">Affected page</label>
              <input id="poPage" name="page" placeholder="Markets, detail page, launch, mint, dashboard..." required />
              <label htmlFor="poDesc">What happened?</label>
              <textarea id="poDesc" name="description" placeholder="Describe the issue, expected behavior and what actually happened." required />
              <label htmlFor="poSteps">Steps to reproduce</label>
              <textarea id="poSteps" name="steps" placeholder="1. Open... 2. Click... 3. See..." required />
              <label htmlFor="poExpected">Expected result</label>
              <textarea id="poExpected" name="expected" placeholder="What should have happened instead?" />
              <label htmlFor="poEvidenceUrl">Evidence URL</label>
              <input id="poEvidenceUrl" name="evidenceUrl" type="url" placeholder="Screenshot, transaction, console log, receipt or recording URL" />
              <label htmlFor="poContact">Contact</label>
              <input id="poContact" name="contact" placeholder="Email, Telegram or wallet for follow-up" />
              <button className="primary" type="submit" disabled={submitting} style={{ width: "100%" }}>{submitting ? "Submitting..." : "Submit to ProofOps"}</button>
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
