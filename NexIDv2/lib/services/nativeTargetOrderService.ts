import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatEther,
  http,
  parseAbi,
  parseAbiItem,
  type Address,
  type Chain,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { DEFAULT_NEXMARKETS_CHAIN_ID, nexMarketsContracts } from "@/config/nexmarkets-contracts";
import { requireDatabase } from "@/lib/server/db";
import { activeSeason } from "@/lib/services/pointsEngine";
import { nativeTradingFeeSplit, recordNativeTradingFeeLedger } from "@/lib/services/rewardService";
import type { AuthUser } from "@/lib/types/nexid";
import { numberToUsdcUnits, usdcUnitsToNumber } from "@/lib/utils/usdc";

const targetOrderCreatedEvent = parseAbiItem("event TargetOrderCreated(uint256 indexed orderId,address indexed owner,address indexed market,uint8 side,uint256 notional,uint256 maxPriceBps,uint256 deposited,uint64 expiresAt)");
const targetOrderCancelledEvent = parseAbiItem("event TargetOrderCancelled(uint256 indexed orderId,address indexed owner,uint256 refund)");
const tradeExecutedEvent = parseAbiItem("event TradeExecuted(address indexed trader,uint8 indexed side,uint256 notional,uint256 fee,uint256 shares)");

const targetExecutorAbi = parseAbi([
  "function EXECUTOR_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role,address account) view returns (bool)",
  "function executeOrder(uint256 orderId)",
  "function expireOrder(uint256 orderId)"
]);

const nativeTargetMarketAbi = parseAbi([
  "function currentPriceBps(uint8 side) view returns (uint256)"
]);

type Side = "ride" | "fade";

type NativeTargetOrderInput = {
  marketId: string;
  user: AuthUser;
  side: Side;
  amount: number;
  targetPrice: number;
  walletAddress: string;
  chainId: number;
  executorAddress: string;
  executorOrderId?: string;
  txHash: string;
  expiresAt?: string;
};

type NativeTargetOrderRunInput = {
  chainId?: number;
  limit?: number;
  force?: boolean;
};

type NativeTargetOrderResult = {
  action: "readiness" | "execute" | "expire";
  orderId?: string;
  marketId?: string;
  ok: boolean;
  status: string;
  txHash?: string;
  detail?: string;
};

function configuredAddress(value?: string | null): Address | null {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return value as Address;
}

function sideIndex(side: Side) {
  return side === "ride" ? 0 : 1;
}

function sideFromIndex(side: number): Side {
  return side === 0 ? "ride" : "fade";
}

function usdc(value: bigint) {
  return usdcUnitsToNumber(value);
}

function maxPriceBps(targetPrice: number) {
  return Math.round(Math.max(0.01, Math.min(0.99, targetPrice)) * 10_000);
}

function chainConfig(chainId: number): { chain: Chain; rpcUrl?: string } {
  if (chainId === 84532) return { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL };
  if (chainId === 8453) return { chain: base, rpcUrl: process.env.BASE_RPC_URL };
  throw new Error("Unsupported native market chain.");
}

function defaultChainId() {
  return Number(process.env.NATIVE_EVENTS_CHAIN_ID || process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || DEFAULT_NEXMARKETS_CHAIN_ID);
}

function targetExecutorAddress(chainId = defaultChainId()) {
  return configuredAddress(nexMarketsContracts(chainId)?.targetOrderExecutor);
}

function privateKey() {
  const raw = process.env.NATIVE_TARGET_ORDER_EXECUTOR_PRIVATE_KEY || process.env.NATIVE_RESOLUTION_BOT_PRIVATE_KEY;
  if (!raw) throw new Error("NATIVE_TARGET_ORDER_EXECUTOR_PRIVATE_KEY is required for native target order execution.");
  return raw.startsWith("0x") ? raw as Hex : `0x${raw}` as Hex;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function publicClient(chainId: number) {
  const config = chainConfig(chainId);
  if (!config.rpcUrl) throw new Error(`RPC URL is not configured for chain ${chainId}.`);
  return createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl, { retryCount: 1, retryDelay: 2500, timeout: 25000 }),
    pollingInterval: Number(process.env.NATIVE_TARGET_ORDER_RPC_POLLING_MS || 12000)
  });
}

