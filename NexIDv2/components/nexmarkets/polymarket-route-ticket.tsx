"use client";

import { useMemo, useState } from "react";
import { useChainId, useSwitchChain, useWalletClient } from "wagmi";
import { useWalletSession } from "@/components/nexid/shared/wallet-session";
import { toTitleLabel } from "@/components/nexmarkets/copy";
import { fetchPolymarketTradingAccountApi, recordPolymarketRouteOrderApi } from "@/lib/services/nexid-client";
import { placeUserSignedPolymarketOrder } from "@/lib/services/polymarketUserExecution";
import type { OrderType, Side } from "@/lib/types/nexid";

type PolymarketRouteTicketProps = {
  marketId: string;
  prices: number[];
  clobTokenIds: string[];
};

const POLYGON_CHAIN_ID = 137;
const CENT = "\u00a2";

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function sideIndex(side: Side) {
  return side === "ride" ? 0 : 1;
}

function clampPrice(value: number) {
  return Math.max(0.001, Math.min(0.999, Math.round(value * 1000) / 1000));
}

function clampCents(value: number) {
  return Math.max(1, Math.min(99, Math.round(value || 1)));
}

function centsLabel(value: number) {
  return `${Math.round(value * 100)}${CENT}`;
}

function moneyLabel(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
}

function shortAddress(value?: string | null) {
  if (!value) return "-";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function userMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || "Order failed.");
  return message
    .replace(/Polymarket deposit wallet/gi, "trading account")
    .replace(/Polymarket wallet/gi, "trading account")
    .replace(/CLOB/gi, "market")
    .replace(/outcome token/gi, "outcome details")
    .replace(/builder attribution/gi, "NexMarkets credit");
}

