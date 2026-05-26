"use client";

import { useEffect, useState } from "react";
import { fetchDashboardApi, renderCardApi } from "@/lib/services/nexid-client";
import type { Receipt } from "@/lib/types/nexid";
import { EmptyState } from "@/components/nexid/shared/empty-state";

export function ReceiptsPageClient() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetchDashboardApi().then((snapshot) => setReceipts(snapshot.receipts)).catch(() => setReceipts([]));
  }, []);
  async function openCard(receipt: Receipt) {
    try {
      const card = await renderCardApi({ type: "receipt", title: `${receipt.identity} receipt`, payload: { receiptId: receipt.id } });
      setMessage(`Receipt card rendered: ${card.publicUrl}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Card render failed.");
    }
  }
  return (
    <section id="receipts" className="view active">
      <div className="section-head"><div><div className="eyebrow"><i className="dot" /> Proof layer</div><h2>Receipts worth posting.</h2><p>Cards are generated from live receipt records.</p></div></div>
      {message ? <div className="wallet-note">{message}</div> : null}
      {receipts.length ? <div className="receipt-archive">{receipts.map((receipt) => <div className="receipt-archive-card" key={receipt.id}><h3>+{receipt.returnPct}%</h3><p>{receipt.identity} {receipt.side} {receipt.narrativeName}</p><div className="receipt-actions"><button className="btn" onClick={() => openCard(receipt)}>Open card</button></div></div>)}</div> : <EmptyState title="No receipts yet" copy="Generate receipts from tracked positions in the dashboard." />}
    </section>
  );
}
