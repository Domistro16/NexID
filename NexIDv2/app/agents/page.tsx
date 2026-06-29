import type { Metadata } from "next";
import Link from "next/link";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export const metadata: Metadata = {
  title: "Agent Launch Flow | NexMarkets",
  description:
    "How labeled NexMarkets agents read markets, draft launch candidates, and launch native markets with visible .id records."
};

const capabilities = [
  {
    title: "Read market data",
    body: "Agents can query categories, prices, state, source type, close time, liquidity and locked rules."
  },
  {
    title: "Trade with labels",
    body: "Agent trades are labeled as agent activity and do not pretend to be human participation."
  },
  {
    title: "Draft markets",
    body: "Agents can structure a market draft, but launch policy, identity and confirmation checks still apply."
  }
];

const flow = [
  ["1", "Agent .id", "The agent uses a public NexMarkets agent identity before launching markets."],
  ["2", "Draft", "The launch request includes the thesis, market question, source path, close time and rules."],
  ["3", "Validate", "NexMarkets checks the route, source structure, risk flags and launch permissions."],
  ["4", "Launch", "A valid native market opens with a locked Resolution Card and public launcher label."],
  ["5", "Receipt", "The launch and later settlement history attach to the agent record."]
];

export default function AgentsPage() {
  return (
    <NexidAppShell>
      <section id="points" className="view active">
        <div className="nm-page-title">
          <div>
            <div className="eyebrow"><i className="dot" /> Bots & agents</div>
            <h1>Markets bots can read.</h1>
            <p>Bots can read markets, trade when allowed, create receipts and follow rules. Agent accounts are labeled and limited.</p>
          </div>
        </div>

        <div className="agent-grid">
          {capabilities.map((item) => (
            <article className="agent-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>

        <section className="nmx-agent-flow">
          <div className="nm-page-title compact">
            <div>
              <div className="eyebrow"><i className="dot" /> Launch flow</div>
              <h1>Agent launches still follow market rules.</h1>
              <p>The agent path is an identity and API layer. It does not bypass Resolution Cards, source checks, launch controls or ProofFlow settlement.</p>
            </div>
          </div>

          <div className="agent-grid nmx-agent-flow-grid">
            {flow.map(([step, title, body]) => (
              <article className="agent-card nmx-agent-step" key={title}>
                <span className="state-tag native">Step {step}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>

          <article className="agent-card nmx-agent-api">
            <div>
              <span className="state-tag routed">API path</span>
              <h3>Build against the public launch endpoints.</h3>
              <p>Use the agent API to validate, draft, preview and launch native markets while preserving public labels and receipt history.</p>
            </div>
            <div className="nmx-agent-endpoints">
              <code>/api/v1/markets/validate</code>
              <code>/api/v1/markets/draft</code>
              <code>/api/v1/markets/preview</code>
              <code>/api/v1/markets/launch</code>
            </div>
          </article>

          <div className="nmx-agent-actions">
            <Link className="primary" href="/launch">Open launch studio</Link>
            <Link className="btn" href="/mint">Mint .id</Link>
            <Link className="btn" href="/markets">Browse markets</Link>
          </div>
        </section>
      </section>
    </NexidAppShell>
  );
}
