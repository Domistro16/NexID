"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { useWalletSession } from "@/components/nexid/shared/wallet-session";
import { erc20Abi, formatUsdcUnits, nativeBinaryMarketAbi, nativeMarketAddresses } from "@/lib/contracts/nexmarkets";
import { recordNativeMarketTradeApi } from "@/lib/services/nexid-client";
import type { Side } from "@/lib/types/nexid";

type NativeTradeTicketProps = {
  marketId: string;
  chainId: number;
  contractAddress: string;
  status: string;
};

const MAX_NATIVE_TRADE_GAS = BigInt(1_500_000);
const NATIVE_TRADE_GAS_BUFFER = BigInt(50_000);
const CENT = "\u00a2";
type NativeOrderType = "market" | "limit";

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function sideIndex(side: Side) {
  return side === "ride" ? 0 : 1;
}

function priceLabel(value?: bigint) {
  if (value == null) return "-";
  return `${Math.round(Number(value) / 100)}${CENT}`;
}

function sharesLabel(value?: bigint) {
  if (value == null) return "-";
  const formatted = Number(formatUnits(value, 6));
  return formatted.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function moneyLabel(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
}

function payoutLabel(value?: bigint) {
  if (value == null) return "-";
  return moneyLabel(Number(formatUnits(value, 6)));
}

function clampLimitCents(value: number) {
  return Math.max(1, Math.min(99, Math.round(value || 1)));
}

function paddedGasLimit(estimate: bigint) {
  const padded = (estimate * BigInt(130)) / BigInt(100) + NATIVE_TRADE_GAS_BUFFER;
  if (padded > MAX_NATIVE_TRADE_GAS) {
    throw new Error("This trade is not ready to complete. Try a smaller amount or wait for the market to finish opening.");
  }
  return padded;
}

export function NativeTradeTicket({ marketId, chainId, contractAddress, status }: NativeTradeTicketProps) {
  const [side, setSide] = useState<Side>("ride");
  const [orderType, setOrderType] = useState<NativeOrderType>("market");
  const [amount, setAmount] = useState(25);
  const [limitPrice, setLimitPrice] = useState(50);
  const [expiry, setExpiry] = useState("GTC");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmedAllowance, setConfirmedAllowance] = useState<bigint | null>(null);
  const wallet = useWalletSession();
  const { address } = useAccount();
  const activeChainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const addresses = useMemo(() => nativeMarketAddresses(chainId), [chainId]);
  const marketAddress = contractAddress as Address;
  const collateralAddress = addresses.collateral;
  const notional = parseUnits(String(amount || 0), 6);

  const quoteQuery = useReadContract({
    address: marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "quoteBuy",
    args: [sideIndex(side), notional],
    chainId,
    query: { enabled: amount > 0 && Boolean(contractAddress) }
  });
  const statusQuery = useReadContract({
    address: marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "status",
    chainId,
    query: { enabled: Boolean(contractAddress) }
  });
  const balanceQuery = useReadContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId,
    query: { enabled: Boolean(address && collateralAddress) }
  });
  const allowanceQuery = useReadContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? "0x0000000000000000000000000000000000000000", marketAddress],
    chainId,
    query: { enabled: Boolean(address && collateralAddress && contractAddress) }
  });

  const quote = Array.isArray(quoteQuery.data) ? quoteQuery.data : null;
  const fee = quote?.[0] ?? (notional * BigInt(200) / BigInt(10_000));
  const quotedShares = quote?.[1];
  const priceBps = quote?.[2];
  const requiredAllowance = notional + fee;
  const currentAllowance = confirmedAllowance && confirmedAllowance > (allowanceQuery.data ?? BigInt(0))
    ? confirmedAllowance
    : allowanceQuery.data ?? BigInt(0);
  const hasAllowance = currentAllowance >= requiredAllowance;
  const hasBalance = (balanceQuery.data ?? BigInt(0)) >= requiredAllowance;
  const onchainStatus = Number(statusQuery.data ?? -1);
  const canAttemptTrade = status === "trading_live" || onchainStatus === 1;
  const marketFillLabel = priceLabel(priceBps);
  const limitFillLabel = `${limitPrice}${CENT}`;
  const fillLabel = orderType === "limit" ? limitFillLabel : marketFillLabel;
  const estimatedShares = orderType === "market" && quotedShares
    ? Number(formatUnits(quotedShares, 6))
    : amount / Math.max(limitPrice / 100, 0.01);
  const sharesDisplay = orderType === "market" ? sharesLabel(quotedShares) : estimatedShares.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const payoutDisplay = orderType === "market" ? payoutLabel(quotedShares) : moneyLabel(estimatedShares);

  useEffect(() => {
    setConfirmedAllowance(null);
  }, [address, collateralAddress, marketAddress, chainId]);

  async function ensureReady() {
    const user = await wallet.ensureSignedIn();
    if (!collateralAddress) throw new Error("Payments are not ready for this market.");
    if (!address) throw new Error("Choose a wallet before trading this market.");
    if (user.walletAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error("Connected wallet does not match your signed-in NexMarkets account.");
    }
    if (!canAttemptTrade) throw new Error("This market is not open for trading yet.");
    if (activeChainId !== chainId) {
      setMessage("Switching your wallet to the right network.");
      await switchChainAsync({ chainId });
    }
    if (!hasBalance) throw new Error("Your wallet does not have enough USDC for the trade and fee.");
    return user;
  }

  async function approve() {
    setBusy(true);
    setMessage("Preparing payment approval.");
    try {
      await ensureReady();
      const hash = await writeContractAsync({
        address: collateralAddress!,
        abi: erc20Abi,
        functionName: "approve",
        args: [marketAddress, requiredAllowance],
        chainId
      });
      if (!publicClient) throw new Error("Market connection is still loading. Try again.");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Payment approval was rejected or failed.");
      const nextAllowance = await publicClient.readContract({
        address: collateralAddress!,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address!, marketAddress]
      });
      setConfirmedAllowance(nextAllowance);
      await Promise.all([allowanceQuery.refetch(), balanceQuery.refetch()]);
      setMessage(nextAllowance >= requiredAllowance
        ? "Approval confirmed. You can place the trade now."
        : `Approval confirmed, but your spending limit is still ${formatUsdcUnits(nextAllowance)} USDC. Try approving again from your wallet.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setBusy(false);
    }
  }

  async function trade() {
    setBusy(true);
    setMessage("Preparing your Ride/Fade position.");
    try {
      const user = await ensureReady();
      if (!hasAllowance) throw new Error("Approve the trade amount and fee first.");
      if (!publicClient) throw new Error("Market connection is still loading. Try again.");
      if (!address) throw new Error("Choose a wallet before trading this market.");
      await recordNativeMarketTradeApi(marketId, {
        side,
        amount,
        walletAddress: user.walletAddress,
        chainId
      });
      const gasEstimate = await publicClient.estimateContractGas({
        account: address,
        address: marketAddress,
        abi: nativeBinaryMarketAbi,
        functionName: "buy",
        args: [sideIndex(side), notional]
      });
      const hash = await writeContractAsync({
        address: marketAddress,
        abi: nativeBinaryMarketAbi,
        functionName: "buy",
        args: [sideIndex(side), notional],
        gas: paddedGasLimit(gasEstimate),
        chainId
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The trade was rejected or failed.");
      const recorded = await recordNativeMarketTradeApi(marketId, {
        side,
        amount,
        walletAddress: user.walletAddress,
        chainId,
        txHash: hash as Hex
      });
      const nextAllowance = await publicClient.readContract({
        address: collateralAddress!,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, marketAddress]
      });
      setConfirmedAllowance(nextAllowance);
      await Promise.all([balanceQuery.refetch(), allowanceQuery.refetch(), quoteQuery.refetch(), statusQuery.refetch()]);
      setMessage(`Position saved. Receipt ${recorded.receipt?.id ?? "created"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Trade failed.");
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
      setMessage(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function executeTicket() {
    if (!wallet.user) {
      await signIn();
      return;
    }
    if (orderType === "limit") {
      setMessage("Native limit orders are not available on this contract yet. Use Market order to trade now.");
      return;
    }
    if (!hasAllowance) {
      await approve();
      return;
    }
    await trade();
  }

  const executeLabel = busy
    ? "Working..."
    : !wallet.user
      ? "Sign in to trade"
      : !canAttemptTrade
        ? "Market not open"
        : orderType === "limit"
          ? "Place limit order"
          : !hasBalance
            ? "Insufficient USDC"
            : !hasAllowance
              ? "Approve USDC"
              : side === "ride"
                ? "Ride now"
                : "Fade now";

  return (
    <aside className="v40-ticket ticket">
      <h3>Trade this market</h3>
      <div className="v40-seg side-toggle">
        <button className={cls("ride", side === "ride" && "active")} type="button" onClick={() => setSide("ride")}>
          Ride
        </button>
        <button className={cls("fade", side === "fade" && "active")} type="button" onClick={() => setSide("fade")}>
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
              type="number"
              value={limitPrice}
              min={1}
              max={99}
              onChange={(event) => setLimitPrice(clampLimitCents(Number(event.target.value)))}
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
        <input value={amount} type="number" min={1} onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))} />
      </div>
      <div className="v40-summary summary">
        <div><span>{orderType === "market" ? "Average fill" : "Limit price"}</span><b>{fillLabel}</b></div>
        <div><span>Estimated shares</span><b>{sharesDisplay}</b></div>
        <div><span>Max payout</span><b>{payoutDisplay}</b></div>
        <div><span>Receipt</span><b>{orderType === "market" ? "Generated now" : "Generated when filled"}</b></div>
      </div>
      {message ? <div className="wallet-note route-status"><b>Status:</b> {message}</div> : null}
      <button className="execute" type="button" disabled={busy || (wallet.user && !hasBalance && orderType === "market") || !canAttemptTrade} onClick={() => void executeTicket()}>
        {executeLabel}
      </button>
      {!canAttemptTrade ? <p className="v40-risk risk-line">Trading opens after the launch cooldown finishes.</p> : null}
      <p className="v40-risk risk-line">Review the rule, source and close time before signing.</p>
    </aside>
  );
}
