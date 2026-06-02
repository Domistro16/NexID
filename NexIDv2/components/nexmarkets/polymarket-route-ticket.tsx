"use client";

import { useMemo, useState } from "react";
import { useChainId, useSwitchChain, useWalletClient } from "wagmi";
import { WalletChoiceButton, useWalletSession } from "@/components/nexid/shared/wallet-session";
import { toTitleLabel } from "@/components/nexmarkets/copy";
import { fetchPolymarketTradingAccountApi, recordPolymarketRouteOrderApi } from "@/lib/services/nexid-client";
import { placeUserSignedPolymarketOrder } from "@/lib/services/polymarketUserExecution";
import type { OrderType, PolymarketTradingAccount, Side } from "@/lib/types/nexid";

type PolymarketRouteTicketProps = {
  marketId: string;
  question: string;
  outcomes: string[];
  prices: number[];
  clobTokenIds: string[];
  liquidity: string;
  volume24h: string;
};

const POLYGON_CHAIN_ID = 137;

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function sideIndex(side: Side) {
  return side === "ride" ? 0 : 1;
}

function clampPrice(value: number) {
  return Math.max(0.001, Math.min(0.999, Math.round(value * 1000) / 1000));
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
  question,
  outcomes,
  prices,
  clobTokenIds,
  liquidity,
  volume24h
}: PolymarketRouteTicketProps) {
  const [side, setSide] = useState<Side>("ride");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [amount, setAmount] = useState(25);
  const [limitPrice, setLimitPrice] = useState(clampPrice(prices[0] ?? 0.5));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tradingAccount, setTradingAccount] = useState<PolymarketTradingAccount | null>(null);
  const wallet = useWalletSession();
  const activeChainId = useChainId();
  const walletClient = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const selectedIndex = sideIndex(side);
  const selectedOutcome = outcomes[selectedIndex] ?? (side === "ride" ? "Yes" : "No");
  const marketPrice = prices[selectedIndex] ?? 0.5;
  const entryPrice = orderType === "limit" ? limitPrice : marketPrice;
  const quote = useMemo(() => ({
    shares: amount / Math.max(entryPrice, 0.001),
    nexMarketsFee: amount * 0.005
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
      setTradingAccount(accountResolution.account);
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

  return (
    <aside className="v40-ticket ticket">
      <h3>{side === "ride" ? "Ride" : "Fade"} This Market</h3>
      <div className="order-question">{question}</div>
      <div className="v40-seg side-toggle">
        <button className={cls("ride", side === "ride" && "active")} type="button" onClick={() => chooseSide("ride")}>
          <span>Ride</span>
          <b>{outcomes[0] ?? "Yes"}</b>
        </button>
        <button className={cls("fade", side === "fade" && "active")} type="button" onClick={() => chooseSide("fade")}>
          <span>Fade</span>
          <b>{outcomes[1] ?? "No"}</b>
        </button>
      </div>
      <div className="v40-order-tabs order-tabs">
        <button className={orderType === "market" ? "active" : ""} type="button" onClick={() => setOrderType("market")}>Market</button>
        <button className={orderType === "limit" ? "active" : ""} type="button" onClick={() => setOrderType("limit")}>Limit</button>
      </div>
      <div className="v40-field amount">
        <span>$</span>
        <input value={amount} type="number" min={5} onChange={(event) => setAmount(Math.max(5, Number(event.target.value) || 5))} />
      </div>
      {orderType === "limit" ? (
        <div className="v40-field amount">
          <span>$</span>
          <input
            value={limitPrice.toFixed(3)}
            type="number"
            min={0.001}
            max={0.999}
            step={0.001}
            onChange={(event) => setLimitPrice(clampPrice(Number(event.target.value) || 0.001))}
          />
        </div>
      ) : null}
      <div className="v40-summary summary">
        <div><span>Side</span><b>{selectedOutcome}</b></div>
        <div><span>Price</span><b>${entryPrice.toFixed(3)}</b></div>
        <div><span>Shares</span><b>{quote.shares.toFixed(2)}</b></div>
        <div><span>NexMarkets fee</span><b>${quote.nexMarketsFee.toFixed(2)}</b></div>
        <div><span>Trading account</span><b>{tradingAccount ? shortAddress(tradingAccount.funderAddress) : "Ready after signing"}</b></div>
        <div><span>Liquidity</span><b>{liquidity}</b></div>
        <div><span>24h volume</span><b>{volume24h}</b></div>
      </div>
      {message ? <div className="wallet-note route-status"><b>Status:</b> {message}</div> : null}
      {wallet.user ? (
        <button className="execute" type="button" disabled={busy || wallet.busy} onClick={routeOrder}>
          {busy ? "Working..." : "Sign and Place Order"}
        </button>
      ) : (
        <WalletChoiceButton authenticated={false} onSign={() => void wallet.ensureSignedIn().catch((error) => setMessage(error.message))} onDisconnect={wallet.disconnect} />
      )}
      <p className="v40-risk risk-line">Your wallet signs the order. NexMarkets saves the receipt, points and proof after it is placed.</p>
    </aside>
  );
}
