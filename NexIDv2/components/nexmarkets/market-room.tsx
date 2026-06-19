"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWalletClient, useWriteContract } from "wagmi";
import { useWalletSession } from "@/components/nexid/shared/wallet-session";
import { marketOriginDetail, toTitleLabel } from "@/components/nexmarkets/copy";
import {
  compactUsd,
  marketPriceLabel,
  marketUiSummary,
  numberArray,
  polymarketRouteRaw,
  stringArray
} from "@/components/nexmarkets/market-ui";
import { waitForAllowanceConfirmation } from "@/lib/client/approval-confirmation";
import { projectNativeTradePayout } from "@/lib/client/native-payout";
import { userFacingTransactionError } from "@/lib/client/transaction-error";
import { erc20Abi, formatUsdcUnits, nativeBinaryMarketAbi, nativeMarketAddresses, nativeTargetOrderExecutorAbi } from "@/lib/contracts/nexmarkets";
import {
  cancelNativeTargetOrderApi,
  fetchMarketCommentsApi,
  fetchMarketOrderbookApi,
  fetchNativeTargetOrdersApi,
  fetchPolymarketTradingAccountApi,
  placeNativeTargetOrderApi,
  placeMarketOrderbookOrderApi,
  postMarketCommentApi,
  recordNativeMarketTradeApi,
  recordPolymarketRouteOrderApi,
  type MarketComment,
  type NativeTargetOrder
} from "@/lib/services/nexid-client";
import { placeUserSignedPolymarketOrder } from "@/lib/services/polymarketUserExecution";
import { ProofFlowPanel } from "./proof-flow-panel";
import type { PublicMarketActivity } from "@/lib/services/marketActivityService";
import type { OrderType, PolymarketTradingAccount, Side } from "@/lib/types/nexid";
import type { NexMarket } from "@/lib/types/nexmarkets";
import type { MarketOrderbookLevel, PublicMarketOrderbook } from "@/lib/types/orderbook";

type DetailTab = "rules" | "settlement" | "trades" | "comments" | "holders";
type MobileView = "trade" | "chart";
type ChartLayer = "probability" | "volume" | "events";
type ChartTimeframe = "1H" | "1D" | "1W" | "1M" | "All";
type ReceiptTab = "orders" | "holdings";
type HolderView = "holders" | "info";
type CommentFilter = "all" | Side | "holder" | "creator";
type WhaleMode = "pie" | "table";
type Engine = "curve" | "orderbook";
type CustomStyle = CSSProperties & Record<`--${string}`, string | number>;
type CurveBand = {
  move: string;
  cost: number;
  after: string;
  width: number;
};

type ReceiptRecord = {
  id: string;
  market: string;
  marketId: string;
  side: Side;
  amount: string;
  shares: string;
  entry: string;
  kind: "market" | "limit";
  engine: Engine;
  status: string;
  user: string;
  time: string;
  receiptUrl?: string;
  source?: "native_target_order" | "market_orderbook" | "local";
  executorAddress?: string | null;
  executorOrderId?: string | null;
  cancelable?: boolean;
  walletAddress?: string;
};

const CENT = "\u00a2";
const POLYGON_CHAIN_ID = 137;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const MAX_NATIVE_TRADE_GAS = BigInt(1_500_000);
const NATIVE_TRADE_GAS_BUFFER = BigInt(50_000);
const DEFAULT_NATIVE_LAUNCH_STAKE_USDC = 20;
const NATIVE_PRICE_BPS_DENOMINATOR = BigInt(10_000);
const NATIVE_VIRTUAL_SHARES = BigInt(100_000_000);

const ICON_PATHS: Record<string, string> = {
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  star: "M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  chart: "M4 19V5m0 14h17M7 15l4-4 3 3 5-7",
  rules: "M7 3h8l4 4v14H7V3zm8 0v5h5M10 13h7M10 17h7",
  settle: "M20 6L9 17l-5-5",
  trades: "M4 7h16M4 12h16M4 17h16",
  chat: "M5 5h14v10H8l-3 3V5z",
  holders: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  book: "M5 6h14M5 12h14M5 18h14M8 4v16M16 4v16",
  trade: "M7 7h10l-2-2m2 2-2 2M17 17H7l2 2m-2-2 2-2",
  back: "M15 18l-6-6 6-6"
};

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name] ?? ICON_PATHS.trade} />
    </svg>
  );
}

function varStyle(values: Record<`--${string}`, string | number>): CustomStyle {
  return values as CustomStyle;
}

function sideIndex(side: Side) {
  return side === "ride" ? 0 : 1;
}

function marketEngine(market: NexMarket): Engine {
  return market.origin === "polymarket" ? "orderbook" : "curve";
}

function kind(market: NexMarket) {
  return market.origin === "native" ? "Native" : "Routed";
}

function kindClass(market: NexMarket) {
  return kind(market).toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampPrice(value: number) {
  return Math.max(0.001, Math.min(0.999, Math.round(value * 1000) / 1000));
}

function clampCents(value: number) {
  return Math.max(1, Math.min(99, Math.round(value || 1)));
}

function curveLiquidityUsdc(activity: PublicMarketActivity, orderbook: PublicMarketOrderbook | null, onchainLiquidity?: number | null) {
  const onchain = Number(onchainLiquidity ?? 0);
  if (Number.isFinite(onchain) && onchain > 0) return onchain;
  const nativePool = Number(activity.native.collateralUsdc ?? 0) + Number(activity.native.launchStakeUsdc ?? 0);
  if (Number.isFinite(nativePool) && nativePool > 0) return nativePool;
  const orderbookLiquidity = Number(orderbook?.stats.liquidityUsdc ?? 0);
  if (Number.isFinite(orderbookLiquidity) && orderbookLiquidity > 0) return orderbookLiquidity;
  const visibleDepth = Number(orderbook?.stats.visibleDepthUsdc ?? 0);
  return Number.isFinite(visibleDepth) && visibleDepth > 0 ? visibleDepth : 0;
}

function curveProjection(amount: number, currentPrice: number, side: Side, liquidityUsdc: number) {
  const cur = clampCents(currentPrice * 100);
  const impact = liquidityUsdc > 0 && amount > 0
    ? Math.max(1, Math.min(9, Math.ceil(amount / Math.max(25_000, liquidityUsdc) * 100)))
    : 0;
  return {
    cur,
    impact,
    after: clamp(cur + (side === "ride" ? impact : -impact), 1, 99)
  };
}

function bpsToCents(value: bigint | number | null | undefined) {
  if (value == null) return null;
  return clampCents(Number(value) / 100);
}

function projectedNativePriceBps(side: Side, rideSharesTotal: bigint, fadeSharesTotal: bigint, tradeShares: bigint) {
  const rideShares = side === "ride" ? rideSharesTotal + tradeShares : rideSharesTotal;
  const fadeShares = side === "fade" ? fadeSharesTotal + tradeShares : fadeSharesTotal;
  const sideShares = side === "ride" ? rideShares : fadeShares;
  const oppositeShares = side === "ride" ? fadeShares : rideShares;
  let price = ((sideShares + NATIVE_VIRTUAL_SHARES) * NATIVE_PRICE_BPS_DENOMINATOR) / (sideShares + oppositeShares + (BigInt(2) * NATIVE_VIRTUAL_SHARES));
  if (price < BigInt(100)) price = BigInt(100);
  if (price > BigInt(9_900)) price = BigInt(9_900);
  return price;
}

function curveQuoteCosts(amount: number) {
  const base = Math.max(1, Number.isFinite(amount) && amount > 0 ? amount : 100);
  return [0.25, 0.5, 1, 2.5, 5].map((multiplier) => Math.max(1, Math.round(base * multiplier * 100) / 100));
}

function fallbackCurveBands(amount: number, currentPrice: number, side: Side, liquidityUsdc: number): CurveBand[] {
  const { cur } = curveProjection(amount, currentPrice, side, liquidityUsdc);
  const costs = liquidityUsdc > 0
    ? [1, 2, 3, 5, 8].map((_, index) => Math.round((liquidityUsdc / 120) * (1 + index * 0.72)))
    : [0, 0, 0, 0, 0];
  return [1, 2, 3, 5, 8].map((step, index) => {
    const next = liquidityUsdc > 0 ? clamp(cur + (side === "ride" ? step : -step), 1, 99) : cur;
    return {
      move: `${cur}${CENT} \u2192 ${next}${CENT}`,
      cost: costs[index] ?? 0,
      after: `${next}${CENT}`,
      width: Math.max(24, 92 - index * 12)
    };
  });
}

function centsLabel(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}${CENT}`;
}

function centsFromWhole(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${Math.round(value)}${CENT}`;
}

function moneyLabel(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "$0";
  return `$${amount.toLocaleString(undefined, {
    maximumFractionDigits: amount >= 100 ? 0 : 2
  })}`;
}

function sharesLabel(value: number | bigint | null | undefined) {
  if (value == null) return "-";
  const amount = typeof value === "bigint" ? Number(formatUnits(value, 6)) : value;
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString(undefined, { maximumFractionDigits: amount >= 100 ? 0 : 2 });
}

function compactNumber(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString(undefined, { maximumFractionDigits: amount >= 100 ? 0 : 2 });
}

function dateLabel(value?: string | null) {
  if (!value) return "Listed close time";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Listed close time";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function relativeTime(value?: string | null) {
  if (!value) return "now";
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return "now";
  const diff = Math.max(0, Date.now() - parsed);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return dateLabel(value);
}

function hostLabel(value?: string | null) {
  if (!value) return "Public source";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Source linked";
  }
}

function profileHref(identity: string) {
  const clean = identity.trim();
  if (!clean) return "/dashboard";
  return `/id/${encodeURIComponent(clean.replace(/\.id$/i, ""))}`;
}

function agentPublicLabel(value?: string | null) {
  const clean = String(value ?? "").trim().replace(/\.id$/i, "");
  return clean ? `${clean}.id` : null;
}

function marketIsClosed(status: NexMarket["status"]) {
  return ["closed", "result_proposed", "disputed", "settled", "invalid_refund"].includes(status);
}

function marketNoPriceLabel(market: NexMarket, value: number | null) {
  if (market.origin === "native") {
    if (market.status === "invalid_refund" || market.finalOutcome === "invalid") return "Refund";
    if (market.status === "settled" && market.finalOutcome === "ride") return centsLabel(0);
    if (market.status === "settled" && market.finalOutcome === "fade") return centsLabel(1);
  }
  return centsLabel(value === null ? null : 1 - value);
}

function sidePriceValue(basePrice: number | null, side: Side) {
  const ride = clampPrice(basePrice ?? 0.5);
  return side === "ride" ? ride : clampPrice(1 - ride);
}

