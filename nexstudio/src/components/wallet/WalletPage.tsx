"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/product/Icon";
import { LoadState } from "@/components/product/LoadState";
import { useProduct } from "@/components/product/ProductProvider";

function units(value: string | null | undefined, decimals: number, maximum = 6) {
  if (value == null) return null;
  try {
    const atomic = BigInt(value); const scale = 10n ** BigInt(decimals); const whole = atomic / scale; const fraction = (atomic % scale).toString().padStart(decimals, "0").slice(0, maximum).replace(/0+$/, ""); return `${whole.toLocaleString()}${fraction ? `.${fraction}` : ""}`;
  } catch { return null; }
}
function record(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }

export function WalletPage() {
  const { data, loading, error, refresh, notify, walletConnected, setConnectWalletOpen } = useProduct();
  const [funding, setFunding] = useState(false);
  const address = data?.wallet.address || null;
  const activeRooms = useMemo(() => data?.workrooms.filter((room) => !new Set(["RELEASED", "REFUNDED", "CANCELLED"]).has(room.status)) || [], [data]);
  const secured = activeRooms.reduce((sum, room) => sum + BigInt(room.listing.budgetAtomic || "0"), 0n);
  const released = (data?.workrooms || []).filter((room) => room.status === "RELEASED" && room.workerUserId === data?.user?.id).reduce((sum, room) => sum + BigInt(room.listing.budgetAtomic || "0"), 0n);
  const payments = (data?.payments || []).map(record);
  if (loading || error || !data) return <LoadState label="Loading wallet" />;
  const copy = async () => { if (!address) return; await navigator.clipboard.writeText(address); notify("Address copied", "The verified receiving address is on your clipboard."); };
  const exportCsv = () => {
    const rows = [["created_at", "purpose", "status", "amount_atomic", "currency", "transaction_hash"], ...payments.map((item) => [String(item.createdAt || ""), String(item.purpose || ""), String(item.status || ""), String(item.amountAtomic || ""), String(item.currency || "USDC"), String(item.txHash || "")])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "nexmarkets-payments.csv"; anchor.click(); URL.revokeObjectURL(anchor.href);
  };
  const available = units(data.wallet.usdcAtomic, 6);
  const nex = units(data.wallet.nexAtomic, 18, 4);
  return <><header className="page-head"><div className="page-head-copy"><span className="page-kicker">Wallet & Payments</span><h1>Money follows confirmed transactions.</h1><p>Balances come from Robinhood Chain; movements stay linked to the record that caused them.</p></div><div className="head-actions">{walletConnected ? <><button className="btn ghost" onClick={copy}><Icon name="copy" size="sm" /> Copy address</button><button className="btn primary" onClick={() => setFunding((value) => !value)}>Add funds</button></> : <button className="btn primary" onClick={() => setConnectWalletOpen(true)}>Connect wallet</button>}</div></header>
    {funding && address && walletConnected ? <section className="settings-section"><header className="settings-head"><h2>Add funds to the connected wallet</h2><p>Send supported assets to this address on Robinhood Chain. NexMarkets never takes custody.</p></header><div className="setting-row"><span className="setting-copy"><b>Receiving address</b><span>{address}</span></span><button className="btn ghost" onClick={copy}>Copy</button></div><div className="setting-row"><span className="setting-copy"><b>Network</b><span>Chain ID {data.wallet.chainId || "not configured"} · ETH for gas</span></span><Link className="btn ghost" href="/docs/money--add-usdc-and-network-fees">Funding guide</Link></div><button className="btn text" onClick={() => setFunding(false)}>Close</button></section> : null}
    <section className="wallet-summary"><article className="wallet-card"><span>Available</span><b>{walletConnected ? available == null ? "Unavailable" : `${available} USDC` : "Not connected"}</b><small>{walletConnected ? (data.wallet.error || "Read from the verified wallet") : "Connect a wallet to read its balance"}</small></article><article className="wallet-card"><span>Secured for active work</span><b>{units(secured.toString(), 6) || "0"} USDC</b><small>{activeRooms.length} Workroom record{activeRooms.length === 1 ? "" : "s"}</small></article><article className="wallet-card"><span>Released earnings</span><b>{units(released.toString(), 6) || "0"} USDC</b><small>Approved Marketplace work paid to this account</small></article><article className="wallet-card"><span>$NEX holding</span><b>{walletConnected ? nex == null ? "Unavailable" : `${nex} NEX` : "Not connected"}</b><small>{walletConnected ? "Read from Robinhood Chain" : "Connect a wallet to read its balance"}</small></article></section>
    <div className="section-top"><h2>Activity</h2><span>Persisted payment intents</span></div><section className="transaction-list">{payments.length ? payments.map((item) => { const production = record(item.production); return <article className="transaction" key={String(item.id)}><i>{item.status === "CONFIRMED" ? "✓" : "·"}</i><span><b>{String(production.title || item.purpose || "Product payment")}</b><span>{String(item.status || "")}{item.txHash ? ` · ${String(item.txHash).slice(0, 10)}…` : ""}</span></span><time>{item.createdAt ? new Date(String(item.createdAt)).toLocaleString() : ""}</time><strong>{units(String(item.amountAtomic || "0"), 6) || "0"} {String(item.currency || "USDC")}</strong></article>; }) : <div className="market-empty"><h2>No payment activity yet.</h2><p>Confirmed and pending product payments will appear here.</p></div>}</section><section className="settings-section" style={{ marginTop: 14 }}><header className="settings-head"><h2>Payment controls</h2><p>Review the connected address and export the persisted transaction record.</p></header><div className="setting-row"><span className="setting-copy"><b>Receiving wallet</b><span>{walletConnected ? (address || "Not connected") : "Not connected"}</span></span>{walletConnected ? <button className="btn ghost" onClick={() => void refresh()}><Icon name="refresh" size="sm" /> Refresh balances</button> : <button className="btn ghost" onClick={() => setConnectWalletOpen(true)}><Icon name="wallet" size="sm" /> Connect wallet</button>}</div><div className="setting-row"><span className="setting-copy"><b>Transaction exports</b><span>Download the account payment-intent record.</span></span><button className="btn ghost" disabled={!payments.length} onClick={exportCsv}><Icon name="download" size="sm" /> Export</button></div></section>
  </>;
}
