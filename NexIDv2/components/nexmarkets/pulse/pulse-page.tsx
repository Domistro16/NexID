import Link from "next/link";
import { BoardList } from "@/components/nexid/shared/board-list";
import { EmptyState } from "@/components/nexid/shared/empty-state";
import { MarketCard } from "@/components/nexmarkets/market-card";
import type { BoardEntry, Narrative } from "@/lib/types/nexid";
import type { NexMarket } from "@/lib/types/nexmarkets";

export function PulsePage({
  markets,
  narratives,
  board
}: {
  markets: NexMarket[];
  narratives: Narrative[];
  board: BoardEntry[];
}) {
  const liveMarkets = markets.filter((market) => market.status === "trading_live");
  const openingMarkets = markets.filter((market) => market.status === "live_pending_open");
  const drafts = markets.filter((market) => market.origin === "draft");
  const topNarrative = narratives[0] ?? null;

  return (
    <section className="view active">
      <div className="nexmarkets-hero">
        <div>
          <div className="eyebrow"><i className="dot" /> NexMarkets Pulse</div>
          <h1>Have a thesis? Make it a market.</h1>
          <p>
            Find live markets people are already trading. If your thesis is new, shape it into a clean Ride/Fade market and launch it when it is ready.
          </p>
          <div className="hero-ctas">
            <Link className="primary" href="/launch">Shape a thesis</Link>
            <Link className="btn" href="/edgeboard">Open EdgeBoard</Link>
          </div>
        </div>
        <aside>
          <span>Live inventory</span>
          <b>{liveMarkets.length}</b>
          <p>{topNarrative ? `${topNarrative.name} is the hottest current narrative.` : openingMarkets.length ? `${openingMarkets.length} market${openingMarkets.length === 1 ? " is" : "s are"} opening soon.` : "Live markets will appear here as soon as they are ready to trade."}</p>
        </aside>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow"><i className="dot" /> Live and drafts</div>
            <h2>Market rooms.</h2>
            <p>Open a room to read the question, choose a side, and keep the proof in your NexMarkets passport.</p>
          </div>
        </div>
        {markets.length ? (
          <div className="nexmarket-grid">
            {markets.map((market) => <MarketCard key={market.id} market={market} />)}
          </div>
        ) : (
          <EmptyState title="No markets yet" copy="Use Thesis Studio to shape a thesis and check whether it is ready to trade or launch." />
        )}
      </section>

      <section className="section card-grid">
        <div className="small-card">
          <h3>Draft lane</h3>
          <p>{drafts.length ? `${drafts.length} draft markets are waiting for a clearer question or launch decision.` : "Drafts stay private until the question, source and timing are clear."}</p>
          <Link className="btn" href="/launch">Open Thesis Studio</Link>
        </div>
        <div className="small-card">
          <h3>Launch room</h3>
          <p>Turn a clear thesis into a market with a launch stake, a named source and rules traders can understand before they enter.</p>
          <Link className="btn" href="/launch">Prepare launch</Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow"><i className="dot" /> EdgeBoard</div>
            <h2>Reputation state.</h2>
          </div>
        </div>
        <BoardList rows={board} />
      </section>
    </section>
  );
}
