"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useChainId, useSwitchChain, useWalletClient } from "wagmi";
import { fetchNarrativesApi, fetchPolymarketTradingAccountApi, placeOrderApi, previewOrderApi, recordUserSignedOrderApi } from "@/lib/services/nexid-client";
import { placeUserSignedPolymarketOrder } from "@/lib/services/polymarketUserExecution";
import type { Narrative, OrderType, Side } from "@/lib/types/nexid";
import { EmptyState } from "@/components/nexid/shared/empty-state";
import { WalletChoiceButton, useWalletSession } from "@/components/nexid/shared/wallet-session";
import { cls, fmtCurrency } from "@/components/nexid/shared/utils";
import { toTitleLabel } from "@/components/nexmarkets/copy";

const POLYGON_CHAIN_ID = 137;

function Chart({ narrative }: { narrative: Narrative }) {
  const points = narrative.chart.map((value, index) => `${(index / Math.max(narrative.chart.length - 1, 1)) * 100},${94 - value * 0.78}`).join(" ");
  return <div className="chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline className="area" points={`0,96 ${points} 100,96`} /><polyline className="line" points={points} /></svg></div>;
}

function userMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || "Position failed.");
  return message
    .replace(/Polymarket deposit wallet/gi, "trading account")
    .replace(/Polymarket order/gi, "order")
    .replace(/outcome token/gi, "outcome details");
}