async function clients(chainId: number) {
  const config = chainConfig(chainId);
  if (!config.rpcUrl) throw new Error(`RPC URL is not configured for chain ${chainId}.`);
  const account = privateKeyToAccount(privateKey());
  const pollingInterval = Number(process.env.NATIVE_TARGET_ORDER_RPC_POLLING_MS || 12000);
  const transport = http(config.rpcUrl, { retryCount: 1, retryDelay: 2500, timeout: 25000 });
  return {
    account,
    publicClient: createPublicClient({ chain: config.chain, transport, pollingInterval }),
    walletClient: createWalletClient({ account, chain: config.chain, transport, pollingInterval })
  };
}

async function verifiedCreatedEvent(input: NativeTargetOrderInput & { marketAddress: string }) {
  const client = await publicClient(input.chainId);
  const receipt = await client.getTransactionReceipt({ hash: input.txHash as Hex });
  if (receipt.status !== "success") throw new Error("Target order transaction did not succeed.");
  const executor = input.executorAddress.toLowerCase();
  const expectedOwner = input.walletAddress.toLowerCase();
  const expectedMarket = input.marketAddress.toLowerCase();
  const expectedNotional = numberToUsdcUnits(input.amount);
  const expectedMaxPriceBps = BigInt(maxPriceBps(input.targetPrice));

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== executor) continue;
    try {
      const decoded = decodeEventLog({ abi: [targetOrderCreatedEvent], data: log.data, topics: log.topics });
      const args = decoded.args as unknown as {
        orderId: bigint;
        owner: string;
        market: string;
        side: number;
        notional: bigint;
        maxPriceBps: bigint;
        deposited: bigint;
        expiresAt: bigint;
      };
      const orderId = args.orderId.toString();
      if (
        args.owner.toLowerCase() === expectedOwner &&
        args.market.toLowerCase() === expectedMarket &&
        Number(args.side) === sideIndex(input.side) &&
        args.notional === expectedNotional &&
        args.maxPriceBps === expectedMaxPriceBps &&
        (!input.executorOrderId || input.executorOrderId === orderId)
      ) {
        return { ...args, orderId, logIndex: log.logIndex };
      }
    } catch {
      // Ignore unrelated executor logs.
    }
  }
  throw new Error("No matching TargetOrderCreated event was found in this transaction.");
}

async function verifiedCancelledEvent(input: {
  txHash: string;
  chainId: number;
  executorAddress: string;
  executorOrderId: string;
  walletAddress: string;
}) {
  const client = await publicClient(input.chainId);
  const receipt = await client.getTransactionReceipt({ hash: input.txHash as Hex });
  if (receipt.status !== "success") throw new Error("Target order cancel transaction did not succeed.");
  const executor = input.executorAddress.toLowerCase();
  const owner = input.walletAddress.toLowerCase();

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== executor) continue;
    try {
      const decoded = decodeEventLog({ abi: [targetOrderCancelledEvent], data: log.data, topics: log.topics });
      const args = decoded.args as unknown as { orderId: bigint; owner: string; refund: bigint };
      if (args.orderId.toString() === input.executorOrderId && args.owner.toLowerCase() === owner) {
        return { ...args, logIndex: log.logIndex };
      }
    } catch {
      // Ignore unrelated executor logs.
    }
  }
  throw new Error("No matching TargetOrderCancelled event was found in this transaction.");
}

function parseTradeEventFromReceipt(input: {
  receipt: Awaited<ReturnType<Awaited<ReturnType<typeof publicClient>>["getTransactionReceipt"]>>;
  marketAddress: string;
  walletAddress: string;
  side: Side;
}) {
  const market = input.marketAddress.toLowerCase();
  const wallet = input.walletAddress.toLowerCase();
  for (const log of input.receipt.logs) {
    if (log.address.toLowerCase() !== market) continue;
    try {
      const decoded = decodeEventLog({ abi: [tradeExecutedEvent], data: log.data, topics: log.topics });
      const args = decoded.args as unknown as {
        trader: string;
        side: number;
        notional: bigint;
        fee: bigint;
        shares: bigint;
      };
      if (args.trader.toLowerCase() === wallet && Number(args.side) === sideIndex(input.side)) {
        return { ...args, logIndex: log.logIndex };
      }
    } catch {
      // Ignore unrelated market logs.
    }
  }
  throw new Error("No matching native TradeExecuted event was found in the executor transaction.");
}

