"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchDashboardApi, renderCardApi } from "@/lib/services/nexid-client";
import type { Receipt } from "@/lib/types/nexid";

function receiptVerb(receipt: Receipt) {
  if (receipt.side === "ride") return "rode";
  if (receipt.side === "fade") return "faded";
  if (receipt.side === "launch") return "launched";
  if (receipt.side === "settlement") return "settled";
  if (receipt.side === "invalid") return "invalidated";
  return "saved";
}

function receiptHeadline(receipt: Receipt) {
  if (receipt.returnPct !== 0) return `${receipt.returnPct > 0 ? "+" : ""}${receipt.returnPct}%`;
  return receipt.rank || receipt.proofLevel;
}

export function ReceiptsPageClient() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetchDashboardApi().then((snapshot) => setReceipts(snapshot.receipts)).catch(() => setReceipts([]));
  }, []);

  async function openCard(receipt: Receipt) {
    try {
      const card = await renderCardApi({ type: "receipt", title: `${receipt.identity} receipt`, payload: { receiptId: receipt.id } });
      setMessage(`Receipt card ready: ${card.publicUrl}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Card render failed.");
    }
  }

  return (
    <section id="dashboard" className="view active">
      <div className="d82">
        <section className="d82-hero">
          <div>
            <span className="d82-kicker"><i className="d82-dot" /> Proof layer</span>
            <h1>Receipts.</h1>
            <p>Proof cards for trades, launches, settlements and rank movement.</p>
            <div className="d82-hero-actions">
              <Link className="primary" href="/markets">Trade</Link>
              <Link className="btn" href="/launch">Launch market</Link>
              <Link className="btn" href="/my-edge">Dashboard</Link>
            </div>
            <div className="d82-rhythm">
              <div><span>Total</span><b>{receipts.length}</b></div>
              <div><span>Trades</span><b>{receipts.filter((receipt) => receipt.side === "ride" || receipt.side === "fade").length}</b></div>
              <div><span>Launches</span><b>{receipts.filter((receipt) => receipt.side === "launch").length}</b></div>
              <div><span>Settled</span><b>{receipts.filter((receipt) => receipt.side === "settlement").length}</b></div>
            </div>
          </div>
          <aside className="d82-passport-card">
            <div>
              <div className="d82-avatar-row"><div className="d82-avatar">R</div><span className="d82-pill gold">Archive</span></div>
              <h3>{receipts.length ? "Proof ready" : "No receipts yet"}</h3>
              <p>{receipts.length ? "Your latest saved market proof is ready to open or share." : "Trade, launch or settle a market to save your first receipt."}</p>
            </div>
          </aside>
        </section>
        {message ? <div className="wallet-note">{message}</div> : null}
        <section className="d82-panel">
          <div className="d82-title"><div><h2>Receipt archive.</h2><p>Every card below comes from saved market activity.</p></div></div>
          {receipts.length ? (
            <div className="d82-grid3">
              {receipts.map((receipt) => (
                <article className="d82-receipt-card dark" key={receipt.id}>
                  <div><span className="d82-pill gold">{receipt.proofLevel}</span><h3>{receiptHeadline(receipt)}</h3><p>{receipt.identity} {receiptVerb(receipt)} {receipt.narrativeName}</p></div>
                  <div className="d82-card-stats"><div><span>Points</span><b>{receipt.edgePoints}</b></div><div><span>Status</span><b>{receipt.status ?? "Ready"}</b></div><div><span>Rank</span><b>{receipt.rank}</b></div></div>
                  <div className="d82-actions"><button className="btn" onClick={() => openCard(receipt)}>Open card</button>{receipt.publicUrl ? <Link className="primary" href={receipt.publicUrl}>Market</Link> : null}</div>
                </article>
              ))}
            </div>
          ) : (
            <div className="d82-row"><div><h4>No receipts yet</h4><p>Market trades, launches and settlements save proof here automatically.</p></div><div className="d82-row-meta"><span className="d82-pill">Empty</span></div></div>
          )}
        </section>
      </div>
    </section>
  );
}