function paddedGasLimit(estimate: bigint) {
  const padded = (estimate * BigInt(130)) / BigInt(100) + NATIVE_TRADE_GAS_BUFFER;
  if (padded > MAX_NATIVE_TRADE_GAS) {
    throw new Error("This trade is not ready to complete. Try a smaller amount or wait for the market to finish opening.");
  }
  return padded;
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

function nativeCreatorBondLabel(market: NexMarket, activity: PublicMarketActivity) {
  if (market.origin !== "native") return "-";
  const stake = activity.native.launchStakeUsdc;
  if (stake && stake > 0) return `${compactUsd(stake)} locked`;
  if (
    market.launchStakeStatus === "paid" ||
    ["live_pending_open", "trading_live", "closed", "result_proposed", "disputed", "settled"].includes(market.status)
  ) {
    return `$${DEFAULT_NATIVE_LAUNCH_STAKE_USDC} locked`;
  }
  return "-";
}

function ruleText(market: NexMarket) {
  return {
    source: hostLabel(market.sourceUrl),
    rule: market.yesRule || market.question || "The stated market question decides the winning side.",
    noRule: market.noRule || "Fade wins if the Ride condition is not satisfied at the settlement snapshot.",
    invalidRule: market.invalidRule || "If the primary source is unavailable, the fallback rule applies.",
    fallback: market.invalidRule || "If the primary source is unavailable, the fallback rule applies.",
    calculation: market.auditSummary || market.sourceQualificationReason || "Measurement is taken at the listed close time.",
    outcome: market.yesRule || market.question || "Outcome"
  };
}

function useMarketOrderbook(marketId: string) {
  const [orderbook, setOrderbook] = useState<PublicMarketOrderbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setOrderbook(await fetchMarketOrderbookApi(marketId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Orderbook unavailable.");
      setOrderbook(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [marketId]);

  return { orderbook, loading, error, refresh };
}

function useMarketTargetOrders(marketId: string, enabled: boolean) {
  const [orders, setOrders] = useState<NativeTargetOrder[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!enabled) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setOrders(await fetchNativeTargetOrdersApi(marketId));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [marketId, enabled]);

  return { orders, loading, refresh };
}

function useMarketExecution({
  market,
  engine,
  side,
  orderType,
  amount,
  limitPrice,
  currentPrice,
  prices,
  clobTokenIds,
  onRecord,
  onRefreshOrderbook,
  onRefreshTargetOrders
}: {
  market: NexMarket;
  engine: Engine;
  side: Side;
  orderType: OrderType;
  amount: number;
  limitPrice: number;
  currentPrice: number;
  prices: number[];
  clobTokenIds: string[];
  onRecord: (record: ReceiptRecord, tab: ReceiptTab) => void;
  onRefreshOrderbook: () => void;
  onRefreshTargetOrders?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmedAllowance, setConfirmedAllowance] = useState<bigint | null>(null);
  const [confirmedTargetAllowance, setConfirmedTargetAllowance] = useState<bigint | null>(null);
  const [curveBands, setCurveBands] = useState<CurveBand[]>([]);
  const wallet = useWalletSession();
  const { address } = useAccount();
  const activeChainId = useChainId();
  const walletClient = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [polymarketAccount, setPolymarketAccount] = useState<PolymarketTradingAccount | null>(null);

  useEffect(() => {
    if (market.origin !== "polymarket" || !wallet.user) {
      setPolymarketAccount(null);
      return;
    }
    let active = true;
    fetchPolymarketTradingAccountApi(false)
      .then((res) => {
        if (active && res.account) {
          setPolymarketAccount(res.account);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [market.origin, wallet.user]);

  const nativeChainId = market.chainId ?? undefined;
  const nativeReady = market.origin === "native" && market.status === "trading_live" && Boolean(market.contractAddress && nativeChainId);
  const publicClient = usePublicClient({ chainId: nativeChainId });
  const addresses = useMemo(() => nativeChainId ? nativeMarketAddresses(nativeChainId) : nativeMarketAddresses(), [nativeChainId]);
  const marketAddress = (/^0x[a-fA-F0-9]{40}$/.test(market.contractAddress ?? "") ? market.contractAddress : ZERO_ADDRESS) as Address;
  const hasNativeContract = market.origin === "native" && marketAddress !== ZERO_ADDRESS && Boolean(nativeChainId);
  const collateralAddress = addresses.collateral ?? ZERO_ADDRESS;
  const targetExecutorAddress = addresses.targetOrderExecutor ?? ZERO_ADDRESS;
  const hasCollateral = Boolean(addresses.collateral);
  const hasTargetExecutor = Boolean(addresses.targetOrderExecutor);
  const notional = parseUnits(String(Math.max(0, amount || 0)), 6);

  const quoteQuery = useReadContract({
    address: marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "quoteBuy",
    args: [sideIndex(side), notional],
    chainId: nativeChainId,
    query: { enabled: hasNativeContract && amount > 0 }
  });
  const statusQuery = useReadContract({
    address: marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "status",
    chainId: nativeChainId,
    query: { enabled: hasNativeContract }
  });
  const collateralPoolQuery = useReadContract({
    address: marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "collateralPool",
    chainId: nativeChainId,
    query: { enabled: hasNativeContract }
  });
  const rideSharesTotalQuery = useReadContract({
    address: marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "rideSharesTotal",
    chainId: nativeChainId,
    query: { enabled: hasNativeContract }
  });
  const fadeSharesTotalQuery = useReadContract({
    address: marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "fadeSharesTotal",
    chainId: nativeChainId,
    query: { enabled: hasNativeContract }
  });
  const balanceQuery = useReadContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? ZERO_ADDRESS],
    chainId: nativeChainId,
    query: { enabled: nativeReady && Boolean(address) && hasCollateral }
  });
  const allowanceQuery = useReadContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? ZERO_ADDRESS, marketAddress],
    chainId: nativeChainId,
    query: { enabled: nativeReady && Boolean(address) && hasCollateral }
  });
  const targetAllowanceQuery = useReadContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? ZERO_ADDRESS, targetExecutorAddress],
    chainId: nativeChainId,
    query: { enabled: nativeReady && Boolean(address) && hasCollateral && hasTargetExecutor }
  });

  const POLYGON_PUSD_ADDRESS = "0xc011a7e14c3305b0d0611893c5d6480b342e82df" as Address;

  const polymarketProxyBalanceQuery = useReadContract({
    address: POLYGON_PUSD_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [polymarketAccount?.funderAddress ? (polymarketAccount.funderAddress as Address) : ZERO_ADDRESS],
    chainId: POLYGON_CHAIN_ID,
    query: { enabled: market.origin === "polymarket" && Boolean(polymarketAccount?.funderAddress) }
  });

  const polymarketMainBalanceQuery = useReadContract({
    address: POLYGON_PUSD_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? ZERO_ADDRESS],
    chainId: POLYGON_CHAIN_ID,
    query: { enabled: market.origin === "polymarket" && Boolean(address) }
  });

  const quote = Array.isArray(quoteQuery.data) ? quoteQuery.data : null;
  const fee = quote?.[0] ?? (notional * BigInt(200) / BigInt(10_000));
  const quotedShares = quote?.[1];
  const priceBps = quote?.[2];
  const rideSharesTotal = rideSharesTotalQuery.data ?? null;
  const fadeSharesTotal = fadeSharesTotalQuery.data ?? null;
  const sideSharesTotal = side === "ride"
    ? rideSharesTotal ?? BigInt(0)
    : fadeSharesTotal ?? BigInt(0);
  const projectedPayout = quotedShares && collateralPoolQuery.data != null
    ? projectNativeTradePayout({
      collateralPool: collateralPoolQuery.data,
      sideSharesTotal,
      tradeNotional: notional,
      tradeShares: quotedShares
    })
    : undefined;
  const requiredAllowance = notional + fee;
  const currentAllowance = confirmedAllowance && confirmedAllowance > (allowanceQuery.data ?? BigInt(0))
    ? confirmedAllowance
    : allowanceQuery.data ?? BigInt(0);
  const currentTargetAllowance = confirmedTargetAllowance && confirmedTargetAllowance > (targetAllowanceQuery.data ?? BigInt(0))
    ? confirmedTargetAllowance
    : targetAllowanceQuery.data ?? BigInt(0);
  const hasAllowance = currentAllowance >= requiredAllowance;
  const hasTargetAllowance = currentTargetAllowance >= requiredAllowance;
  const hasBalance = !nativeReady || (balanceQuery.data ?? BigInt(0)) >= requiredAllowance;
  const onchainStatus = Number(statusQuery.data ?? -1);
  const canAttemptNativeTrade = market.status === "trading_live" || onchainStatus === 1;
  const selectedIndex = sideIndex(side);
  const curve = engine === "curve";
  const routeMarketPrice = prices[selectedIndex] ?? currentPrice;
  const routeEntryPrice = orderType === "limit" ? clampPrice(limitPrice / 100) : clampPrice(routeMarketPrice);
  const nativeFillPrice = priceBps == null ? currentPrice : clampPrice(Number(priceBps) / 10_000);
  const entryPrice = curve && orderType === "market" ? nativeFillPrice : routeEntryPrice;
  const estimatedShares = curve && nativeReady && orderType === "market" && quotedShares
    ? Number(formatUnits(quotedShares, 6))
    : amount / Math.max(entryPrice, 0.001);
  const polymarketBalance = polymarketAccount?.funderAddress && polymarketProxyBalanceQuery.data != null
    ? Number(formatUnits(polymarketProxyBalanceQuery.data, 6))
    : (polymarketMainBalanceQuery.data != null ? Number(formatUnits(polymarketMainBalanceQuery.data, 6)) : null);

  const nativeBalance = market.origin === "polymarket"
    ? polymarketBalance
    : (balanceQuery.data == null ? null : Number(formatUnits(balanceQuery.data, 6)));
  const nativeLiquidityUsdc = collateralPoolQuery.data == null ? null : Number(formatUnits(collateralPoolQuery.data, 6));
  const curveTradeAfterCents = curve && quotedShares && rideSharesTotal != null && fadeSharesTotal != null
    ? bpsToCents(projectedNativePriceBps(side, rideSharesTotal, fadeSharesTotal, quotedShares))
    : null;

  useEffect(() => {
    setConfirmedAllowance(null);
    setConfirmedTargetAllowance(null);
  }, [address, collateralAddress, marketAddress, nativeChainId, targetExecutorAddress]);

  useEffect(() => {
    let cancelled = false;

    async function readCurveBands() {
      if (!curve || !hasNativeContract || !publicClient || rideSharesTotal == null || fadeSharesTotal == null) {
        setCurveBands([]);
        return;
      }
      const costs = curveQuoteCosts(amount);
      const rows = await Promise.all(costs.map(async (cost, index): Promise<CurveBand | null> => {
        try {
          const notional = parseUnits(String(cost), 6);
          const quoteRow = await publicClient.readContract({
            address: marketAddress,
            abi: nativeBinaryMarketAbi,
            functionName: "quoteBuy",
            args: [sideIndex(side), notional]
          }) as readonly [bigint, bigint, bigint];
          const shares = quoteRow[1];
          const currentCents = bpsToCents(quoteRow[2]) ?? clampCents(currentPrice * 100);
          const afterCents = bpsToCents(projectedNativePriceBps(side, rideSharesTotal, fadeSharesTotal, shares)) ?? currentCents;
          return {
            move: `${currentCents}${CENT} \u2192 ${afterCents}${CENT}`,
            cost,
            after: `${afterCents}${CENT}`,
            width: Math.max(24, 92 - index * 12)
          };
        } catch {
          return null;
        }
      }));
      if (!cancelled) setCurveBands(rows.filter((row): row is CurveBand => Boolean(row)));
    }

    void readCurveBands();
    return () => {
      cancelled = true;
    };
  }, [amount, curve, currentPrice, fadeSharesTotal, hasNativeContract, marketAddress, publicClient, rideSharesTotal, side]);

  async function ensureNativeReady() {
    const user = await wallet.ensureSignedIn();
    if (!nativeReady || !nativeChainId) throw new Error("This native market is not ready for direct trading.");
    if (!hasCollateral) throw new Error("Payments are not ready for this market.");
    if (!address) throw new Error("Choose a wallet before trading this market.");
    if (user.walletAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error("Connected wallet does not match your signed-in NexMarkets account.");
    }
    if (!canAttemptNativeTrade) throw new Error("This market is not open for trading yet.");
    if (activeChainId !== nativeChainId) {
      setMessage("Switching your wallet to the right network.");
      await switchChainAsync({ chainId: nativeChainId });
    }
    if (!hasBalance) throw new Error("Your wallet does not have enough USDC for the trade and fee.");
    return user;
  }

  async function approveNativeTrade() {
    setMessage("Preparing payment approval.");
    await ensureNativeReady();
    if (!nativeChainId) throw new Error("This market network is not ready.");
    const hash = await writeContractAsync({
      address: collateralAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [marketAddress, requiredAllowance],
      chainId: nativeChainId
    });
    if (!publicClient) throw new Error("Market connection is still loading. Try again.");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Payment approval was rejected or failed.");
    setMessage("Approval transaction confirmed. Waiting for Base to reflect the allowance.");
    setConfirmedAllowance(requiredAllowance);
    const confirmation = await waitForAllowanceConfirmation({
      requiredAllowance,
      readAllowance: () => publicClient.readContract({
        address: collateralAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address!, marketAddress]
      }),
      onRetry: () => setMessage("Approval confirmed onchain. Base is still reflecting the allowance.")
    });
    setConfirmedAllowance(confirmation.reflected ? confirmation.allowance : requiredAllowance);
    await Promise.all([allowanceQuery.refetch(), balanceQuery.refetch()]);
    setMessage(confirmation.reflected
      ? "Approval confirmed. You can place the trade now."
      : `Approval confirmed onchain. Base has not reflected the allowance read yet; latest read is ${formatUsdcUnits(confirmation.allowance)} USDC. You can try the trade now or wait a few seconds and refresh.`);
  }

  async function approveNativeTargetOrder() {
    setMessage("Preparing target order escrow approval.");
    await ensureNativeReady();
    if (!nativeChainId) throw new Error("This market network is not ready.");
    if (!hasTargetExecutor) throw new Error("Native target order executor is not configured.");
    const hash = await writeContractAsync({
      address: collateralAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [targetExecutorAddress, requiredAllowance],
      chainId: nativeChainId
    });
    if (!publicClient) throw new Error("Market connection is still loading. Try again.");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Target order approval was rejected or failed.");
    setMessage("Target approval confirmed. Waiting for Base to reflect the allowance.");
    setConfirmedTargetAllowance(requiredAllowance);
    const confirmation = await waitForAllowanceConfirmation({
      requiredAllowance,
      readAllowance: () => publicClient.readContract({
        address: collateralAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address!, targetExecutorAddress]
      }),
      onRetry: () => setMessage("Target approval confirmed onchain. Base is still reflecting the allowance.")
    });
    setConfirmedTargetAllowance(confirmation.reflected ? confirmation.allowance : requiredAllowance);
    await Promise.all([targetAllowanceQuery.refetch(), balanceQuery.refetch()]);
    setMessage(confirmation.reflected
      ? "Target approval confirmed. You can set the target price now."
      : `Target approval confirmed onchain. Base has not reflected the allowance read yet; latest read is ${formatUsdcUnits(confirmation.allowance)} USDC.`);
  }

  async function tradeNativeMarket() {
    const user = await ensureNativeReady();
    if (!hasAllowance) throw new Error("Approve the trade amount and fee first.");
    if (!publicClient) throw new Error("Market connection is still loading. Try again.");
    if (!address) throw new Error("Choose a wallet before trading this market.");
    if (!nativeChainId) throw new Error("This market network is not ready.");
    await recordNativeMarketTradeApi(market.id, {
      side,
      amount,
      walletAddress: user.walletAddress,
      chainId: nativeChainId
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
      chainId: nativeChainId
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The trade was rejected or failed.");
    const recorded = await recordNativeMarketTradeApi(market.id, {
      side,
      amount,
      walletAddress: user.walletAddress,
      chainId: nativeChainId,
      txHash: hash as Hex
    });
    const nextAllowance = await publicClient.readContract({
      address: collateralAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, marketAddress]
    });
    setConfirmedAllowance(nextAllowance);
    await Promise.all([
      balanceQuery.refetch(),
      allowanceQuery.refetch(),
      quoteQuery.refetch(),
      statusQuery.refetch(),
      collateralPoolQuery.refetch(),
      rideSharesTotalQuery.refetch(),
      fadeSharesTotalQuery.refetch()
    ]);
    onRecord({
      id: recorded.receipt?.id ?? hash,
      market: market.title,
      marketId: market.id,
      side,
      amount: moneyLabel(amount),
      shares: sharesLabel(quotedShares),
      entry: centsLabel(nativeFillPrice),
      kind: "market",
      engine: "curve",
      status: "Live",
      user: user.primaryDomainName ?? user.displayName ?? "you",
      time: "now",
      receiptUrl: recorded.receipt?.id ? `/market/${market.id}` : undefined
    }, "holdings");
    setMessage(`Position saved. Receipt ${recorded.receipt?.id ?? "created"}.`);
  }

  async function placeNativeTargetOrder() {
    const user = await ensureNativeReady();
    if (!hasTargetExecutor) throw new Error("Native target order executor is not configured.");
    if (!hasTargetAllowance) throw new Error("Approve the target order escrow first.");
    if (!publicClient) throw new Error("Market connection is still loading. Try again.");
    if (!address) throw new Error("Choose a wallet before trading this market.");
    if (!nativeChainId) throw new Error("This market network is not ready.");
    const targetPrice = clampPrice(limitPrice / 100);
    const maxPriceBps = BigInt(Math.round(targetPrice * 10_000));
    setMessage("Confirm the target order escrow in your wallet.");
    const gasEstimate = await publicClient.estimateContractGas({
      account: address,
      address: targetExecutorAddress,
      abi: nativeTargetOrderExecutorAbi,
      functionName: "createOrder",
      args: [marketAddress, sideIndex(side), notional, maxPriceBps, BigInt(0)]
    });
    const hash = await writeContractAsync({
      address: targetExecutorAddress,
      abi: nativeTargetOrderExecutorAbi,
      functionName: "createOrder",
      args: [marketAddress, sideIndex(side), notional, maxPriceBps, BigInt(0)],
      gas: paddedGasLimit(gasEstimate),
      chainId: nativeChainId
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Target order transaction was rejected or failed.");
    setMessage("Saving target order.");
    const recorded = await placeNativeTargetOrderApi(market.id, {
      side,
      amount,
      targetPrice,
      walletAddress: user.walletAddress,
      chainId: nativeChainId,
      executorAddress: targetExecutorAddress,
      txHash: hash as Hex
    });
    const nextAllowance = await publicClient.readContract({
      address: collateralAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, targetExecutorAddress]
    });
    setConfirmedTargetAllowance(nextAllowance);
    await Promise.all([
      balanceQuery.refetch(),
      targetAllowanceQuery.refetch(),
      quoteQuery.refetch(),
      collateralPoolQuery.refetch(),
      rideSharesTotalQuery.refetch(),
      fadeSharesTotalQuery.refetch()
    ]);
    onRecord({
      id: recorded.id,
      market: market.title,
      marketId: market.id,
      side,
      amount: moneyLabel(recorded.amountUsdc),
      shares: sharesLabel(recorded.amountUsdc / Math.max(recorded.targetPrice, 0.001)),
      entry: centsLabel(recorded.targetPrice),
      kind: "limit",
      engine: "curve",
      status: toTitleLabel(recorded.status),
      user: user.primaryDomainName ?? user.displayName ?? "you",
      time: "now",
      source: "native_target_order",
      executorAddress: recorded.executorAddress,
      executorOrderId: recorded.executorOrderId,
      cancelable: recorded.status === "open"
    }, "orders");
    onRefreshTargetOrders?.();
    setMessage(`Target order saved at ${centsLabel(recorded.targetPrice)}.`);
  }

  async function routePolymarketOrder() {
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
      price: routeEntryPrice
    });
    if (execution.walletAddress.toLowerCase() !== user.walletAddress.toLowerCase()) {
      throw new Error("Connected wallet does not match your signed-in NexMarkets account.");
    }
    setMessage("Saving your NexMarkets proof.");
    const result = await recordPolymarketRouteOrderApi(market.id, {
      side,
      orderType,
      amount,
      entryPrice: routeEntryPrice,
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
    onRecord({
      id: result.receipt.id,
      market: market.title,
      marketId: market.id,
      side,
      amount: moneyLabel(amount),
      shares: sharesLabel(amount / Math.max(routeEntryPrice, 0.001)),
      entry: centsLabel(routeEntryPrice),
      kind: orderType,
      engine: "orderbook",
      status: toTitleLabel(result.execution.fillStatus),
      user: user.primaryDomainName ?? user.displayName ?? "you",
      time: "now",
      receiptUrl: `/market/${market.id}`
    }, orderType === "limit" ? "orders" : "holdings");
    setMessage(`Order sent. ${toTitleLabel(result.execution.fillStatus)}. Receipt saved as ${result.receipt.id}.`);
    void Promise.all([
      polymarketProxyBalanceQuery.refetch(),
      polymarketMainBalanceQuery.refetch()
    ]).catch(() => {});
    onRefreshOrderbook();
  }

  async function placeNexMarketsBookOrder() {
    const user = await wallet.ensureSignedIn();
    const price = clampPrice(limitPrice / 100);
    const result = await placeMarketOrderbookOrderApi(market.id, {
      side,
      direction: "bid",
      price,
      sizeUsdc: amount,
      walletAddress: user.walletAddress
    });
    onRecord({
      id: result.order.id,
      market: market.title,
      marketId: market.id,
      side,
      amount: moneyLabel(result.order.sizeUsdc),
      shares: sharesLabel(result.order.sizeUsdc / Math.max(result.order.price, 0.001)),
      entry: centsLabel(result.order.price),
      kind: "limit",
      engine,
      status: toTitleLabel(result.order.status),
      user: user.primaryDomainName ?? user.displayName ?? "you",
      time: "now"
    }, "orders");
    setMessage(`${engine === "curve" ? "Target order" : "Limit order"} added at ${centsLabel(price)}.`);
    onRefreshOrderbook();
  }

  async function executeTicket() {
    if (busy) return;
    if (amount <= 0) {
      setMessage("Enter an amount to trade.");
      return;
    }
    setBusy(true);
    setMessage(wallet.user ? "Preparing your order." : "Checking your NexMarkets session.");
    try {
      if (marketIsClosed(market.status)) throw new Error("This market has already closed. Trading is disabled.");
      if (market.origin === "polymarket" && activeChainId !== POLYGON_CHAIN_ID) {
        setMessage("Switching your wallet to Polygon Mainnet.");
        await switchChainAsync({ chainId: POLYGON_CHAIN_ID });
        setBusy(false);
        return;
      }
      if (engine === "curve" && orderType === "market") {
        if (!hasAllowance && nativeReady) {
          await approveNativeTrade();
          return;
        }
        await tradeNativeMarket();
        return;
      }
      if (engine === "curve" && orderType === "limit") {
        if (!hasTargetAllowance && nativeReady) {
          await approveNativeTargetOrder();
          return;
        }
        await placeNativeTargetOrder();
        return;
      }
      if (engine === "orderbook" && market.origin === "polymarket" && market.polymarketMarketId) {
        await routePolymarketOrder();
        return;
      }
      await placeNexMarketsBookOrder();
    } catch (error) {
      setMessage(engine === "curve" && orderType === "market"
        ? userFacingTransactionError(error, "Trade failed.")
        : userMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const isPolymarket = market.origin === "polymarket";
  const isWrongChainForPolymarket = isPolymarket && activeChainId !== POLYGON_CHAIN_ID;
  const hasInsufficientPolymarketBalance = isPolymarket && polymarketBalance !== null && polymarketBalance < amount;

  const executeLabel = busy
    ? "Working..."
    : !wallet.user
      ? "Sign in to trade"
      : marketIsClosed(market.status)
        ? "Market closed"
        : isWrongChainForPolymarket
          ? "Switch to Polygon"
          : hasInsufficientPolymarketBalance
            ? "Insufficient USDC"
            : nativeReady && !hasBalance
              ? "Insufficient USDC"
              : orderType === "limit"
                ? nativeReady && engine === "curve" && !hasTargetAllowance
                  ? "Approve USDC"
                  : engine === "curve" ? "Set target price" : "Place limit order"
                : nativeReady && orderType === "market" && !hasAllowance
                  ? "Approve USDC"
                  : side === "ride"
                    ? "Ride now"
                    : "Fade now";

  return {
    message,
    busy: busy || wallet.busy,
    executeLabel,
    executeTicket,
    wallet,
    entryPrice,
    estimatedShares,
    projectedPayout,
    nativeFillPrice,
    nativeBalance,
    nativeLiquidityUsdc,
    curveBands,
    curveTradeAfterCents
  };
}
function getTime(dateValue: string | Date | number | undefined | null) {
  if (!dateValue) return 0;
  const parsed = new Date(dateValue).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function MarketChart({
  market,
  activity,
  side,
  currentPrice,
  amount,
  limitPrice,
  layer,
  timeframe,
  onLayer,
  onTimeframe,
  onSide
}: {
  market: NexMarket;
  activity: PublicMarketActivity;
  side: Side;
  currentPrice: number;
  amount: number;
  limitPrice: number;
  layer: ChartLayer;
  timeframe: ChartTimeframe;
  onLayer: (value: ChartLayer) => void;
  onTimeframe: (value: ChartTimeframe) => void;
  onSide: (value: Side) => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chart = useMemo(() => buildChartSeries(market, activity, side, currentPrice, timeframe), [market, activity, side, currentPrice, timeframe]);
  const w = 760;
  const h = 440;
  const pad = 28;
  const step = chart.values.length > 1 ? (w - pad * 2) / (chart.values.length - 1) : 0;
  const points = chart.values.map((price, index) => [
    pad + index * step,
    pad + (100 - price) / 100 * (h - pad * 2)
  ] as const);
  const line = points.map((point) => point.join(",")).join(" ");
  const area = points.length
    ? `M${points[0][0]},${h - pad} L${points.map((point) => point.join(",")).join(" L")} L${points[points.length - 1][0]},${h - pad} Z`
    : "";
  const current = chart.values[chart.values.length - 1] ?? Math.round(currentPrice * 100);
  const first = chart.values[0] ?? current;
  const delta = current - first;
  const hover = hoverIndex == null ? null : {
    index: hoverIndex,
    x: points[hoverIndex]?.[0] ?? 0,
    y: points[hoverIndex]?.[1] ?? 0,
    value: chart.values[hoverIndex] ?? current,
    label: chart.labels[hoverIndex] ?? "Latest"
  };
  const limitY = pad + (100 - clamp(limitPrice, 1, 99)) / 100 * (h - pad * 2);
  const currentY = pad + (100 - current) / 100 * (h - pad * 2);
  const volumeBars = chart.values.map((price, index) => {
    const previous = chart.values[index - 1] ?? price;
    const barWidth = Math.max(7, step * 0.42);
    const barHeight = 10 + Math.abs(price - previous) * 5 + (index % 3) * 5;
    return (
      <rect
        className="nmx153-volume"
        key={`volume-${index}`}
        x={pad + index * step - barWidth / 2}
        y={h - pad - Math.min(46, barHeight)}
        width={barWidth}
        height={Math.min(46, barHeight)}
        rx="4"
      />
    );
  });
  const indexCounts: Record<number, number> = {};
  const events = chart.receipts.map((receipt, index) => {
    const receiptTime = getTime(receipt.createdAt);
    let closestIndex = 0;
    let minDiff = Infinity;
    
    const isLaunch = receipt.proof === "Agent public launch receipt" || receipt.proof === "Native market launch";
    if (isLaunch) {
      closestIndex = 0;
    } else {
      chart.times.forEach((tTime, idx) => {
        const diff = Math.abs(tTime - receiptTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = idx;
        }
      });
    }

    const point = points[closestIndex] ?? points[points.length - 1] ?? [pad, h / 2];
    const count = indexCounts[closestIndex] ?? 0;
    indexCounts[closestIndex] = count + 1;
    const cx = point[0] + count * 22;

    return { receipt, point: [cx, point[1]] as const, index };
  });
  const gradientId = `nmx153Area-${market.id.replace(/[^a-zA-Z0-9_-]/g, "")}-${side}`;

  function inspect(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const index = clamp(Math.round((x / rect.width) * (chart.values.length - 1)), 0, chart.values.length - 1);
    setHoverIndex(index);
  }

  return (
    <section className="nmx141-chartpanel nmx141-glass" data-nmx156-chart-host>
      <div className="nmx153-chart-shell" data-side={side} data-layer={layer}>
        <header className="nmx153-chart-head">
          <div className="nmx153-headtop">
            <div className="nmx153-title">
              <div className="nmx153-kicker"><i /> Market chart</div>
              <h3>{side === "ride" ? "Ride price" : "Fade price"}</h3>
              <p>Price, volume and market events.</p>
            </div>
            <div className="nmx153-now">
              <strong>{current}{CENT}</strong>
              <span>{delta >= 0 ? "+" : ""}{delta}{CENT}</span>
              <small>{chart.countLabel}</small>
            </div>
          </div>
          <div className="nmx153-controlbar">
            <div className="nmx153-times">
              {(["1H", "1D", "1W", "1M", "All"] as ChartTimeframe[]).map((item) => (
                <button className={timeframe === item ? "active" : ""} key={item} type="button" onClick={() => onTimeframe(item)}>{item}</button>
              ))}
            </div>
            <div className="nmx153-layers">
              {(["probability", "volume", "events"] as ChartLayer[]).map((item) => (
                <button className={layer === item ? "active" : ""} key={item} type="button" onClick={() => onLayer(item)}>{toTitleLabel(item)}</button>
              ))}
            </div>
            <div className="nmx153-side-mini">
              <button className={side === "ride" ? "active" : ""} type="button" onClick={() => onSide("ride")}>Ride</button>
              <button className={side === "fade" ? "active" : ""} type="button" onClick={() => onSide("fade")}>Fade</button>
            </div>
          </div>
        </header>

        <div
          className={cls("nmx153-canvas", hover && "inspecting")}
          onPointerMove={inspect}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="rgba(255,176,0,.23)" />
                <stop offset="1" stopColor="rgba(255,176,0,0)" />
              </linearGradient>
            </defs>
            {[25, 50, 75].map((y) => (
              <line className={y === 50 ? "nmx153-midline" : "nmx153-grid"} key={y} x1={pad} x2={w - pad} y1={pad + (100 - y) / 100 * (h - pad * 2)} y2={pad + (100 - y) / 100 * (h - pad * 2)} />
            ))}
            <line className="nmx153-limit-line" x1={pad} x2={w - pad} y1={limitY} y2={limitY} />
            <path className="nmx153-area" d={area} fill={`url(#${gradientId})`} />
            {volumeBars}
            <polyline className="nmx153-line" points={line} />
            {events.map((event) => (
              <circle className="nmx153-event-ring" key={event.receipt.id} cx={event.point[0]} cy={event.point[1]} r="7" />
            ))}
          </svg>
          <div className="nmx153-axis"><span>100{CENT}</span><span>75{CENT}</span><span>50{CENT}</span><span>25{CENT}</span></div>
          <span className="nmx153-current-pill" style={{ top: `${currentY / h * 100}%` }}>{current}{CENT}</span>
          <span className="nmx153-limit-pill" style={{ top: `${limitY / h * 100}%` }}>Limit {limitPrice}{CENT}</span>
          {events.map((event) => (
            <button
              className="nmx153-event-btn"
              key={`event-${event.receipt.id}`}
              style={{ left: `${event.point[0] / w * 100}%`, top: `${event.point[1] / h * 100}%` }}
              title={event.receipt.title}
              type="button"
            >
              {event.index + 1}
            </button>
          ))}
          <div className="nmx153-cross" style={{ left: hover ? `${hover.x / w * 100}%` : "0%" }} />
          <div
            className="nmx153-tip"
            style={{
              left: hover ? `${hover.x / w * 100}%` : "50%",
              top: hover ? `${hover.y / h * 100}%` : "50%",
              transform: `translate(${hover ? -(hover.x / w) * 100 : -50}%, -118%)`
            }}
          >
            <b>{hover ? `${hover.value}${CENT}` : `${current}${CENT}`}</b>
            <span>{hover ? hover.label : "Latest price"} <em>{side === "ride" ? "Ride" : "Fade"}</em></span>
          </div>
        </div>

        <div className="nmx153-pulse">
          <button type="button"><span>High</span><b>{Math.max(...chart.values)}{CENT}</b><small>{timeframe} range</small></button>
          <button type="button"><span>Low</span><b>{Math.min(...chart.values)}{CENT}</b><small>{timeframe} range</small></button>
          <button type="button"><span>Volume</span><b>{compactUsd(activity.volumeUsdc)}</b><small>Recorded activity</small></button>
          <button className={events.length ? "warning" : ""} type="button"><span>Events</span><b>{events.length}</b><small>Receipts on chart</small></button>
          <button type="button"><span>Trade size</span><b>{moneyLabel(amount)}</b><small>Terminal amount</small></button>
        </div>
      </div>
    </section>
  );
}

function buildChartSeries(market: NexMarket, activity: PublicMarketActivity, side: Side, currentPrice: number, timeframe: ChartTimeframe) {
  const now = Date.now();
  const cutoffs: Record<Exclude<ChartTimeframe, "All">, number> = {
    "1H": 60 * 60_000,
    "1D": 24 * 60 * 60_000,
    "1W": 7 * 24 * 60 * 60_000,
    "1M": 30 * 24 * 60 * 60_000
  };
  const cutoff = timeframe === "All" ? 0 : now - cutoffs[timeframe];
  
  const selectedTrades = activity.trades
    .filter((trade) => {
      if (!trade.yesPrice && !trade.entryPrice) return false;
      if (!cutoff) return true;
      const parsed = getTime(trade.createdAt);
      return parsed >= cutoff;
    })
    .sort((a, b) => getTime(a.createdAt) - getTime(b.createdAt));

  // Determine the baseline start time by finding the oldest trade or receipt, or market creation
  const rawTradeTimes = activity.trades.map((t) => getTime(t.createdAt)).filter(t => t > 0);
  const rawReceiptTimes = activity.receipts.map((r) => getTime(r.createdAt)).filter(r => r > 0);
  const absoluteOldestTime = Math.min(
    getTime(market.createdAt),
    rawTradeTimes.length ? Math.min(...rawTradeTimes) : Infinity,
    rawReceiptTimes.length ? Math.min(...rawReceiptTimes) : Infinity
  );

  const selectedReceipts = activity.receipts
    .filter((receipt) => {
      if (!cutoff) return true;
      const parsed = getTime(receipt.createdAt);
      return parsed >= cutoff;
    })
    .map((receipt) => {
      // Force launch receipt to the start of the timeline to ensure it is chronologically first
      const isLaunch = receipt.proof === "Agent public launch receipt" || receipt.proof === "Native market launch";
      if (isLaunch) {
        return {
          ...receipt,
          createdAt: new Date(absoluteOldestTime - 1000).toISOString()
        };
      }
      return receipt;
    });

  // Sort receipts ascending chronologically so Event 1 is the oldest
  const sortedReceipts = selectedReceipts
    .sort((a, b) => getTime(a.createdAt) - getTime(b.createdAt));

  // Cap the start time so the chart doesn't start before the market birth/launch
  const startTime = cutoff ? Math.max(cutoff, absoluteOldestTime) : absoluteOldestTime;
  const endTime = now;

  // Let's build the price points chronologically
  const chartPoints: Array<{ price: number; time: number }> = [];

  const firstTrade = selectedTrades[0];
  const firstTradeYes = firstTrade 
    ? (firstTrade.yesPrice ?? (firstTrade.side === "ride" ? firstTrade.entryPrice : firstTrade.entryPrice == null ? null : 1 - firstTrade.entryPrice))
    : null;
  const firstTradeSidePrice = firstTradeYes != null
    ? (side === "ride" ? firstTradeYes : 1 - firstTradeYes)
    : currentPrice;

  // Add initial point at startTime
  chartPoints.push({
    price: clamp(Math.round(firstTradeSidePrice * 100), 1, 99),
    time: startTime
  });

  // Add all selected trades
  selectedTrades.forEach((trade) => {
    const yes = trade.yesPrice ?? (trade.side === "ride" ? trade.entryPrice : trade.entryPrice == null ? null : 1 - trade.entryPrice);
    const sidePrice = side === "ride" ? yes : yes == null ? null : 1 - yes;
    chartPoints.push({
      price: clamp(Math.round((sidePrice != null && Number.isFinite(sidePrice) ? sidePrice : currentPrice) * 100), 1, 99),
      time: getTime(trade.createdAt)
    });
  });

  // Add final point at endTime (now)
  chartPoints.push({
    price: clamp(Math.round(currentPrice * 100), 1, 99),
    time: endTime
  });

  const values = chartPoints.map((p) => p.price);
  const labels = chartPoints.map((p) => relativeTime(new Date(p.time).toISOString()));
  const times = chartPoints.map((p) => p.time);

  // Pad to at least 8 elements for horizontal distribution
  while (values.length < 8) {
    values.unshift(values[0] ?? clamp(Math.round(currentPrice * 100), 1, 99));
    labels.unshift(labels[0] ?? relativeTime(new Date(startTime).toISOString()));
    times.unshift(times[0] ?? startTime);
  }

  return {
    values,
    labels,
    times,
    countLabel: selectedTrades.length ? `${selectedTrades.length} real prints` : "No trades yet",
    receipts: sortedReceipts,
    startTime,
    endTime
  };
}

function EngineBook({
  engine,
  activity,
  orderbook,
  loading,
  error,
  side,
  amount,
  currentPrice,
  liquidityUsdc,
  curveBands,
  curveAfterCents
}: {
  engine: Engine;
  activity: PublicMarketActivity;
  orderbook: PublicMarketOrderbook | null;
  loading: boolean;
  error: string;
  side: Side;
  amount: number;
  currentPrice: number;
  liquidityUsdc: number;
  curveBands: CurveBand[];
  curveAfterCents: number | null;
}) {
  if (engine === "curve") {
    return <CurveBook activity={activity} side={side} amount={amount} currentPrice={currentPrice} liquidityUsdc={liquidityUsdc} quoteBands={curveBands} quoteAfterCents={curveAfterCents} />;
  }

  const outcome = side === "ride" ? orderbook?.ride : orderbook?.fade;
  const asks = outcome?.asks.slice(0, 8) ?? [];
  const bids = outcome?.bids.slice(0, 8) ?? [];
  const spread = outcome?.spread ?? (orderbook?.ride.midpoint != null && orderbook.fade.midpoint != null ? Math.abs(orderbook.ride.midpoint - orderbook.fade.midpoint) : null);
  const otherPrice = side === "ride" ? 1 - currentPrice : currentPrice;
  const ridePct = holderRidePct(activity, currentPrice);

  return (
    <section className="nmx141-orderbook nmx141-glass" data-nmx141-engine="orderbook">
      <div className="nmx141-bookhead">
        <div>
          <h3><Icon name="book" /> Orderbook</h3>
          <p>Live bids and asks with size at each price.</p>
        </div>
        <span className="nmx141-spread">Spread {spread == null ? "-" : centsFromWhole(Math.max(1, Math.round(spread * 100)))}</span>
      </div>
      <div className="nmx141-booklabels"><span>Price</span><span>Amount</span><span>Total</span></div>
      <div className="nmx141-ladder">
        <div className="nmx141-levels">
          {loading ? <BookEmpty title="Loading book" copy="Reading current market depth." /> : asks.length ? asks.map((level, index) => <BookRow key={`ask-${level.price}-${index}`} level={level} tone="ask" index={index} total={asks.length} />) : <BookEmpty title="No asks" copy={error || "No visible ask depth on this side."} />}
        </div>
        <div className={`nmx141-mid ${side}`}>
          <div><b>{centsLabel(currentPrice)}</b><span>{side === "ride" ? "Ride" : "Fade"} price</span></div>
          <span>~ {centsLabel(otherPrice)} {side === "ride" ? "Fade" : "Ride"}</span>
        </div>
        <div className="nmx141-levels">
          {loading ? <BookEmpty title="Loading book" copy="Reading current market depth." /> : bids.length ? bids.map((level, index) => <BookRow key={`bid-${level.price}-${index}`} level={level} tone="bid" index={index} total={bids.length} />) : <BookEmpty title="No bids" copy={error || "No visible bid depth on this side."} />}
        </div>
        <div className="nmx141-ratio" style={varStyle({ "--ride": `${ridePct}%` })}><span>{ridePct}% Ride</span><i /><span>{100 - ridePct}% Fade</span></div>
      </div>
    </section>
  );
}

function CurveBook({
  activity,
  side,
  amount,
  currentPrice,
  liquidityUsdc,
  quoteBands,
  quoteAfterCents
}: {
  activity: PublicMarketActivity;
  side: Side;
  amount: number;
  currentPrice: number;
  liquidityUsdc: number;
  quoteBands: CurveBand[];
  quoteAfterCents: number | null;
}) {
  const fallbackProjection = curveProjection(amount, currentPrice, side, liquidityUsdc);
  const cur = fallbackProjection.cur;
  const after = quoteAfterCents ?? fallbackProjection.after;
  const impact = quoteAfterCents == null ? fallbackProjection.impact : Math.abs(after - cur);
  const ridePct = holderRidePct(activity, currentPrice);
  const bands = quoteBands.length ? quoteBands : fallbackCurveBands(amount, currentPrice, side, liquidityUsdc);

  return (
    <section className="nmx141-orderbook nmx141-glass nmx141-curvebook" data-nmx141-engine="curve">
      <div className="nmx141-bookhead">
        <div>
          <h3><Icon name="book" /> Liquidity curve</h3>
          <p>Native trades execute against curve liquidity.</p>
        </div>
        <span className="nmx141-spread">Impact +{impact}{CENT}</span>
      </div>
      <div className="nmx141-booklabels"><span>Move</span><span>Cost</span><span>After</span></div>
      <div className="nmx141-ladder">
        <div className="nmx141-levels">
          {bands.map((row, index) => <CurveRow key={`up-${row.move}-${index}`} row={row} />)}
        </div>
        <div className={`nmx141-mid ${side}`}>
          <div><b>{cur}{CENT}</b><span>{side === "ride" ? "Ride" : "Fade"} curve price</span></div>
          <span>After {after}{CENT} on {moneyLabel(amount)}</span>
        </div>
        <div className="nmx141-levels">
          {bands.slice().reverse().map((row, index) => <CurveRow key={`down-${row.move}-${index}`} row={row} />)}
        </div>
        <div className="nmx141-ratio" style={varStyle({ "--ride": `${ridePct}%` })}><span>{ridePct}% Ride</span><i /><span>{100 - ridePct}% Fade</span></div>
      </div>
    </section>
  );
}

function CurveRow({ row }: { row: CurveBand }) {
  return (
    <div className="nmx141-bookrow bid" style={varStyle({ "--w": `${row.width}%` })}>
      <b>{row.move}</b>
      <span>{moneyLabel(row.cost)}</span>
      <span>{row.after}</span>
    </div>
  );
}

function BookRow({ level, tone, index, total }: { level: MarketOrderbookLevel; tone: "ask" | "bid"; index: number; total: number }) {
  const depth = level.depthPct || Math.max(18, 95 - index * (64 / Math.max(1, total)));
  return (
    <div className={`nmx141-bookrow ${tone}`} style={varStyle({ "--w": `${Math.max(18, Math.min(95, depth))}%` })}>
      <b>{centsLabel(level.price)}</b>
      <span>{compactNumber(level.shareEstimate || level.sizeUsdc)}</span>
      <span>{moneyLabel(level.sizeUsdc)}</span>
    </div>
  );
}

function BookEmpty({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="nmx141-empty">
      <div><b>{title}</b><span>{copy}</span></div>
    </div>
  );
}

function holderRidePct(activity: PublicMarketActivity, fallbackPrice: number) {
  const total = activity.riders + activity.faders;
  if (total > 0) return clamp(Math.round(activity.riders / total * 100), 5, 95);
  return clamp(Math.round(fallbackPrice * 100), 5, 95);
}

function TradeTerminal({
  market,
  side,
  orderType,
  amount,
  limitPrice,
  engine,
  currentPrice,
  liquidityUsdc,
  execution,
  onSide,
  onOrderType,
  onAmount,
  onLimitPrice
}: {
  market: NexMarket;
  side: Side;
  orderType: OrderType;
  amount: number;
  limitPrice: number;
  engine: Engine;
  currentPrice: number;
  liquidityUsdc: number;
  execution: ReturnType<typeof useMarketExecution>;
  onSide: (value: Side) => void;
  onOrderType: (value: OrderType) => void;
  onAmount: (value: number) => void;
  onLimitPrice: (value: number) => void;
}) {
  const curve = engine === "curve";
  const usdcShort = market.origin === "polymarket" ? "pUSD" : "USDC";
  const balance = Math.max(0, execution.nativeBalance ?? 0);
  const rawAmount = Number(amount === 0 ? 0 : amount || 100);
  const tradeAmount = Math.max(0, Math.min(balance, Number.isFinite(rawAmount) ? rawAmount : 0));
  const price = clampPrice(currentPrice);
  const limit = Number(limitPrice || Math.round(price * 100));
  const entry = orderType === "market" ? execution.nativeFillPrice : limit / 100;
  const marketShares = amount > 0 ? execution.estimatedShares * (tradeAmount / amount) : 0;
  const shares = Math.max(0, Math.floor(curve && orderType === "market" ? marketShares : tradeAmount / Math.max(0.01, entry)));
  const left = Math.max(0, balance - tradeAmount);
  const used = balance ? Math.round((tradeAmount / balance) * 100) : 0;
  const impact = Math.max(1, Math.min(9, Math.ceil(tradeAmount / Math.max(25_000, Number(liquidityUsdc || 90_000)) * 100)));
  const after = execution.curveTradeAfterCents ?? Math.max(1, Math.min(99, Math.round(price * 100) + (side === "ride" ? impact : -impact)));
  const orderA = curve ? "Instant" : "Market";
  const orderB = curve ? "Target" : "Limit";
  const executeText = execution.executeLabel;
  const helper = curve
    ? orderType === "market"
      ? "Native curve trade opens now and creates a receipt."
      : "Target waits for your selected curve price and can be cancelled."
    : orderType === "market"
      ? "Fills now and adds to Holdings."
      : "Waits in Open orders until filled or cancelled.";

  return (
    <section className={`nmx141-ticket nmx141-glass nmx145-stable-ticket ${orderType === "market" ? "market-mode" : "limit-mode"}`} data-nmx141-engine={curve ? "curve" : "orderbook"} data-nmx143-entry={entry} data-nmx143-balance={balance}>
      <div className="nmx141-ticket-head">
        <div>
          <h3><Icon name="trade" /> Trade</h3>
          <p>{curve ? orderType === "market" ? "Executes instantly against the liquidity curve." : "Sets a target price, not a matching order." : orderType === "market" ? "Fill from the live book." : "Choose a price; it fills when matched."}</p>
        </div>
        <span className={`nmx141-pill ${side === "ride" ? "native" : "routed"}`}>{side === "ride" ? "Ride" : "Fade"}</span>
      </div>
      <div className="nmx141-side-toggle">
        <button className={`ride ${side === "ride" ? "active" : ""}`} data-nmx141-side="ride" onClick={() => onSide("ride")}>Ride</button>
        <button className={`fade ${side === "fade" ? "active" : ""}`} data-nmx141-side="fade" onClick={() => onSide("fade")}>Fade</button>
      </div>
      <div className="nmx141-order-toggle">
        <button className={orderType === "market" ? "active" : ""} data-nmx141-order="market" onClick={() => onOrderType("market")}>{orderA}</button>
        <button className={orderType === "limit" ? "active" : ""} data-nmx141-order="limit" onClick={() => onOrderType("limit")}>{orderB}</button>
      </div>
      {orderType === "limit" ? (
        <div className="nmx141-limitline nmx145-price-slot limit">
          <label>{curve ? "Target price" : "Limit price"} <input data-nmx141-limit inputMode="numeric" value={limit} onChange={(event) => onLimitPrice(clampCents(Number(event.target.value)))} /><span>{CENT}</span></label>
          <span className="nmx141-pill">{curve ? "TARGET" : "GTC"}</span>
        </div>
      ) : (
        <div className="nmx141-limitline nmx145-price-slot market">
          <label>{curve ? "Instant price" : "Market price"} <input readOnly value={Math.round(price * 100)} /><span>{CENT}</span></label>
          <span className="nmx141-pill">{curve ? "CURVE" : "LIVE"}</span>
        </div>
      )}
      <div className="nmx143-balance-line"><span>Available to trade</span><b>{moneyLabel(balance)} {usdcShort}</b></div>
      <label className="nmx141-inputline nmx143-amount-line">
        <span>$</span>
        <input data-nmx141-amount inputMode="decimal" value={tradeAmount} onChange={(event) => onAmount(Math.max(0, Number(event.target.value) || 0))} />
        <small>{usdcShort}</small>
      </label>
      <div className="nmx143-slider-card" style={varStyle({ "--pct": `${used}%` })}>
        <div className="nmx143-slider-head"><span>Use balance</span><b data-nmx141-used>{used}%</b></div>
        <input className="nmx143-range" data-nmx141-slider type="range" min="0" max={balance} step="1" value={tradeAmount} aria-label="Trade amount slider" onChange={(event) => onAmount(Number(event.target.value))} />
        <div className="nmx143-slider-metrics"><span><b data-nmx141-amount-label>{moneyLabel(tradeAmount)}</b> to trade</span><span><b data-nmx141-left-label>{moneyLabel(left)}</b> left</span></div>
      </div>
      <div className="nmx141-quick">
        {[25, 50, 100, 250].map((value) => (
          <button key={value} data-nmx141-quick={value} onClick={() => onAmount(value)}>${value}</button>
        ))}
      </div>
      <div className="nmx141-summary">
        <div><span>{curve && orderType === "limit" ? "Target" : "Entry"}</span><b>{centsLabel(entry)}</b></div>
        <div><span>Est. shares</span><b data-nmx141-live-shares>{shares.toLocaleString()}</b></div>
        <div><span>Max payout</span><b data-nmx141-live-payout>{moneyLabel(shares)}</b></div>
      </div>
      <div className="nmx143-terminal-fill">
        <div><span>{curve ? "Price impact" : "Portfolio used"}</span><b data-nmx141-used-fill>{curve ? `+${impact}${CENT}` : `${used}%`}</b></div>
        <div><span>{curve ? "New price" : "After trade"}</span><b data-nmx141-left-fill>{curve ? `${after}${CENT}` : moneyLabel(left)}</b></div>
      </div>
      <button className={`nmx141-execute ${side}`} data-nmx141-execute onClick={() => void execution.executeTicket()}>{executeText}</button>
      <p className="nmx141-helper">{helper}</p>
    </section>
  );
}

function Tabs({ tab, mobile = false, onTab }: { tab: DetailTab; mobile?: boolean; onTab: (value: DetailTab) => void }) {
  const tabs: Array<[DetailTab, string, keyof typeof ICON_PATHS]> = [
    ["rules", "Rules", "rules"],
    ["settlement", "Settlement", "settle"],
    ["trades", "Trades", "trades"],
    ["comments", "Comments", "chat"],
    ["holders", "Holders", "holders"]
  ];
  if (mobile) {
    return (
      <nav className="nmx141-mobile-tabs nmx159-mobile-tabs" aria-label="Market record tabs">
        {tabs.map(([id, label]) => <button className={tab === id ? "active" : ""} key={id} type="button" onClick={() => onTab(id)}>{label}</button>)}
      </nav>
    );
  }
  return (
    <nav className="nmx141-tabs nmx159-tabs" aria-label="Market record tabs">
      {tabs.map(([id, label, icon]) => <button className={tab === id ? "active" : ""} key={id} type="button" onClick={() => onTab(id)}><Icon name={icon} />{label}</button>)}
    </nav>
  );
}

function TabPanel({
  tab,
  market,
  activity,
  commentsSideMap,
  tradeTapeExpanded,
  commentFilter,
  holderView,
  holderPage,
  whaleMode,
  whaleActive,
  profilePop,
  onTradeTapeExpanded,
  onCommentFilter,
  onHolderView,
  onHolderPage,
  onWhaleMode,
  onWhaleActive,
  onProfilePop
}: {
  tab: DetailTab;
  market: NexMarket;
  activity: PublicMarketActivity;
  commentsSideMap: Map<string, Side>;
  tradeTapeExpanded: boolean;
  commentFilter: CommentFilter;
  holderView: HolderView;
  holderPage: number;
  whaleMode: WhaleMode;
  whaleActive: string;
  profilePop: string | null;
  onTradeTapeExpanded: () => void;
  onCommentFilter: (value: CommentFilter) => void;
  onHolderView: (value: HolderView) => void;
  onHolderPage: (value: number) => void;
  onWhaleMode: (value: WhaleMode) => void;
  onWhaleActive: (value: string) => void;
  onProfilePop: (value: string | null) => void;
}) {
  if (tab === "settlement") {
    if (market.origin === "native") {
      return <ProofFlowPanel market={market} />;
    }
    return <SettlementTab market={market} activity={activity} />;
  }
  if (tab === "trades") return <TradesTab market={market} activity={activity} expanded={tradeTapeExpanded} onToggle={onTradeTapeExpanded} />;
  if (tab === "comments") return <CommentsTab market={market} activity={activity} sideByIdentity={commentsSideMap} filter={commentFilter} profilePop={profilePop} onFilter={onCommentFilter} onProfilePop={onProfilePop} />;
  if (tab === "holders") return <HoldersTab market={market} activity={activity} holderView={holderView} holderPage={holderPage} whaleMode={whaleMode} whaleActive={whaleActive} onHolderView={onHolderView} onHolderPage={onHolderPage} onWhaleMode={onWhaleMode} onWhaleActive={onWhaleActive} />;
  return <RulesTab market={market} activity={activity} />;
}

function rideFadeValues(market: NexMarket, activity: PublicMarketActivity) {
  const ui = marketUiSummary(market, activity.volumeUsdc, activity.native);
  const p = clampPrice(ui.price ?? 0.5);
  const f = clampPrice(1 - p);
  return {
    ride: clampCents(p * 100),
    fade: clampCents(f * 100),
    p,
    f
  };
}

function RulesTab({ market, activity }: { market: NexMarket; activity: PublicMarketActivity }) {
  const rules = ruleText(market);
  const rf = rideFadeValues(market, activity);
  return (
    <section className="nmx141-tabpanel nmx141-glass nmx159-tabpanel nmx159-rules">
      <div className="nmx141-tab-head nmx159-tab-head">
        <div><h2>Rules</h2><p>These rules decide the winner, not comments or sentiment.</p></div>
        <span className="nmx141-pill">Specific</span>
      </div>
      <div className="nmx159-status">
        <div><span>Status</span><b>{marketIsClosed(market.status) ? "Resolved" : "Live trading"}</b></div>
        <div><span>Snapshot</span><b>{dateLabel(market.closeTime)}</b></div>
        <div><span>Market price</span><b>Ride {rf.ride}{CENT} {"\u00b7"} Fade {rf.fade}{CENT}</b></div>
      </div>
      <div className="nmx159-rule-grid">
        <article className="nmx159-rule-card ride"><span><Icon name="rules" /> Ride wins if</span><b>{rules.outcome}</b><p>{rules.rule}</p></article>
        <article className="nmx159-rule-card fade"><span><Icon name="settle" /> Fade wins if</span><b>Condition is not met</b><p>Fade wins if the Ride condition is not satisfied at the settlement snapshot.</p></article>
        <article className="nmx159-rule-card"><span><Icon name="book" /> Settlement source</span><b>{rules.source}</b><p>Use only the locked source and calculation.</p></article>
        <article className="nmx159-rule-card"><span><Icon name="trade" /> Calculation</span><b>Measurement rule</b><p>{rules.calculation}</p></article>
      </div>
      <div className="nmx159-exclusions"><b>Excluded evidence</b><span>Unofficial screenshots, comment sentiment, temporary display errors, duplicate tickers, or source changes outside the locked rule.</span></div>
    </section>
  );
}

function SettlementTab({ market, activity }: { market: NexMarket; activity: PublicMarketActivity }) {
  const rules = ruleText(market);
  const rf = rideFadeValues(market, activity);
  const isNative = kind(market) === "Native";
  const isClosed = marketIsClosed(market.status);
  const lane = isNative
    ? /custom|creator|basket|trend|ranking|public reports/i.test(`${market.template ?? ""} ${market.yesRule ?? ""} ${market.sourceQualificationReason ?? ""}`)
      ? "Evidence-based"
      : "Auto-verifiable"
    : "Routed";
  const statusTitle = isNative
    ? isClosed ? `Resolved ${publicOutcomeLabel(market.finalOutcome ?? market.provisionalOutcome)}` : "Resolution Card locked"
    : "Routed settlement";
  const statusCopy = isNative
    ? isClosed ? "Final payout follows the Settlement Receipt. The final traded price is only the last crowd belief, not the result." : "Trading is live. After close, this market settles from the locked source, timestamp, Ride rule, Fade rule and Invalid rule."
    : "This market is routed from an external venue. NexMarkets gives access to the route; the external market rules control final resolution.";
  const challengeWindow = lane === "Auto-verifiable" ? "2h challenge window" : "6h challenge window";
  const bondText = isNative ? "Proposal/challenge bond starts at $20 and scales with market volume when review is required." : "External venue bond/dispute rules apply.";
  const stages = isNative
    ? [
      ["locked", "Resolution Card", "Source, close time and Ride/Fade/Invalid rules are locked before trading.", "done"],
      ["live", "Trading open", "The curve prices belief. It does not decide truth.", isClosed ? "done" : "active"],
      ["closed", "Market closes", "New trades stop. The locked rule becomes the settlement path.", isClosed ? "done" : "next"],
      ["proposed", "Outcome proposed", "Ride, Fade or Invalid is proposed with evidence from the locked source.", isClosed ? "done" : "next"],
      ["challenge", "Challenge period", "A valid challenge must include counter-outcome, evidence, reason and bond.", isClosed ? "done" : "next"],
      ["review", "Evidence Review", "If challenged, 5 qualified reviewers check the locked rules independently.", isClosed ? "done" : "conditional"],
      ["receipt", "Settlement Receipt", "Final outcome, evidence summary and payout vector are published.", isClosed ? "active" : "next"]
    ]
    : [
      ["route", "External route", "The original market rules and venue settlement process apply.", "active"],
      ["trade", "Trade through NexMarkets", "NexMarkets routes access and records user activity on this surface.", "next"],
      ["final", "External finalization", "The routed venue finalizes the outcome under its own rules.", "next"],
      ["reflect", "Receipt reflection", "NexMarkets reflects the routed result where available.", "next"]
    ];

  return (
    <section className="nmx141-tabpanel nmx141-glass nmx159-tabpanel nmx159-settlement pf-settle">
      <div className="nmx141-tab-head nmx159-tab-head pf-settle-head">
        <div><h2>Settlement</h2><p>{isNative ? "This market settles through ProofFlow: locked rules first, evidence next, receipt last." : "This is a routed market. Settlement follows the original external market rules."}</p></div>
        <span className="nmx141-pill">{isNative ? lane : "Routed"}</span>
      </div>
      <div className={`pf-state-card ${isNative ? "native" : "routed"}`}>
        <div><span>{isNative ? "Current settlement state" : "Route status"}</span><h3>{statusTitle}</h3><p>{statusCopy}</p></div>
        <div className="pf-belief"><span>Market price</span><b>Ride {rf.ride}{CENT}</b><em>Fade {rf.fade}{CENT}</em></div>
      </div>
      <div className="pf-resolution-grid">
        <article className="nmx159-rule-card ride"><span>Ride wins if</span><b>{rules.outcome}</b><p>{rules.rule}</p></article>
        <article className="nmx159-rule-card fade"><span>Fade wins if</span><b>Ride condition is not proven</b><p>Fade wins when the locked source and timestamp do not satisfy the Ride rule.</p></article>
        <article className="nmx159-rule-card"><span>Invalid if</span><b>Truth cannot be proven</b><p>{rules.fallback}</p></article>
        <article className="nmx159-rule-card"><span>Source & close</span><b>{rules.source}</b><p>{rules.calculation} Close: {dateLabel(market.closeTime)}.</p></article>
      </div>
      <div className="pf-flow-card">
        <div className="pf-flow-title">
          <div><b>{isNative ? "ProofFlow stages" : "Routed settlement stages"}</b><span>{isNative ? "Only the necessary stage opens. Live markets stay clean; disputed markets show the review path." : "NexMarkets does not replace the routed venue settlement."}</span></div>
          <span>{isNative ? challengeWindow : "External process"}</span>
        </div>
        <div className="pf-flow">
          {stages.map((stage, index) => (
            <div className={`pf-settle-step ${stage[3]}`} key={stage[0]}>
              <i>{index + 1}</i><div><b>{stage[1]}</b><span>{stage[2]}</span></div>
            </div>
          ))}
        </div>
      </div>
      {isNative ? <div className="pf-review-grid"><article><span>Reviewer panel</span><b>5 qualified reviewers</b><p>Used only when a proposal is challenged. Reviewers are selected from the eligible, conflict-free pool.</p></article><article><span>Threshold</span><b>4 of 5 agreement</b><p>If confidence is not reached or a serious issue appears, a fresh panel reviews from scratch.</p></article><article><span>Audit check</span><b>Source {"\u00b7"} timestamp {"\u00b7"} rule</b><p>The system checks whether evidence matches the locked source, deadline and Resolution Card.</p></article></div> : null}
      <div className="pf-settle-footer">
        <div><b>Bond rule</b><span>{bondText}</span></div>
        <div><b>Payout rule</b><span>{isNative ? "Resolved Ride: Ride redeems at $1. Resolved Fade: Fade redeems at $1. Invalid: Ride and Fade redeem equally." : "External venue payout rules apply to the routed market."}</span></div>
      </div>
      {isClosed ? <div className="pf-final-note"><b>Final outcome: {publicOutcomeLabel(market.finalOutcome ?? market.provisionalOutcome)}</b><span>Settled at {market.settlementStatus ?? "final source check"}. View the Settlement Receipt when available.</span></div> : null}
    </section>
  );
}

function publicOutcomeLabel(outcome?: "ride" | "fade" | "invalid" | null) {
  if (outcome === "ride") return "Ride";
  if (outcome === "fade") return "Fade";
  if (outcome === "invalid") return "Invalid";
  return "Pending";
}

function tradeTapeRows(activity: PublicMarketActivity) {
  return activity.trades.map((trade) => {
    const entry = trade.entryPrice ?? trade.yesPrice ?? 0.5;
    return {
      id: trade.id,
      user: trade.identity,
      side: trade.side,
      shares: sharesLabel(trade.amount / Math.max(entry, 0.001)),
      entry: centsLabel(entry),
      amount: moneyLabel(trade.amount),
      time: relativeTime(trade.createdAt)
    };
  });
}

function TradesTab({ market, activity, expanded, onToggle }: { market: NexMarket; activity: PublicMarketActivity; expanded: boolean; onToggle: () => void }) {
  const rf = rideFadeValues(market, activity);
  const rows = tradeTapeRows(activity);
  const visible = expanded ? rows : rows.slice(0, 5);
  return (
    <section className="nmx141-tabpanel nmx141-glass nmx159-tabpanel nmx159-trades">
      <div className="nmx141-tab-head nmx159-tab-head">
        <div><h2>Trades</h2><p>Public market tape. Five latest entries first, then expand only when needed.</p></div>
        <span className="nmx141-pill">Live tape</span>
      </div>
      <div className="nmx159-tape-summary">
        <div><span>Last trade</span><b>{visible[0]?.entry ?? `${rf.ride}${CENT}`}</b></div>
        <div><span>24h volume</span><b>{compactUsd(activity.volumeUsdc)}</b></div>
        <div><span>Spread</span><b>{Math.max(1, Math.round(Math.abs(rf.p - rf.f) * 100))}{CENT}</b></div>
      </div>
      {visible.length ? (
        <div className="nmx159-tape">
          {visible.map((trade) => (
            <div className="nmx159-tape-row" key={trade.id}>
              <div><b>{trade.user}</b><span>{trade.time}</span></div>
              <span className={`nmx141-sidechip ${trade.side}`}>{toTitleLabel(trade.side)}</span>
              <div><b>{trade.entry}</b><span>{trade.shares} shares</span></div>
              <b>{trade.amount}</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="nmx141-empty"><div><b>No trades yet</b><span>Real market prints will appear here after the first trade.</span></div></div>
      )}
      {rows.length > 5 ? <button className="nmx159-showmore" data-nmx159-trades-more type="button" onClick={onToggle}>{expanded ? "Show fewer" : "Show more"}</button> : null}
    </section>
  );
}

function CommentsTab({
  market,
  activity,
  sideByIdentity,
  filter,
  profilePop,
  onFilter,
  onProfilePop
}: {
  market: NexMarket;
  activity: PublicMarketActivity;
  sideByIdentity: Map<string, Side>;
  filter: CommentFilter;
  profilePop: string | null;
  onFilter: (value: CommentFilter) => void;
  onProfilePop: (value: string | null) => void;
}) {
  const [comments, setComments] = useState<MarketComment[]>([]);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const wallet = useWalletSession();
  const holders = useMemo(() => buildHolders(activity), [activity]);
  const holderByIdentity = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildHolders>[number]>();
    for (const holder of holders) map.set(holder.identity.toLowerCase(), holder);
    return map;
  }, [holders]);

  useEffect(() => {
    let cancelled = false;
    void fetchMarketCommentsApi(market.id)
      .then((items) => {
        if (!cancelled) setComments(items);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Comments unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [market.id]);

  async function postComment() {
    if (!body.trim()) return;
    setBusy(true);
    setMessage("Checking your NexMarkets session.");
    try {
      await wallet.ensureSignedIn();
      const comment = await postMarketCommentApi(market.id, body.trim());
      setComments((items) => [comment, ...items]);
      setBody("");
      setMessage("Comment posted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Comment failed.");
    } finally {
      setBusy(false);
    }
  }

  const rows = comments.map((comment) => {
    const side = sideByIdentity.get(comment.authorLabel.toLowerCase());
    const holder = holderByIdentity.get(comment.authorLabel.toLowerCase());
    const role = comment.authorLabel === market.creatorIdentity ? "Creator" : holder ? "Holder" : side ? "Holder" : "Neutral";
    const sideLabel = side ? toTitleLabel(side) : "Neutral";
    return {
      id: comment.id,
      user: comment.authorLabel,
      side,
      sideLabel,
      role,
      body: comment.body,
      time: relativeTime(comment.createdAt),
      exposure: holder ? moneyLabel(holder.amount) : "No recorded exposure",
      signal: comment.walletAddress ? shortAddress(comment.walletAddress) : "Profile",
      detail: holder ? `${sharesLabel(holder.shares)} shares` : "No position recorded"
    };
  });
  const visible = rows.filter((comment) => {
    if (filter === "all") return true;
    if (filter === "holder") return comment.role.toLowerCase() === "holder";
    if (filter === "creator") return comment.role.toLowerCase() === "creator";
    return comment.side === filter;
  });
  const picked = profilePop ? rows.find((comment) => comment.user === profilePop) : null;
  const chips: Array<[CommentFilter, string]> = [["all", "All"], ["ride", "Riders"], ["fade", "Faders"], ["holder", "Holders"], ["creator", "Creator"]];

  return (
    <section className="nmx141-tabpanel nmx141-glass nmx159-tabpanel nmx159-comments nmx160-comments">
      <div className="nmx141-tab-head nmx159-tab-head">
        <div><h2>Comments</h2><p>Premium market discussion with profile-aware comments, side context, and cleaner signal.</p></div>
        <span className="nmx141-pill">Discussion</span>
      </div>
      <div className="nmx159-comment-composer nmx160-composer">
        <input placeholder="Add a market-grade comment" value={body} onChange={(event) => setBody(event.target.value)} />
        <button data-nmx141-comment type="button" disabled={busy} onClick={() => void postComment()}>{busy ? "Posting" : "Post"}</button>
      </div>
      <div className="nmx159-filter-row nmx160-filter-row">
        {chips.map(([id, label]) => (
          <button className={filter === id ? "active" : ""} data-nmx159-comment-filter={id} key={id} type="button" onClick={() => onFilter(id)}>{label}</button>
        ))}
      </div>
      {visible.length ? (
        <div className="nmx159-comment-list nmx160-comment-list">
          {visible.map((comment) => {
            return (
              <article className="nmx159-comment-card nmx160-comment-card" key={comment.id}>
                <div className="nmx159-comment-top nmx160-comment-top">
                  <button className="nmx160-user" data-nmx160-profile-pop={comment.user} type="button" onClick={() => onProfilePop(comment.user)}>
                    <span className="nmx160-avatar small">{comment.user.charAt(0).toUpperCase()}</span>
                    <span><b>{comment.user}</b><small>{comment.role} {"\u00b7"} {comment.time} {"\u00b7"} {comment.signal}</small></span>
                  </button>
                  <span className={`nmx141-sidechip ${comment.side ?? "neutral"}`}>{comment.sideLabel}</span>
                </div>
                <p>{comment.body}</p>
                <div className="nmx159-comment-actions nmx160-comment-actions"><button type="button" onClick={() => onProfilePop(comment.user)}>Profile</button><span>Reply</span><span>{comment.detail}</span></div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="nmx141-empty"><div><b>No comments yet</b><span>Real comments for this market will appear here.</span></div></div>
      )}
      {message ? <p className="nmx141-helper">{message}</p> : null}
      {picked ? (
        <div className="nmx160-profile-pop" role="dialog" aria-label="User preview">
          <div className="nmx160-pop-head">
            <div className="nmx160-avatar">{picked.user.charAt(0).toUpperCase()}</div>
            <div><b>{picked.user}</b><span>{picked.role} {"\u00b7"} {picked.signal}</span></div>
            <button data-nmx160-profile-close type="button" onClick={() => onProfilePop(null)}>{"\u00d7"}</button>
          </div>
          <div className="nmx160-pop-stats">
            <div><span>Exposure</span><b>{picked.exposure}</b></div>
            <div><span>Side</span><b>{picked.sideLabel}</b></div>
            <div><span>Signal</span><b>{picked.detail}</b></div>
          </div>
          <p>{picked.body}</p>
          <Link className="primary nmx160-full-profile" data-nmx160-profile-full={picked.user} href={profileHref(picked.user)}>View full profile</Link>
        </div>
      ) : null}
    </section>
  );
}

function HoldersTab({
  market,
  activity,
  holderView,
  holderPage,
  whaleMode,
  whaleActive,
  onHolderView,
  onHolderPage,
  onWhaleMode,
  onWhaleActive
}: {
  market: NexMarket;
  activity: PublicMarketActivity;
  holderView: HolderView;
  holderPage: number;
  whaleMode: WhaleMode;
  whaleActive: string;
  onHolderView: (value: HolderView) => void;
  onHolderPage: (value: number) => void;
  onWhaleMode: (value: WhaleMode) => void;
  onWhaleActive: (value: string) => void;
}) {
  const holders = useMemo(() => buildHolders(activity), [activity]);
  const rows = holders.map((holder) => ({
    ...holder,
    tier: holder.amount >= 10_000 ? "Whale" : holder.amount >= 5_000 ? "Shark" : holder.amount >= 1_000 ? "Dolphin" : "Retail"
  }));
  const per = 10;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const safePage = Math.min(Math.max(0, holderPage), pages - 1);
  const slice = rows.slice(safePage * per, safePage * per + per);
  const totalExposure = rows.reduce((sum, holder) => sum + holder.amount, 0);
  const whaleRows = (["Whale", "Shark", "Dolphin", "Retail"] as const).map((tier) => {
    const members = rows.filter((holder) => holder.tier === tier);
    const exposure = members.reduce((sum, holder) => sum + holder.amount, 0);
    const pct = totalExposure > 0 ? Math.round(exposure / totalExposure * 100) : 0;
    const descriptions: Record<string, string> = {
      Whale: "Capital-dense wallets controlling the biggest exposure.",
      Shark: "Large active wallets that can still move depth.",
      Dolphin: "Mid-sized conviction clustered around entry bands.",
      Retail: "Broad smaller positions across both sides."
    };
    return {
      tier,
      count: members.length,
      pct,
      description: descriptions[tier]
    };
  });
  const colors = ["#ffb000", "#ffc247", "#16c784", "#7aa7ff"];
  const activeInfo = whaleRows.find((row) => row.tier === whaleActive) ?? whaleRows.find((row) => row.count > 0) ?? whaleRows[0];
  let offset = 0;

  return (
    <section className="nmx141-tabpanel nmx141-glass nmx159-tabpanel nmx159-holders nmx160-holders">
      <div className="nmx141-tab-head nmx159-tab-head">
        <div><h2>Holders</h2><p>Holder list first, with whale-status intelligence separated from Ride/Fade sentiment.</p></div>
        <span className="nmx141-pill">{activity.traderCount.toLocaleString()} holders</span>
      </div>
      <div className="nmx159-holder-switch nmx160-holder-switch">
        <button className={holderView === "holders" ? "active" : ""} data-nmx159-holder-view="holders" type="button" onClick={() => onHolderView("holders")}>Holder list</button>
        <button className={holderView === "info" ? "active" : ""} data-nmx159-holder-view="info" type="button" onClick={() => onHolderView("info")}>Whale stats</button>
      </div>
      {holderView === "holders" ? (
        rows.length ? (
          <div className="nmx160-holder-list">
            <div className="nmx160-holder-list-head">
              <span>Showing {safePage * per + 1}-{Math.min(rows.length, (safePage + 1) * per)} of {rows.length}</span>
              <div><button data-nmx160-holder-page={safePage - 1} disabled={safePage <= 0} type="button" onClick={() => onHolderPage(safePage - 1)}>{"\u2039"}</button><button data-nmx160-holder-page={safePage + 1} disabled={safePage >= pages - 1} type="button" onClick={() => onHolderPage(safePage + 1)}>{"\u203a"}</button></div>
            </div>
            {slice.map((holder, index) => (
              <div className="nmx160-holder-row" key={`${holder.identity}-${holder.side}`}>
                <button data-nmx160-profile-full={holder.identity} type="button" onClick={() => {
                  window.location.href = profileHref(holder.identity);
                }}><span>{safePage * per + index + 1}</span><b>{holder.identity}</b></button>
                <em>{holder.tier}</em>
                <strong className={holder.side}>{toTitleLabel(holder.side)}</strong>
                <span>{moneyLabel(holder.amount)}</span>
                <span>{sharesLabel(holder.shares)} shares</span>
                <small>Entry {centsLabel(holder.entry)}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="nmx141-empty"><div><b>No holders yet</b><span>Real holders appear after recorded positions.</span></div></div>
        )
      ) : (
        <>
          <div className="nmx160-whale-toolbar">
            <div><span>Whale status view</span><b>{activeInfo.tier} {"\u00b7"} {activeInfo.pct}% open interest</b></div>
            <button data-nmx160-whale-mode={whaleMode === "pie" ? "table" : "pie"} type="button" onClick={() => onWhaleMode(whaleMode === "pie" ? "table" : "pie")}>{whaleMode === "pie" ? "Table view" : "Pie view"}</button>
          </div>
          <div className={`nmx160-whale-main ${whaleMode}`}>
            {whaleMode === "pie" ? (
              <div className="nmx160-whale-pie">
                <svg viewBox="0 0 140 140">
                  {whaleRows.map((row, index) => {
                    const current = offset;
                    offset += row.pct;
                    return <circle className={cls("nmx160-whale-slice", activeInfo.tier === row.tier && "active")} cx="70" cy="70" data-nmx160-whale-slice={row.tier} fill="none" key={row.tier} onClick={() => onWhaleActive(row.tier)} pathLength="100" r="48" stroke={colors[index]} strokeDasharray={`${row.pct} ${100 - row.pct}`} strokeDashoffset={100 - current} strokeWidth="18" transform="rotate(-90 70 70)"><title>{row.tier} {"\u00b7"} {row.pct}% open interest</title></circle>;
                  })}
                  <circle cx="70" cy="70" r="33" fill="var(--panel)" />
                  <text x="70" y="66" textAnchor="middle" fontSize="15" fontWeight="950" fill="currentColor">{activeInfo.tier}</text>
                  <text x="70" y="83" textAnchor="middle" fontSize="9" fill="currentColor">{activeInfo.pct}%</text>
                </svg>
                <p>{activeInfo.description}</p>
              </div>
            ) : null}
            <div className="nmx160-whale-table">
              {whaleRows.map((row, index) => (
                <div className="nmx160-whale-row" data-nmx160-whale-slice={row.tier} key={row.tier} onClick={() => onWhaleActive(row.tier)}>
                  <i style={{ background: colors[index] }} /><div><b>{row.tier}</b><span>{row.description}</span></div><strong>{row.pct}% open interest</strong>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function buildHolders(activity: PublicMarketActivity) {
  const rows = new Map<string, {
    identity: string;
    side: Side;
    amount: number;
    shares: number;
    weightedEntry: number;
    lastAt: string;
  }>();
  for (const trade of activity.trades) {
    const entry = trade.entryPrice ?? trade.yesPrice ?? 0.5;
    const sideEntry = trade.side === "ride" ? entry : 1 - entry;
    const key = `${trade.identity.toLowerCase()}-${trade.side}`;
    const current = rows.get(key) ?? {
      identity: trade.identity,
      side: trade.side,
      amount: 0,
      shares: 0,
      weightedEntry: 0,
      lastAt: trade.createdAt
    };
    const shares = trade.amount / Math.max(sideEntry, 0.001);
    current.amount += trade.amount;
    current.shares += shares;
    current.weightedEntry += sideEntry * trade.amount;
    if (Date.parse(trade.createdAt) > Date.parse(current.lastAt)) current.lastAt = trade.createdAt;
    rows.set(key, current);
  }
  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      entry: row.amount > 0 ? row.weightedEntry / row.amount : 0.5
    }))
    .sort((a, b) => b.amount - a.amount);
}

function ReceiptPanel({
  market,
  activity,
  orderbook,
  targetOrders,
  engine,
  tab,
  localRecords,
  onTab,
  onRefreshTargetOrders
}: {
  market: NexMarket;
  activity: PublicMarketActivity;
  orderbook: PublicMarketOrderbook | null;
  targetOrders: NativeTargetOrder[];
  engine: Engine;
  tab: ReceiptTab;
  localRecords: Record<ReceiptTab, ReceiptRecord[]>;
  onTab: (value: ReceiptTab) => void;
  onRefreshTargetOrders: () => void;
}) {
  const [modal, setModal] = useState<ReceiptTab | null>(null);
  const [card, setCard] = useState<{ tab: ReceiptTab; index: number } | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelMessage, setCancelMessage] = useState("");
  const wallet = useWalletSession();
  const activeChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const nativeChainId = market.chainId ?? undefined;
  const publicClient = usePublicClient({ chainId: nativeChainId });
  const curve = engine === "curve";
  const ordersTitle = curve ? "Target orders" : "Open orders";
  const cancelCopy = curve ? "Cancel target orders here." : "Cancel unfilled orders here.";
  const { address } = useAccount();
  const targetRecords = useMemo(() => {
    const items = targetOrderRecords(market, targetOrders);
    if (!address) return items;
    return items.filter((record) => record.walletAddress?.toLowerCase() === address.toLowerCase());
  }, [market, targetOrders, address]);
  const targetIds = useMemo(() => new Set(targetOrders.map((order) => order.id)), [targetOrders]);
  const records = useMemo(() => ({
    orders: [
      ...localRecords.orders.filter((record) => !targetIds.has(record.id)),
      ...(curve ? targetRecords : [])
    ],
    holdings: [...localRecords.holdings, ...activity.trades.map((trade): ReceiptRecord => ({
      id: trade.id,
      market: market.title,
      marketId: market.id,
      side: trade.side,
      amount: moneyLabel(trade.amount),
      shares: sharesLabel((trade.entryPrice ?? trade.yesPrice) ? trade.amount / Math.max(trade.entryPrice ?? trade.yesPrice ?? 0.5, 0.001) : trade.amount),
      entry: centsLabel(trade.entryPrice ?? trade.yesPrice),
      kind: "market",
      engine,
      status: toTitleLabel(trade.status),
      user: trade.identity,
      time: relativeTime(trade.createdAt),
      receiptUrl: activity.receipts.find((receipt) => receipt.identity === trade.identity)?.publicUrl
    }))]
  }), [activity, curve, engine, localRecords, market, orderbook, targetIds, targetRecords]);
  const source = records[tab];
  const rows = source.slice(0, 5);
  const modalRows = modal ? records[modal] : [];
  const picked = card ? records[card.tab][card.index] : null;

  async function cancelTargetOrder(record: ReceiptRecord) {
    if (cancelingId) return;
    if (record.source !== "native_target_order" || !record.executorAddress || !record.executorOrderId) {
      setCard({ tab: "orders", index: records.orders.findIndex((row) => row.id === record.id) });
      return;
    }
    try {
      setCancelingId(record.id);
      setCancelMessage("Cancelling target order.");
      const user = await wallet.ensureSignedIn();
      if (!nativeChainId) throw new Error("This market network is not ready.");
      if (activeChainId !== nativeChainId) {
        setCancelMessage("Switching your wallet to the right network.");
        await switchChainAsync({ chainId: nativeChainId });
      }
      const executorAddress = record.executorAddress as Address;
      const hash = await writeContractAsync({
        address: executorAddress,
        abi: nativeTargetOrderExecutorAbi,
        functionName: "cancelOrder",
        args: [BigInt(record.executorOrderId)],
        chainId: nativeChainId
      });
      if (!publicClient) throw new Error("Market connection is still loading. Try again.");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Target order cancellation failed.");
      await cancelNativeTargetOrderApi(market.id, record.id, { txHash: hash as Hex });
      onRefreshTargetOrders();
      setCancelMessage(`Target order cancelled for ${user.primaryDomainName ?? user.displayName ?? "you"}.`);
    } catch (error) {
      setCancelMessage(userMessage(error));
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <>
      <section className="nmx141-receipts nmx141-glass nmx160-receipts nmx165-records">
        <div className="nmx141-receipts-head">
          <div className="nmx141-receipts-title">
            <b>{tab === "orders" ? ordersTitle : "Holdings"}</b>
            <span>{tab === "orders" ? cancelCopy : "View premium trade receipt cards."}</span>
          </div>
          <div className="nmx141-receipt-tabs">
            <button className={tab === "orders" ? "active" : ""} type="button" onClick={() => onTab("orders")}>{ordersTitle} {records.orders.length}</button>
            <button className={tab === "holdings" ? "active" : ""} type="button" onClick={() => onTab("holdings")}>Holdings {records.holdings.length}</button>
          </div>
        </div>
        <div className="nmx141-receipt-list">
          {rows.length ? rows.map((record, index) => (
            <ReceiptRow key={record.id} record={record} isOrder={tab === "orders" && record.kind === "limit"} busy={cancelingId === record.id} onCancel={() => void cancelTargetOrder(record)} onView={() => setCard({ tab, index })} />
          )) : (
            <div className="nmx141-empty"><div><b>{tab === "orders" ? `No ${ordersTitle.toLowerCase()}` : "No holdings yet"}</b><span>{tab === "orders" ? curve ? "Target orders you place will stay here until the curve reaches your price or you cancel." : "Limit orders you place will stay here until they match or you cancel." : "Market positions you open will appear here with receipt actions."}</span></div></div>
          )}
        </div>
        {cancelMessage ? <p className="nmx141-helper">{cancelMessage}</p> : null}
        {source.length > 5 ? <button className="nmx143-viewall" type="button" onClick={() => setModal(tab)}>View all {source.length}</button> : null}
      </section>

      {modal ? (
        <div className="nmx143-receipt-modal" onClick={() => setModal(null)}>
          <div className="nmx143-receipt-card" onClick={(event) => event.stopPropagation()}>
            <div className="nmx143-modal-head">
              <div><b>{modal === "holdings" ? "Holdings" : ordersTitle}</b><span>{modalRows.length} {modalRows.length === 1 ? "item" : "items"} visible in full view</span></div>
              <button type="button" onClick={() => setModal(null)}>{"\u00d7"}</button>
            </div>
            <div className="nmx143-modal-list">
              {modalRows.length ? modalRows.map((record, index) => (
                <ReceiptRow key={record.id} record={record} isOrder={modal === "orders" && record.kind === "limit"} busy={cancelingId === record.id} modal onCancel={() => void cancelTargetOrder(record)} onView={() => setCard({ tab: modal, index })} />
              )) : <div className="nmx141-empty"><div><b>No {modal === "holdings" ? "holdings" : ordersTitle.toLowerCase()}</b><span>Nothing to show here yet.</span></div></div>}
            </div>
          </div>
        </div>
      ) : null}

      {picked ? (
        <div className="nmx165-premium-overlay" onClick={() => setCard(null)}>
          <article
            className={`nmx165-trade-card ${picked.side}`}
            style={{ background: "linear-gradient(145deg, #08090b, #101113 62%, #1a1c20)", backgroundColor: "#0f1012" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="nmx165-card-glow" />
            <header>
              <div><span className="nmx165-kicker">Trade receipt</span><h3>{toTitleLabel(picked.side)} {picked.market}</h3><p>{picked.status} {"\u00b7"} {picked.kind === "limit" ? picked.engine === "curve" ? "Target order" : "Limit order" : "Holding"} {"\u00b7"} {picked.time}</p></div>
              <button type="button" onClick={() => setCard(null)}>{"\u00d7"}</button>
            </header>
            <div className="nmx165-hero-metric"><span>Entry</span><b>{picked.entry}</b><small>{picked.user} {"\u00b7"} {picked.amount} committed</small></div>
            <div className="nmx165-card-grid">
              <div><span>Side</span><b>{toTitleLabel(picked.side)}</b></div>
              <div><span>Shares</span><b>{picked.shares}</b></div>
              <div><span>Amount</span><b>{picked.amount}</b></div>
              <div><span>Max payout</span><b>{receiptMaxPayoutLabel(picked)}</b></div>
            </div>
            <div className="nmx165-card-note"><b>Receipt details</b><span>This card shows the market, side, entry, size, amount, status and receipt actions in one clear view.</span></div>
            <footer>
              <button className="btn" type="button" onClick={() => void copyReceipt(picked)}>Copy receipt</button>
              <button className="primary" type="button" onClick={() => void copyReceipt(picked)}>Share receipt</button>
            </footer>
          </article>
        </div>
      ) : null}
    </>
  );
}

async function copyReceipt(record: ReceiptRecord) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  const path = record.receiptUrl ?? `/market/${record.marketId}`;
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
  await navigator.clipboard.writeText(url).catch(() => undefined);
}

function receiptMaxPayoutLabel(record: ReceiptRecord) {
  const shares = Number(String(record.shares).replace(/[^0-9.]/g, ""));
  return Number.isFinite(shares) && shares > 0 ? moneyLabel(shares) : "-";
}

function ReceiptRow({
  record,
  isOrder,
  busy = false,
  modal = false,
  onCancel,
  onView
}: {
  record: ReceiptRecord;
  isOrder: boolean;
  busy?: boolean;
  modal?: boolean;
  onCancel?: () => void;
  onView: () => void;
}) {
  const isCurve = record.engine === "curve";
  const canCancel = isOrder && record.cancelable && onCancel;
  return (
    <div className={cls(modal ? "nmx143-modal-row" : "nmx141-receipt-row", "nmx165-record-row", isOrder ? "order" : "holding")}>
      <span className={`side ${record.side}`}>{toTitleLabel(record.side)}</span>
      <div className="nmx165-record-main"><b>{record.shares} shares</b><small>{record.market}</small></div>
      <span>{record.entry}</span>
      <span className="kind">{isOrder ? isCurve ? "Target order" : "Open order" : "Holding"}</span>
      <button className={cls("nmx141-receipt-action", isOrder ? "cancel nmx165-cancel" : "nmx165-view")} type="button" onClick={canCancel ? onCancel : onView} disabled={busy}>{isOrder ? busy ? "Cancelling..." : `Cancel ${isCurve ? "target" : "order"}` : "View receipt"}</button>
    </div>
  );
}

function targetOrderRecords(market: NexMarket, orders: NativeTargetOrder[]): ReceiptRecord[] {
  return orders
    .filter((order) => !["executed", "cancelled", "expired"].includes(order.status.toLowerCase()))
    .map((order) => ({
      id: order.id,
      market: market.title,
      marketId: market.id,
      side: order.side,
      amount: moneyLabel(order.amountUsdc),
      shares: sharesLabel(order.amountUsdc / Math.max(order.targetPrice, 0.001)),
      entry: centsLabel(order.targetPrice),
      kind: "limit" as const,
      engine: "curve" as const,
      status: toTitleLabel(order.status),
      user: order.executorOrderId ? `target #${order.executorOrderId}` : "target order",
      time: relativeTime(order.createdAt),
      source: "native_target_order" as const,
      executorAddress: order.executorAddress,
      executorOrderId: order.executorOrderId,
      cancelable: order.status === "open",
      walletAddress: order.walletAddress
    }));
}

function bookRecords(market: NexMarket, orderbook: PublicMarketOrderbook | null, engine: Engine): ReceiptRecord[] {
  if (!orderbook) return [];
  const rows = [
    ...orderbook.ride.bids.slice(0, 3).map((level) => ({ level, side: "ride" as Side })),
    ...orderbook.fade.bids.slice(0, 3).map((level) => ({ level, side: "fade" as Side }))
  ];
  return rows.map(({ level, side }, index) => ({
    id: `book-${side}-${level.price}-${index}`,
    market: market.title,
    marketId: market.id,
    side,
    amount: moneyLabel(level.sizeUsdc),
    shares: sharesLabel(level.shareEstimate),
    entry: centsLabel(level.price),
    kind: "limit",
    engine,
    status: "Open",
    user: `${level.orderCount} ${level.orderCount === 1 ? "order" : "orders"}`,
    time: orderbook.updatedAt ? relativeTime(orderbook.updatedAt) : "now",
    source: "market_orderbook"
  }));
}

function AlertPop({ market, currentPrice, onClose }: { market: NexMarket; currentPrice: number; onClose: () => void }) {
  const cur = Math.round(currentPrice * 100);
  const [triggerPrice, setTriggerPrice] = useState(cur + 5);
  const [busy, setBusy] = useState(false);

  const handleSetAlert = async () => {
    setBusy(true);
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: market.id,
          type: "source_issue",
          title: `Price Alert Registered: ${market.title}`,
          body: `You will be notified on the dashboard and via Telegram when the Ride price crosses ${triggerPrice}¢.`
        })
      });
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div className="nmx141-alert-pop">
      <h3>Set price alert</h3>
      <p>Get notified when this market reaches your trigger or when activity changes fast.</p>
      <div className="nmx141-alert-grid">
        <label className="nmx141-alert-line"><span>Ride price crosses</span><b><input value={triggerPrice} onChange={(e) => setTriggerPrice(Number(e.target.value) || 0)} inputMode="numeric" />{CENT}</b></label>
        <label className="nmx141-alert-check"><input type="checkbox" defaultChecked /><span>Notify me on major source update or volume spike.</span></label>
        <label className="nmx141-alert-check"><input type="checkbox" /><span>Notify me 1 hour before close.</span></label>
      </div>
      <div className="nmx141-alert-actions">
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="primary" type="button" onClick={handleSetAlert} disabled={busy}>
          {busy ? "Setting..." : "Set alert"}
        </button>
      </div>
    </div>
  );
}

function DesktopTitle({
  market,
  activity,
  ui,
  watched,
  alertOpen,
  currentPrice,
  onWatch,
  onAlert,
  onShare,
  shareText
}: {
  market: NexMarket;
  activity: PublicMarketActivity;
  ui: ReturnType<typeof marketUiSummary>;
  watched: boolean;
  alertOpen: boolean;
  currentPrice: number;
  onWatch: () => void;
  onAlert: () => void;
  onShare: () => void;
  shareText: string;
}) {
  return (
    <section className="nmx141-titlebar nmx141-glass">
      <div className="nmx141-title-main">
        <div className="nmx141-title-meta">
          <Link className="nmx141-back" href="/markets">{"\u2190 Markets"}</Link>
          <span className={`nmx141-pill ${kindClass(market)}`}>{kind(market)}</span>
          <span className="nmx141-pill">{ui.category || "Market"}</span>
        </div>
        <h1>{market.title}</h1>
        <p>{market.question || "Market room with visible source, rules, trading activity and receipts."}</p>
        {market.createdByType === "agent" && agentPublicLabel(market.creatorAgentPublicId) ? (
          <div className="nmx160-creator-line agent"><span>Launched by agent</span><Link href={`/agents/${encodeURIComponent(agentPublicLabel(market.creatorAgentPublicId)!.replace(/\.id$/i, ""))}`}>{agentPublicLabel(market.creatorAgentPublicId)}</Link></div>
        ) : null}
        {market.origin === "native" && ui.creator ? <div className="nmx160-creator-line"><span>Native creator</span><Link href={profileHref(ui.creator)}>{ui.creator}</Link></div> : null}
      </div>
      <div className="nmx141-title-actions">
        <button className={cls("nmx141-iconbtn", alertOpen && "active")} title="Set alert" type="button" onClick={onAlert}><Icon name="bell" /></button>
        <button className={cls("nmx141-iconbtn", watched && "active")} title="Watch" type="button" onClick={onWatch}><Icon name="star" /></button>
        <button className="nmx141-iconbtn" title={shareText || `Volume ${compactUsd(activity.volumeUsdc)}`} type="button" onClick={onShare}><Icon name="more" /></button>
      </div>
      {alertOpen ? <AlertPop market={market} currentPrice={currentPrice} onClose={onAlert} /> : null}
    </section>
  );
}

function MobileShell({
  market,
  currentPrice,
  side,
  watched,
  alertOpen,
  view,
  children,
  onWatch,
  onAlert,
  onView
}: {
  market: NexMarket;
  currentPrice: number;
  side: Side;
  watched: boolean;
  alertOpen: boolean;
  view: MobileView;
  children: ReactNode;
  onWatch: () => void;
  onAlert: () => void;
  onView: (value: MobileView) => void;
}) {
  const cur = Math.round(currentPrice * 100);
  const fade = 100 - cur;
  const delta = cur - 50;
  return (
    <div className="nmx141-mobile">
      <header className="nmx141-mobile-head">
        <div className="nmx141-mtop">
          <Link className="nmx141-micon" href="/markets"><Icon name="back" /></Link>
          <div className="nmx141-mtitle"><b>{market.title}</b><span>{cur}{CENT} {delta >= 0 ? "+" : ""}{delta}{CENT} / Ride {cur}{CENT} / Fade {fade}{CENT}</span>{market.createdByType === "agent" && agentPublicLabel(market.creatorAgentPublicId) ? <em>Launched by agent {agentPublicLabel(market.creatorAgentPublicId)}</em> : null}</div>
          <div className="nmx141-title-actions">
            <button className={cls("nmx141-micon", alertOpen && "active")} type="button" onClick={onAlert}><Icon name="bell" /></button>
            <button className={cls("nmx141-micon", watched && "active")} type="button" onClick={onWatch}><Icon name="star" /></button>
          </div>
        </div>
        <div className="nmx141-mswitch">
          <button className={view === "trade" ? "active" : ""} type="button" onClick={() => onView("trade")}><Icon name="trade" /> Trade</button>
          <button className={view === "chart" ? "active" : ""} type="button" onClick={() => onView("chart")}><Icon name="chart" /> Chart</button>
        </div>
      </header>
      <main className={cls("nmx141-mbody", view === "trade" && "trade-mode")}>{children}</main>
      {alertOpen ? <AlertPop market={market} currentPrice={sidePriceValue(currentPrice, side)} onClose={onAlert} /> : null}
    </div>
  );
}

export function MarketRoom({
  market,
  activity
}: {
  market: NexMarket;
  activity: PublicMarketActivity;
  relatedMarkets?: NexMarket[];
}) {
  const raw = polymarketRouteRaw(market);
  const prices = numberArray(raw.outcomePrices);
  const clobTokenIds = stringArray(market.polymarketClobTokenIds).length
    ? stringArray(market.polymarketClobTokenIds)
    : stringArray(raw.clobTokenIds);
  const ui = useMemo(() => marketUiSummary(market, activity.volumeUsdc, activity.native), [market, activity]);
  const engine = marketEngine(market);
  const [side, setSide] = useState<Side>("ride");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [amount, setAmount] = useState(100);
  const [limitPrice, setLimitPrice] = useState(() => Math.round(sidePriceValue(ui.price, "ride") * 100));
  const [tab, setTab] = useState<DetailTab>("rules");
  const [mobileView, setMobileView] = useState<MobileView>("trade");
  const [chartLayer, setChartLayer] = useState<ChartLayer>("probability");
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1D");
  const [receiptTab, setReceiptTab] = useState<ReceiptTab>("orders");
  const [holderView, setHolderView] = useState<HolderView>("holders");
  const [holderPage, setHolderPage] = useState(0);
  const [whaleMode, setWhaleMode] = useState<WhaleMode>("pie");
  const [whaleActive, setWhaleActive] = useState("Whale");
  const [tradeTapeExpanded, setTradeTapeExpanded] = useState(false);
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");
  const [profilePop, setProfilePop] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [watched, setWatched] = useState(false);
  const [shareText, setShareText] = useState("");
  const [localRecords, setLocalRecords] = useState<Record<ReceiptTab, ReceiptRecord[]>>({ orders: [], holdings: [] });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWatched(localStorage.getItem(`watched-market-${market.id}`) === "true");
    }
  }, [market.id]);

  const handleWatch = () => {
    const next = !watched;
    setWatched(next);
    localStorage.setItem(`watched-market-${market.id}`, String(next));
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => undefined);
    setShareText("Link copied!");
    setTimeout(() => setShareText(""), 2000);
  };
  const { orderbook, loading, error, refresh } = useMarketOrderbook(market.id);
  const targetOrders = useMarketTargetOrders(market.id, engine === "curve");
  const currentPrice = sidePriceValue(ui.price, side);
  const commentsSideMap = useMemo(() => {
    const map = new Map<string, Side>();
    for (const trade of activity.trades) {
      if (!map.has(trade.identity.toLowerCase())) map.set(trade.identity.toLowerCase(), trade.side);
    }
    return map;
  }, [activity.trades]);
  const execution = useMarketExecution({
    market,
    engine,
    side,
    orderType,
    amount,
    limitPrice,
    currentPrice,
    prices,
    clobTokenIds,
    onRecord(record, nextTab) {
      setLocalRecords((records) => ({ ...records, [nextTab]: [record, ...records[nextTab]] }));
      setReceiptTab(nextTab);
    },
    onRefreshOrderbook: refresh,
    onRefreshTargetOrders: targetOrders.refresh
  });
  const liquidityUsdc = curveLiquidityUsdc(activity, orderbook, execution.nativeLiquidityUsdc);

  useEffect(() => {
    document.body.classList.add("nmx141-detail-active");
    document.body.classList.remove(
      "nmx140-detail-active",
      "nmx139-detail-active",
      "nmx138-detail-active",
      "nmx137-detail-active",
      "nmx116-detail-active",
      "nmx116-markets-active",
      "nmx137-markets-active"
    );
    return () => {
      document.body.classList.remove("nmx141-detail-active");
    };
  }, []);

  useEffect(() => {
    setLimitPrice(Math.round(sidePriceValue(ui.price, side) * 100));
  }, [market.id, side, ui.price]);

  function chooseSide(nextSide: Side) {
    setSide(nextSide);
    setLimitPrice(Math.round(sidePriceValue(ui.price, nextSide) * 100));
  }

  const tradeStack = (
    <>
      <EngineBook
        engine={engine}
        activity={activity}
        orderbook={orderbook}
        loading={loading}
        error={error}
        side={side}
        amount={amount}
        currentPrice={currentPrice}
        liquidityUsdc={liquidityUsdc}
        curveBands={execution.curveBands}
        curveAfterCents={execution.curveTradeAfterCents}
      />
      <TradeTerminal
        market={market}
        side={side}
        orderType={orderType}
        amount={amount}
        limitPrice={limitPrice}
        engine={engine}
        currentPrice={currentPrice}
        liquidityUsdc={liquidityUsdc}
        execution={execution}
        onSide={chooseSide}
        onOrderType={setOrderType}
        onAmount={setAmount}
        onLimitPrice={setLimitPrice}
      />
    </>
  );
  const chartPanel = (
    <MarketChart
      market={market}
      activity={activity}
      side={side}
      currentPrice={currentPrice}
      amount={amount}
      limitPrice={limitPrice}
      layer={chartLayer}
      timeframe={timeframe}
      onLayer={setChartLayer}
      onTimeframe={setTimeframe}
      onSide={chooseSide}
    />
  );
  const recordPanel = (
      <ReceiptPanel
        market={market}
        activity={activity}
        orderbook={orderbook}
        targetOrders={targetOrders.orders}
        engine={engine}
        tab={receiptTab}
        localRecords={localRecords}
        onTab={setReceiptTab}
        onRefreshTargetOrders={targetOrders.refresh}
      />
  );
  const detailsPanel = (
    <TabPanel
      tab={tab}
      market={market}
      activity={activity}
      commentsSideMap={commentsSideMap}
      tradeTapeExpanded={tradeTapeExpanded}
      commentFilter={commentFilter}
      holderView={holderView}
      holderPage={holderPage}
      whaleMode={whaleMode}
      whaleActive={whaleActive}
      profilePop={profilePop}
      onTradeTapeExpanded={() => setTradeTapeExpanded((value) => !value)}
      onCommentFilter={setCommentFilter}
      onHolderView={setHolderView}
      onHolderPage={(page) => setHolderPage(Math.max(0, page))}
      onWhaleMode={setWhaleMode}
      onWhaleActive={setWhaleActive}
      onProfilePop={setProfilePop}
    />
  );

  return (
    <section id="detail" className="view active">
      <section className="nmx141 nmx141-shell">
        <div className="nmx141-desktop">
          <DesktopTitle
            market={market}
            activity={activity}
            ui={ui}
            watched={watched}
            alertOpen={alertOpen}
            currentPrice={currentPrice}
            onWatch={handleWatch}
            onAlert={() => setAlertOpen((value) => !value)}
            onShare={handleShare}
            shareText={shareText}
          />
          <section className="nmx141-workbench">
            <main className="nmx141-left">
              {chartPanel}
              <Tabs tab={tab} onTab={setTab} />
              {detailsPanel}
            </main>
            <aside className="nmx141-rightcol">
              <div className="nmx141-rightgrid">{tradeStack}</div>
              {recordPanel}
            </aside>
          </section>
        </div>

        <MobileShell
          market={market}
          currentPrice={ui.price ?? 0.5}
          side={side}
          watched={watched}
          alertOpen={alertOpen}
          view={mobileView}
          onWatch={handleWatch}
          onAlert={() => setAlertOpen((value) => !value)}
          onView={setMobileView}
        >
          {mobileView === "trade" ? (
            <div className="nmx141-mobile-trade-wrap">
              <section className="nmx141-mobile-trade">{tradeStack}</section>
              {recordPanel}
            </div>
          ) : (
            <>
              {chartPanel}
              <div className="nmx141-mobile-actions">
                <button className="ride" type="button" onClick={() => chooseSide("ride")}>Ride</button>
                <button className="fade" type="button" onClick={() => chooseSide("fade")}>Fade</button>
              </div>
              <Tabs tab={tab} mobile onTab={setTab} />
              {detailsPanel}
            </>
          )}
        </MobileShell>
      </section>
    </section>
  );
}