export function NarrativeDetailPageClient({ slug }: { slug: string }) {
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [side, setSide] = useState<Side>("fade");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [amount, setAmount] = useState(25);
  const [limitPrice, setLimitPrice] = useState(0.5);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const wallet = useWalletSession();
  const activeChainId = useChainId();
  const walletClient = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  useEffect(() => {
    void fetchNarrativesApi().then((items) => {
      const item = items.find((entry) => entry.id === slug) ?? null;
      setNarrative(item);
      if (item) setLimitPrice(item.fadePrice);
    }).catch(() => setNarrative(null));
  }, [slug]);

  const quote = useMemo(() => {
    if (!narrative) return { price: 0, shares: 0, fee: 0 };
    const price = orderType === "limit" ? limitPrice : side === "ride" ? narrative.ridePrice : narrative.fadePrice;
    return { price, shares: amount / Math.max(price, 0.001), fee: amount * 0.0075 };
  }, [amount, limitPrice, narrative, orderType, side]);

  async function takeSide() {
    if (!narrative) return;
    setSubmitting(true);
    try {
      const user = await wallet.ensureSignedIn();
      const preview = await previewOrderApi({ narrativeId: narrative.id, side, orderType, amount, limitPrice });
      if (!preview.executionAvailable) {
        throw new Error(preview.executionWarning ?? "Execution is not available for this market yet.");
      }
      if (preview.executionMode === "user_signed") {
        if (!preview.outcomeToken) throw new Error("This side is missing tradable outcome details.");
        if (!walletClient.data) throw new Error("Choose a wallet before signing the order.");
        setMessage("Preparing your trading account.");
        const accountResolution = await fetchPolymarketTradingAccountApi(true);
        if (!accountResolution.account) throw new Error(accountResolution.message);
        if (activeChainId !== POLYGON_CHAIN_ID) {
          setMessage("Switching your wallet to the right network for signing.");
          await switchChainAsync({ chainId: POLYGON_CHAIN_ID });
        }
        const execution = await placeUserSignedPolymarketOrder({
          walletClient: walletClient.data,
          tradingAccount: accountResolution.account,
          outcomeToken: preview.outcomeToken,
          orderType,
          amount,
          price: preview.price
        });
        const position = await recordUserSignedOrderApi({
          narrativeId: narrative.id,
          side,
          orderType,
          amount,
          entryPrice: preview.price,
          marketId: preview.marketId,
          outcomeToken: preview.outcomeToken,
          executionId: execution.executionId,
          builderCode: execution.builderCode,
          polymarketFunderAddress: execution.polymarketFunderAddress,
          polymarketSignatureType: execution.polymarketSignatureType,
          fillStatus: execution.fillStatus,
          executionStatus: execution.executionStatus,
          raw: execution.raw
        });
        setMessage(`${user.primaryIdName ? user.primaryIdName : "Position"} signed from your wallet and saved in NexMarkets. Receipt unlocks after closure or resolution. ${toTitleLabel(position.status)}`);
        return;
      }
      const position = await placeOrderApi({ narrativeId: narrative.id, side, orderType, amount, entryPrice: preview.price });
      setMessage(`${user.primaryIdName ? user.primaryIdName : "Position"} submitted. Receipt unlocks after the position closes or resolves.`);
    } catch (error) {
      setMessage(userMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!narrative) {
    return <section className="view active"><EmptyState title="Narrative not found" copy="Try another market from Pulse or check back when this one is live." /></section>;
  }

  return (
    <section id="detail" className="view active">
      <div className="detail-head">
        <div className="detail-title">
          <div className="backline"><Link href="/markets">Back to Markets</Link><span className="eyebrow"><i className="dot" />{narrative.tag}</span></div>
          <h1>{narrative.name}</h1><p>{narrative.summary}</p>
          <div className="stat-grid">{[["Heat", `${narrative.heat}`], ["7D move", `${narrative.move7d > 0 ? "+" : ""}${narrative.move7d}%`], ["Quality", narrative.quality], ["Liquidity", fmtCurrency(narrative.liquidity)], ["Spread", `${narrative.spread}%`], ["Expiry", narrative.expiry]].map(([label, value]) => <div className="statbox" key={label}><b>{value}</b><span>{label}</span></div>)}</div>
        </div>
        <aside className="detail-side"><h3>Market balance</h3><div className="side-split"><div className="split"><span>Riders</span><b>{narrative.riders.toLocaleString()}</b></div><div className="split"><span>Faders</span><b>{narrative.faders.toLocaleString()}</b></div></div><div className="balance-row"><span>Ride price</span><b>${narrative.ridePrice.toFixed(2)}</b></div><div className="balance-row"><span>Fade price</span><b>${narrative.fadePrice.toFixed(2)}</b></div></aside>
      </div>
      <div className="detail-grid">
        <div className="market-body">
          <div className="chart-panel"><div className="chart-top"><h3>Price memory</h3></div><Chart narrative={narrative} /></div>
          <div className="social-panel"><div className="tabs"><button className="active">Activity</button></div><div className="panel-content"><div className="feed">{narrative.comments.map((comment, index) => <div className="feed-item" key={comment}><div className="feed-head"><b>{index % 2 ? "Fader" : "Rider"} thesis</b><span>{index + 1}h</span></div><p>{comment}</p></div>)}</div></div></div>
        </div>
        <aside className="ticket">
          <h3>{side === "ride" ? "Ride" : "Fade"} {narrative.name}</h3>
          <div className="side-toggle"><button className={cls("ride", side === "ride" && "active")} onClick={() => { setSide("ride"); setLimitPrice(narrative.ridePrice); }}>Ride</button><button className={cls("fade", side === "fade" && "active")} onClick={() => { setSide("fade"); setLimitPrice(narrative.fadePrice); }}>Fade</button></div>
          <div className="order-tabs"><button className={orderType === "market" ? "active" : ""} onClick={() => setOrderType("market")}>Market</button><button className={orderType === "limit" ? "active" : ""} onClick={() => setOrderType("limit")}>Limit</button></div>
          <div className="amount"><span>$</span><input value={amount} type="number" min={1} onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))} /></div>
          {orderType === "limit" ? <div className="amount"><span>c</span><input value={Math.round(limitPrice * 100)} type="number" min={1} max={99} onChange={(event) => setLimitPrice(Math.max(1, Math.min(99, Number(event.target.value) || 1)) / 100)} /></div> : null}
          <div className="summary"><div><span>Price</span><b>${quote.price.toFixed(2)}</b></div><div><span>Shares</span><b>{quote.shares.toFixed(2)}</b></div><div><span>Fee</span><b>${quote.fee.toFixed(2)}</b></div></div>
          {wallet.user ? <button className="execute" onClick={takeSide} disabled={wallet.busy || submitting}>{submitting ? "Routing" : "Review position"}</button> : <WalletChoiceButton authenticated={false} onSign={() => void wallet.ensureSignedIn().catch((error) => setMessage(error.message))} onDisconnect={wallet.disconnect} />}
          {message ? <p className="risk-line">{message}</p> : <p className="risk-line">Risk is real. Nothing here is financial advice.</p>}
        </aside>
      </div>
    </section>
  );
}
