"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { WalletChoiceButton, useWalletSession } from "@/components/nexid/shared/wallet-session";
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

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function sideIndex(side: Side) {
  return side === "ride" ? 0 : 1;
}

function priceLabel(value?: bigint) {
  if (value == null) return "-";
  return `${(Number(value) / 100).toFixed(2)}%`;
}

function sharesLabel(value?: bigint) {
  if (value == null) return "-";
  const formatted = Number(formatUnits(value, 6));
  return formatted.toLocaleString(undefined, { maximumFractionDigits: 2 });
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
  const [amount, setAmount] = useState(25);
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

  return (
    <aside className="ticket">
      <h3>{side === "ride" ? "Ride" : "Fade"} This Market</h3>
      <div className="side-toggle">
        <button className={cls("ride", side === "ride" && "active")} type="button" onClick={() => setSide("ride")}>
          <span>Ride</span><b>Yes</b>
        </button>
        <button className={cls("fade", side === "fade" && "active")} type="button" onClick={() => setSide("fade")}>
          <span>Fade</span><b>No</b>
        </button>
      </div>
      <div className="amount">
        <span>$</span>
        <input value={amount} type="number" min={1} onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))} />
      </div>
      <div className="summary">
        <div><span>Price</span><b>{priceLabel(priceBps)}</b></div>
        <div><span>Shares</span><b>{sharesLabel(quotedShares)}</b></div>
        <div><span>Fee</span><b>{formatUsdcUnits(fee)} USDC</b></div>
        <div><span>Total</span><b>{formatUsdcUnits(requiredAllowance)} USDC</b></div>
        <div><span>Balance</span><b>{formatUsdcUnits(balanceQuery.data)} USDC</b></div>
        <div><span>Approval</span><b>{hasAllowance ? "Approved" : `${formatUsdcUnits(currentAllowance)} USDC`}</b></div>
      </div>
      {message ? <div className="wallet-note route-status"><b>Status:</b> {message}</div> : null}
      {wallet.user ? (
        <>
          <button className="btn execute-secondary" type="button" disabled={busy || hasAllowance || !hasBalance || !canAttemptTrade} onClick={approve}>
            {hasAllowance ? "Approved" : "Approve USDC"}
          </button>
          <button className="execute" type="button" disabled={busy || !hasAllowance || !hasBalance || !canAttemptTrade} onClick={trade}>
            {busy ? "Working..." : "Buy Shares"}
          </button>
        </>
      ) : (
        <WalletChoiceButton authenticated={false} onSign={() => void wallet.ensureSignedIn().catch((error) => setMessage(error.message))} onDisconnect={wallet.disconnect} />
      )}
      {!canAttemptTrade ? <p className="risk-line">Trading opens after the launch cooldown finishes.</p> : null}
      <p className="risk-line">This position follows the question and source shown above. Receipts appear after the trade is confirmed.</p>
    </aside>
  );
}