export function PolymarketRouteTicket({
  marketId,
  prices,
  clobTokenIds
}: PolymarketRouteTicketProps) {
  const [side, setSide] = useState<Side>("ride");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [amount, setAmount] = useState(25);
  const [limitPrice, setLimitPrice] = useState(clampPrice(prices[0] ?? 0.5));
  const [expiry, setExpiry] = useState("GTC");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const wallet = useWalletSession();
  const activeChainId = useChainId();
  const walletClient = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const selectedIndex = sideIndex(side);
  const marketPrice = prices[selectedIndex] ?? 0.5;
  const entryPrice = orderType === "limit" ? limitPrice : marketPrice;
  const fillLabel = centsLabel(entryPrice);
  const quote = useMemo(() => ({
    shares: amount / Math.max(entryPrice, 0.001)
  }), [amount, entryPrice]);

  function chooseSide(nextSide: Side) {
    setSide(nextSide);
    setLimitPrice(clampPrice(prices[sideIndex(nextSide)] ?? 0.5));
  }

  async function routeOrder() {
    setBusy(true);
    setMessage("Checking your NexMarkets session.");
    try {
      const user = await wallet.ensureSignedIn();
      const outcomeToken = clobTokenIds[selectedIndex];
      if (!outcomeToken) throw new Error("This market is missing tradable outcome details for that side.");
      if (!walletClient.data) throw new Error("Choose a wallet before signing the order.");
      setMessage("Preparing your trading account.");
      const accountResolution = await fetchPolymarketTradingAccountApi(true);
      if (!accountResolution.account) throw new Error(accountResolution.message);
      if (activeChainId !== POLYGON_CHAIN_ID) {
        setMessage("Switching your wallet to the right network for signing.");
        await switchChainAsync({ chainId: POLYGON_CHAIN_ID });
      }

      setMessage(`Confirm the order in your wallet. Trading account ${shortAddress(accountResolution.account.funderAddress)} is ready.`);
      const execution = await placeUserSignedPolymarketOrder({
        walletClient: walletClient.data,
        tradingAccount: accountResolution.account,
        outcomeToken,
        orderType,
        amount,
        price: entryPrice
      });
      if (execution.walletAddress.toLowerCase() !== user.walletAddress.toLowerCase()) {
        throw new Error("Connected wallet does not match your signed-in NexMarkets account.");
      }
      setMessage("Saving your NexMarkets proof.");
      const result = await recordPolymarketRouteOrderApi(marketId, {
        side,
        orderType,
        amount,
        entryPrice,
        walletAddress: user.walletAddress,
        outcomeToken: execution.outcomeToken,
        executionId: execution.executionId,
        builderCode: execution.builderCode,
        polymarketFunderAddress: execution.polymarketFunderAddress,
        polymarketSignatureType: execution.polymarketSignatureType,
        fillStatus: execution.fillStatus,
        executionStatus: execution.executionStatus,
        raw: execution.raw
      });
      setMessage(`Order sent. ${toTitleLabel(result.execution.fillStatus)}. Receipt saved as ${result.receipt.id}.`);
    } catch (error) {
      setMessage(userMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    setBusy(true);
    setMessage("Checking your NexMarkets session.");
    try {
      await wallet.ensureSignedIn();
      setMessage("Signed in. Review the ticket, then continue.");
    } catch (error) {
      setMessage(userMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function executeTicket() {
    if (!wallet.user) {
      await signIn();
      return;
    }
    await routeOrder();
  }

  const executeLabel = busy
    ? "Working..."
    : !wallet.user
      ? "Sign in to trade"
      : orderType === "limit"
        ? "Place limit order"
        : side === "ride"
          ? "Ride now"
          : "Fade now";

  return (
    <aside className="v40-ticket ticket">
      <h3>Trade this market</h3>
      <div className="v40-seg side-toggle">
        <button className={cls("ride", side === "ride" && "active")} type="button" onClick={() => chooseSide("ride")}>
          Ride
        </button>
        <button className={cls("fade", side === "fade" && "active")} type="button" onClick={() => chooseSide("fade")}>
          Fade
        </button>
      </div>
      <div className="v40-order-tabs order-tabs">
        <button className={orderType === "market" ? "active" : ""} type="button" onClick={() => setOrderType("market")}>Market order</button>
        <button className={orderType === "limit" ? "active" : ""} type="button" onClick={() => setOrderType("limit")}>Limit order</button>
      </div>
      {orderType === "limit" ? (
        <>
          <div className="v40-field">
            <span>Limit</span>
            <input
              value={Math.round(limitPrice * 100)}
              type="number"
              min={1}
              max={99}
              onChange={(event) => setLimitPrice(clampPrice(clampCents(Number(event.target.value)) / 100))}
            />
            <b>{CENT}</b>
          </div>
          <div className="v40-field">
            <span>Expiry</span>
            <select value={expiry} onChange={(event) => setExpiry(event.target.value)}>
              <option>GTC</option>
              <option>24h</option>
              <option>Market close</option>
            </select>
          </div>
        </>
      ) : (
        <div className="v40-info-line"><span>Execution</span><b>Immediate estimate at {fillLabel}</b></div>
      )}
      <div className="v40-field amount">
        <span>$</span>
        <input value={amount} type="number" min={5} onChange={(event) => setAmount(Math.max(5, Number(event.target.value) || 5))} />
      </div>
      <div className="v40-summary summary">
        <div><span>{orderType === "market" ? "Average fill" : "Limit price"}</span><b>{fillLabel}</b></div>
        <div><span>Estimated shares</span><b>{quote.shares.toFixed(2)}</b></div>
        <div><span>Max payout</span><b>{moneyLabel(quote.shares)}</b></div>
        <div><span>Receipt</span><b>{orderType === "market" ? "Generated now" : "Generated when filled"}</b></div>
      </div>
      {message ? <div className="wallet-note route-status"><b>Status:</b> {message}</div> : null}
      <button className="execute" type="button" disabled={busy || wallet.busy} onClick={() => void executeTicket()}>
        {executeLabel}
      </button>
      <p className="v40-risk risk-line">Review the rule, source and close time before signing.</p>
    </aside>
  );
}