export async function recordNativeTargetOrder(input: NativeTargetOrderInput) {
  const db = requireDatabase();
  const market = await db.market.findUnique({
    where: { id: input.marketId },
    select: {
      id: true,
      origin: true,
      status: true,
      title: true,
      chainId: true,
      contractAddress: true
    }
  });
  if (!market) throw new Error("Market not found.");
  if (market.origin !== "native") throw new Error("Target orders are only available on native curve markets.");
  if (market.status !== "trading_live") throw new Error("This market is not open for target orders yet.");
  if (!market.contractAddress || !market.chainId) throw new Error("Native market contract is not deployed or indexed yet.");
  if (market.chainId !== input.chainId) throw new Error("Target order chain does not match market chain.");
  if (process.env.NATIVE_MARKETS_ENABLED !== "true") throw new Error("Native trading is disabled.");
  const expectedExecutor = targetExecutorAddress(input.chainId);
  if (!expectedExecutor) throw new Error("Native target order executor is not configured.");
  if (expectedExecutor.toLowerCase() !== input.executorAddress.toLowerCase()) throw new Error("Target order executor does not match server configuration.");
  if (input.user.walletAddress.toLowerCase() !== input.walletAddress.toLowerCase()) throw new Error("Connected wallet does not match signed-in user.");

  const event = await verifiedCreatedEvent({ ...input, marketAddress: market.contractAddress });
  const depositUsdc = usdc(event.deposited);
  const amountUsdc = usdc(event.notional);
  const feeUsdc = Math.max(depositUsdc - amountUsdc, 0);
  const expiresAt = event.expiresAt > BigInt(0)
    ? new Date(Number(event.expiresAt) * 1000)
    : input.expiresAt ? new Date(input.expiresAt) : null;

  const order = await db.nativeTargetOrder.upsert({
    where: {
      executorAddress_executorOrderId: {
        executorAddress: expectedExecutor,
        executorOrderId: event.orderId
      }
    },
    create: {
      marketId: market.id,
      userId: input.user.id,
      walletAddress: input.user.walletAddress,
      side: sideFromIndex(Number(event.side)),
      amountUsdc,
      targetPrice: Number(event.maxPriceBps) / 10_000,
      maxPriceBps: Number(event.maxPriceBps),
      depositUsdc,
      feeUsdc,
      status: "open",
      executorAddress: expectedExecutor,
      executorOrderId: event.orderId,
      createTxHash: input.txHash,
      expiresAt,
      raw: {
        origin: "native",
        executionMode: "target_order_executor",
        chainId: input.chainId,
        contractAddress: market.contractAddress,
        eventLogIndex: event.logIndex
      } as never
    },
    update: {
      userId: input.user.id,
      walletAddress: input.user.walletAddress,
      status: "open",
      createTxHash: input.txHash,
      amountUsdc,
      targetPrice: Number(event.maxPriceBps) / 10_000,
      maxPriceBps: Number(event.maxPriceBps),
      depositUsdc,
      feeUsdc,
      expiresAt,
      failureReason: null
    }
  });

  return { order, market };
}

