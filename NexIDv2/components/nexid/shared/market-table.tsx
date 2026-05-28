"use client";

import Link from "next/link";
import type { Narrative, Side } from "@/lib/types/nexid";
import { cls, fmtCurrency } from "@/components/nexid/shared/utils";
import { EmptyState } from "@/components/nexid/shared/empty-state";

export function MarketTable({
  narratives,
  title = "Live Narratives",
  withHead = true,
  onSide
}: {
  narratives: Narrative[];
  title?: string;
  withHead?: boolean;
  onSide?: (narrative: Narrative, side: Side) => void;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <div className="eyebrow"><i className="dot" />{title}</div>
          <h2>{withHead ? "What CT is riding and fading right now." : "Live narratives"}</h2>
          <p>{withHead ? "Pick a side from the board or open a narrative for depth, rules and receipts." : ""}</p>
        </div>
        <Link className="btn" href="/boards">Open EdgeBoards</Link>
      </div>
      <div className="market-table">
        <div className="table-head"><span>Narrative</span><span>Heat</span><span>7D</span><span>Riders</span><span>Faders</span><span>Liquidity</span><span /></div>
        {narratives.length ? narratives.map((item) => (
          <div className="market-row" key={item.id}>
            <Link className="market-name" href={`/narratives/${item.id}`}>
              <div className="orb">{item.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
              <div><b>{item.name}</b><span>{item.summary}</span></div>
            </Link>
            <div className="metric"><b>{item.heat}</b><span>Heat</span></div>
            <div className="metric"><b className={cls("move", item.move7d >= 0 ? "up" : "down")}>{item.move7d > 0 ? "+" : ""}{item.move7d}%</b><span>7D</span></div>
            <div className="metric"><b>{item.riders.toLocaleString()}</b><span>Riders</span></div>
            <div className="metric"><b>{item.faders.toLocaleString()}</b><span>Faders</span></div>
            <div className="metric"><b>{fmtCurrency(item.liquidity)}</b><span>{item.spread}% spread</span></div>
            <div className="row-actions">
              {onSide ? <button className="mini-btn ride" onClick={() => onSide(item, "ride")}>Ride</button> : <Link className="mini-btn ride" href={`/narratives/${item.id}`}>Ride</Link>}
              {onSide ? <button className="mini-btn fade" onClick={() => onSide(item, "fade")}>Fade</button> : <Link className="mini-btn fade" href={`/narratives/${item.id}`}>Fade</Link>}
            </div>
          </div>
        )) : <EmptyState title="No live narratives yet" copy="New markets will appear here as soon as there is enough real activity to rank." />}
      </div>
    </section>
  );
}