export async function listNativeTargetOrders(input: { marketId: string; userId?: string | null; walletAddress?: string | null }) {
  if (!input.userId && !input.walletAddress) return [];
  const db = requireDatabase();
  const orders = await db.nativeTargetOrder.findMany({
    where: {
      marketId: input.marketId,
      OR: [
        input.userId ? { userId: input.userId } : undefined,
        input.walletAddress ? { walletAddress: { equals: input.walletAddress, mode: "insensitive" } } : undefined
      ].filter(Boolean) as never
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  return orders;
}

export async function recordNativeTargetOrderCancellation(input: {
  marketId: string;
  orderId: string;
  user: AuthUser;
  txHash: string;
}) {
  const db = requireDatabase();
  const order = await db.nativeTargetOrder.findFirst({
    where: { id: input.orderId, marketId: input.marketId },
    include: { market: true }
  });
  if (!order) throw new Error("Target order not found.");
  if (order.userId !== input.user.id || order.walletAddress.toLowerCase() !== input.user.walletAddress.toLowerCase()) {
    throw new Error("Target order belongs to a different wallet.");
  }
  if (!order.executorAddress || !order.executorOrderId) throw new Error("Target order is missing executor details.");
  if (!order.market.chainId) throw new Error("Market chain is not configured.");
  await verifiedCancelledEvent({
    txHash: input.txHash,
    chainId: order.market.chainId,
    executorAddress: order.executorAddress,
    executorOrderId: order.executorOrderId,
    walletAddress: input.user.walletAddress
  });
  return db.nativeTargetOrder.update({
    where: { id: order.id },
    data: {
      status: "cancelled",
      cancelTxHash: input.txHash,
      cancelledAt: new Date(),
      failureReason: null
    }
  });
}

export function nativeTargetOrderReadiness() {
  const chainId = defaultChainId();
  const config = chainConfig(chainId);
  const executor = targetExecutorAddress(chainId);
  const hasKey = Boolean(process.env.NATIVE_TARGET_ORDER_EXECUTOR_PRIVATE_KEY || process.env.NATIVE_RESOLUTION_BOT_PRIVATE_KEY);
  const enabled = process.env.NATIVE_TARGET_ORDERS_ENABLED === "true";
  return {
    enabled,
    configured: Boolean(executor && config.rpcUrl && hasKey),
    chainId,
    executor,
    rpcConfigured: Boolean(config.rpcUrl),
    signerConfigured: hasKey
  };
}

async function checkExecutorReady(input: {
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
  accountAddress: Address;
  executor: Address;
  chainId: number;
}): Promise<NativeTargetOrderResult[]> {
  const results: NativeTargetOrderResult[] = [];
  const balance = await input.publicClient.getBalance({ address: input.accountAddress });
  const minimum = BigInt(process.env.NATIVE_TARGET_ORDER_MIN_GAS_WEI || "100000000000000");
  results.push({
    action: "readiness",
    ok: balance >= minimum,
    status: balance >= minimum ? "ready" : "needs_gas",
    detail: `Executor wallet ${input.accountAddress} has ${formatEther(balance)} native gas on chain ${input.chainId}.`
  });
  if (balance < minimum) return results;

  const role = await input.publicClient.readContract({
    address: input.executor,
    abi: targetExecutorAbi,
    functionName: "EXECUTOR_ROLE"
  });
  const hasRole = await input.publicClient.readContract({
    address: input.executor,
    abi: targetExecutorAbi,
    functionName: "hasRole",
    args: [role, input.accountAddress]
  });
  results.push({
    action: "readiness",
    ok: Boolean(hasRole),
    status: hasRole ? "has_executor_role" : "missing_executor_role",
    detail: hasRole ? "Executor role confirmed." : `Grant EXECUTOR_ROLE to ${input.accountAddress} on ${input.executor}.`
  });
  return results;
}

async function recordTargetFill(input: {
  db: ReturnType<typeof requireDatabase>;
  order: {
    id: string;
    marketId: string;
    userId: string | null;
    walletAddress: string;
    side: Side;
    amountUsdc: number;
    targetPrice: number;
    executorAddress: string | null;
    executorOrderId: string | null;
  };
  market: {
    id: string;
    title: string;
    creatorWallet: string | null;
    contractAddress: string | null;
    chainId: number | null;
    rulesHash: string | null;
    metadataHash: string | null;
  };
  event: {
    notional: bigint;
    fee: bigint;
    shares: bigint;
    logIndex: number;
  };
  txHash: string;
}) {
  const notionalUsdc = usdc(input.event.notional);
  const feeUsdc = usdc(input.event.fee);
  const shares = usdc(input.event.shares);
  const existingTrade = await input.db.nativeTrade.findUnique({
    where: { txHash_eventLogIndex: { txHash: input.txHash, eventLogIndex: input.event.logIndex } }
  });
  if (existingTrade) {
    await input.db.nativeTargetOrder.update({
      where: { id: input.order.id },
      data: {
        status: "executed",
        executeTxHash: input.txHash,
        triggeredAt: new Date(),
        executedAt: new Date(),
        failureReason: null
      }
    });
    return { trade: existingTrade, receipt: null };
  }

  const position = await input.db.nativePosition.create({
    data: {
      marketId: input.market.id,
      userId: input.order.userId,
      walletAddress: input.order.walletAddress,
      side: input.order.side,
      shares,
      notionalUsdc,
      status: "open",
      txHash: input.txHash
    }
  });
  const trade = await input.db.nativeTrade.create({
    data: {
      marketId: input.market.id,
      positionId: position.id,
      walletAddress: input.order.walletAddress,
      side: input.order.side,
      notionalUsdc,
      feeUsdc,
      txHash: input.txHash,
      eventLogIndex: input.event.logIndex
    }
  });
  const receipt = await input.db.marketReceipt.create({
    data: {
      marketId: input.market.id,
      userId: input.order.userId,
      walletAddress: input.order.walletAddress,
      side: input.order.side,
      title: `${input.order.side === "ride" ? "Rode" : "Faded"} ${input.market.title}`,
      proof: "Native target order execution",
      payload: {
        origin: "native",
        executionMode: "target_order_executor",
        chainId: input.market.chainId,
        contractAddress: input.market.contractAddress,
        executorAddress: input.order.executorAddress,
        executorOrderId: input.order.executorOrderId,
        txHash: input.txHash,
        targetPrice: input.order.targetPrice,
        notionalUsdc,
        feeUsdc,
        shares,
        rulesHash: input.market.rulesHash,
        metadataHash: input.market.metadataHash
      } as never
    }
  });
  const feeSplit = nativeTradingFeeSplit({ notionalUsdc, feeUsdc });
  await input.db.creatorFeeLedger.create({
    data: {
      marketId: input.market.id,
      creatorWallet: input.market.creatorWallet ?? input.market.contractAddress ?? input.order.walletAddress,
      sourceTxHash: input.txHash,
      volumeUsdc: notionalUsdc,
      creatorFeeUsdc: feeSplit.creatorFeeUsd,
      protocolFeeUsdc: feeSplit.platformFeeUsd,
      rewardsFeeUsdc: feeSplit.proversPoolFeeUsd,
      securityFeeUsdc: feeSplit.buybackBurnFeeUsd
    }
  });
  await recordNativeTradingFeeLedger({
    userId: input.order.userId,
    tradeId: trade.id,
    marketId: input.market.id,
    side: input.order.side,
    notionalUsdc,
    feeUsdc,
    txHash: input.txHash
  });
  const volumePoints = Math.floor(notionalUsdc / 100);
  if (volumePoints > 0 && input.order.userId) {
    await input.db.pointsEvent.create({
      data: {
        userId: input.order.userId,
        season: activeSeason(),
        reason: "native_target_order_volume",
        points: volumePoints,
        metadata: {
          marketId: input.market.id,
          targetOrderId: input.order.id,
          tradeId: trade.id,
          receiptId: receipt.id,
          txHash: input.txHash,
          pointsRule: "native_volume_points_per_100_usdc"
        } as never
      }
    });
    await input.db.user.update({
      where: { id: input.order.userId },
      data: { pointsTotal: { increment: volumePoints } }
    });
  }
  await input.db.nativeTargetOrder.update({
    where: { id: input.order.id },
    data: {
      status: "executed",
      executeTxHash: input.txHash,
      triggeredAt: new Date(),
      executedAt: new Date(),
      failureReason: null
    }
  });
  return { trade, receipt };
}

export async function runNativeTargetOrders(input: NativeTargetOrderRunInput = {}) {
  const readiness = nativeTargetOrderReadiness();
  if (!input.force && !readiness.enabled) {
    return { ok: true, skipped: true, reason: "NATIVE_TARGET_ORDERS_ENABLED is not true", readiness, results: [] as NativeTargetOrderResult[] };
  }
  const chainId = input.chainId ?? readiness.chainId;
  const executor = targetExecutorAddress(chainId);
  const limit = input.limit ?? Number(process.env.NATIVE_TARGET_ORDER_MAX_ORDERS || 20);
  const results: NativeTargetOrderResult[] = [];
  if (!readiness.configured || !executor) {
    results.push({
      action: "readiness",
      ok: true,
      status: "skipped",
      detail: "Target order execution skipped because the executor contract, RPC, or signer is not fully configured."
    });
    return { ok: true, skipped: false, chainId, executor, signer: null, readiness, results };
  }

  const db = requireDatabase();
  const { account, publicClient: readClient, walletClient } = await clients(chainId);
  const readinessResults = await checkExecutorReady({ publicClient: readClient, accountAddress: account.address, executor, chainId });
  results.push(...readinessResults);
  if (readinessResults.some((result) => !result.ok)) {
    return { ok: false, skipped: false, chainId, executor, signer: account.address, readiness, results };
  }

  const orders = await db.nativeTargetOrder.findMany({
    where: {
      status: "open",
      executorAddress: { equals: executor, mode: "insensitive" },
      executorOrderId: { not: null },
      market: {
        origin: "native",
        chainId,
        contractAddress: { not: null }
      }
    },
    include: { market: true },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  for (const order of orders) {
    const marketAddress = configuredAddress(order.market.contractAddress);
    if (!marketAddress || !order.executorOrderId) continue;
    try {
      if (order.expiresAt && order.expiresAt.getTime() <= Date.now()) {
        const hash = await walletClient.writeContract({
          address: executor,
          abi: targetExecutorAbi,
          functionName: "expireOrder",
          args: [BigInt(order.executorOrderId)]
        });
        const receipt = await readClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Target order expiry transaction failed.");
        await db.nativeTargetOrder.update({
          where: { id: order.id },
          data: { status: "expired", cancelledAt: new Date(), failureReason: null }
        });
        results.push({ action: "expire", orderId: order.id, marketId: order.marketId, ok: true, status: "expired", txHash: hash });
        continue;
      }

      const currentPriceBps = await readClient.readContract({
        address: marketAddress,
        abi: nativeTargetMarketAbi,
        functionName: "currentPriceBps",
        args: [sideIndex(order.side as Side)]
      }) as bigint;
      if (currentPriceBps > BigInt(order.maxPriceBps)) {
        results.push({
          action: "execute",
          orderId: order.id,
          marketId: order.marketId,
          ok: true,
          status: "waiting_for_target",
          detail: `Current ${Number(currentPriceBps) / 100}% is above target ${order.maxPriceBps / 100}%.`
        });
        continue;
      }

      const hash = await walletClient.writeContract({
        address: executor,
        abi: targetExecutorAbi,
        functionName: "executeOrder",
        args: [BigInt(order.executorOrderId)]
      });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Target order execution transaction failed.");
      const tradeEvent = parseTradeEventFromReceipt({
        receipt,
        marketAddress,
        walletAddress: order.walletAddress,
        side: order.side as Side
      });
      await recordTargetFill({
        db,
        order: {
          id: order.id,
          marketId: order.marketId,
          userId: order.userId,
          walletAddress: order.walletAddress,
          side: order.side as Side,
          amountUsdc: order.amountUsdc,
          targetPrice: order.targetPrice,
          executorAddress: order.executorAddress,
          executorOrderId: order.executorOrderId
        },
        market: {
          id: order.market.id,
          title: order.market.title,
          creatorWallet: order.market.creatorWallet,
          contractAddress: order.market.contractAddress,
          chainId: order.market.chainId,
          rulesHash: order.market.rulesHash,
          metadataHash: order.market.metadataHash
        },
        event: tradeEvent,
        txHash: hash
      });
      results.push({ action: "execute", orderId: order.id, marketId: order.marketId, ok: true, status: "executed", txHash: hash });
    } catch (error) {
      const detail = errorMessage(error);
      await db.nativeTargetOrder.update({
        where: { id: order.id },
        data: { failureReason: detail.slice(0, 1000) }
      }).catch(() => undefined);
      results.push({ action: "execute", orderId: order.id, marketId: order.marketId, ok: false, status: "failed", detail });
    }
  }

  return {
    ok: results.every((result) => result.ok),
    skipped: false,
    chainId,
    executor,
    signer: account.address,
    readiness,
    results
  };
}
