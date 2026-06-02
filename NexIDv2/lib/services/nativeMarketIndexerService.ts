import { createPublicClient, http, parseAbiItem } from "viem";
import { base, baseSepolia } from "viem/chains";
import { requireDatabase } from "@/lib/server/db";
import { activeSeason } from "@/lib/services/pointsEngine";

const marketCreatedEvent = parseAbiItem(
  "event MarketCreated(address indexed market, address indexed creator, bytes32 indexed rulesHash, bytes32 metadataHash, bytes32 templateId, bytes32 stakeId, uint256 openAt, uint256 closeTime)"
);
const marketOpenedEvent = parseAbiItem("event MarketOpened(uint256 openedAt)");
const marketClosedEvent = parseAbiItem("event MarketClosed(uint256 closedAt)");
const resultProposedEvent = parseAbiItem("event ResultProposed(uint8 indexed winner)");
const resultDisputedEvent = parseAbiItem("event ResultDisputed()");
const marketSettledEvent = parseAbiItem("event MarketSettled(uint8 indexed winner, uint256 settlementPool)");
const marketInvalidatedEvent = parseAbiItem("event MarketInvalidated(uint256 refundPool)");

const lifecycleEvents = [
  { name: "MarketOpened", event: marketOpenedEvent },
  { name: "MarketClosed", event: marketClosedEvent },
  { name: "ResultProposed", event: resultProposedEvent },
  { name: "ResultDisputed", event: resultDisputedEvent },
  { name: "MarketSettled", event: marketSettledEvent },
  { name: "MarketInvalidated", event: marketInvalidatedEvent }
] as const;

type MarketCreatedLog = {
  args: {
    market?: `0x${string}`;
    creator?: `0x${string}`;
    rulesHash?: `0x${string}`;
    metadataHash?: `0x${string}`;
    templateId?: `0x${string}`;
    stakeId?: `0x${string}`;
    openAt?: bigint;
    closeTime?: bigint;
  };
  transactionHash: `0x${string}` | null;
  blockNumber: bigint | null;
  logIndex: number | null;
};

type LifecycleLog = {
  args: Record<string, unknown>;
  transactionHash: `0x${string}` | null;
  blockNumber: bigint | null;
  logIndex: number | null;
};

type NativeLogClient = {
  getLogs(input: never): Promise<unknown[]>;
};

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as never;
}

function networkConfig(chainId: number) {
  if (chainId === 84532) {
    return {
      chain: baseSepolia,
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL,
      factoryAddress: process.env.NATIVE_MARKET_FACTORY_ADDRESS
    };
  }
  if (chainId !== 8453) throw new Error("Unsupported native market chain.");
  return {
    chain: base,
    rpcUrl: process.env.BASE_RPC_URL,
    factoryAddress: process.env.NATIVE_MARKET_FACTORY_ADDRESS
  };
}

function dateFromSeconds(value: bigint) {
  return new Date(Number(value) * 1000);
}

function launchStatusFromOpenAt(openAt?: bigint) {
  return openAt && dateFromSeconds(openAt).getTime() <= Date.now() ? "trading_live" : "live_pending_open";
}

function sideFromIndex(value: unknown) {
  return Number(value ?? 0) === 1 ? "fade" : "ride";
}

function blockMetadata(log: Pick<LifecycleLog, "transactionHash" | "blockNumber" | "logIndex">) {
  return {
    source: "onchain_indexer",
    txHash: log.transactionHash,
    blockNumber: log.blockNumber ? Number(log.blockNumber) : null,
    logIndex: log.logIndex
  };
}

async function recordCreatorLaunchProof(db: ReturnType<typeof requireDatabase>, input: {
  marketId: string;
  userId?: string | null;
  creatorWallet: string;
  txHash?: string | null;
  rulesHash?: string | null;
  metadataHash?: string | null;
}) {
  if (!input.userId) return;
  const existing = await db.marketReceipt.findFirst({
    where: { marketId: input.marketId, userId: input.userId, proof: "Native market launch" }
  });
  if (existing) return;
  const receipt = await db.marketReceipt.create({
    data: {
      marketId: input.marketId,
      userId: input.userId,
      walletAddress: input.creatorWallet,
      title: "Launched native NexMarket",
      proof: "Native market launch",
      payload: {
        origin: "native",
        txHash: input.txHash ?? null,
        rulesHash: input.rulesHash ?? null,
        metadataHash: input.metadataHash ?? null,
        pointsRule: "base_valid_launch"
      } as never
    }
  });
  await db.pointsEvent.create({
    data: {
      userId: input.userId,
      season: activeSeason(),
      reason: "native_market_valid_launch",
      points: 40,
      metadata: {
        marketId: input.marketId,
        receiptId: receipt.id,
        txHash: input.txHash ?? null,
        rulesHash: input.rulesHash ?? null
      } as never
    }
  });
  await db.user.update({
    where: { id: input.userId },
    data: { pointsTotal: { increment: 40 } }
  });
}

async function recordCreatorCleanSettlementProof(db: ReturnType<typeof requireDatabase>, input: {
  marketId: string;
  userId?: string | null;
  creatorWallet?: string | null;
  txHash?: string | null;
  finalOutcome: "ride" | "fade";
}) {
  if (!input.userId) return;
  const existing = await db.marketReceipt.findFirst({
    where: { marketId: input.marketId, userId: input.userId, proof: "Native market clean settlement" }
  });
  if (existing) return;
  const creatorWallet = input.creatorWallet?.toLowerCase() ?? "";
  const trades = await db.nativeTrade.findMany({ where: { marketId: input.marketId } });
  const eligibleTrades = trades.filter((trade) => trade.walletAddress.toLowerCase() !== creatorWallet);
  const uniqueTraders = new Set(eligibleTrades.map((trade) => trade.walletAddress.toLowerCase())).size;
  const volumeUsdc = eligibleTrades.reduce((sum, trade) => sum + trade.notionalUsdc, 0);
  const points = 80 + (uniqueTraders * 2) + Math.floor(volumeUsdc / 100);
  const receipt = await db.marketReceipt.create({
    data: {
      marketId: input.marketId,
      userId: input.userId,
      walletAddress: input.creatorWallet,
      side: input.finalOutcome,
      title: "Native market settled cleanly",
      proof: "Native market clean settlement",
      payload: {
        origin: "native",
        txHash: input.txHash ?? null,
        finalOutcome: input.finalOutcome,
        uniqueTraders,
        volumeUsdc,
        pointsRule: "clean_settlement_bonus_unique_trader_volume"
      } as never
    }
  });
  await db.pointsEvent.create({
    data: {
      userId: input.userId,
      season: activeSeason(),
      reason: "native_market_clean_settlement",
      points,
      metadata: {
        marketId: input.marketId,
        receiptId: receipt.id,
        txHash: input.txHash ?? null,
        finalOutcome: input.finalOutcome,
        uniqueTraders,
        volumeUsdc
      } as never
    }
  });
  await db.user.update({
    where: { id: input.userId },
    data: { pointsTotal: { increment: points } }
  });
}

function settlementPoints(input: { notionalUsdc: number; firstTradeAt: Date; closeTime?: Date | null }) {
  const base = 60 + Math.min(input.notionalUsdc * 1.2, 300);
  if (!input.closeTime) return Math.round(base);
  const hoursBeforeClose = (input.closeTime.getTime() - input.firstTradeAt.getTime()) / 3600000;
  const timingMultiplier = hoursBeforeClose >= 24 ? 1.5 : hoursBeforeClose >= 6 ? 1.25 : 1;
  return Math.round(base * timingMultiplier);
}

async function recordNativeTraderSettlementProofs(db: ReturnType<typeof requireDatabase>, input: {
  marketId: string;
  finalOutcome: "ride" | "fade";
  txHash?: string | null;
}) {
  const market = await db.market.findUnique({ where: { id: input.marketId } });
  const positions = await db.nativePosition.findMany({
    where: { marketId: input.marketId, side: { in: ["ride", "fade"] } },
    orderBy: { createdAt: "asc" }
  });
  if (!positions.length) return;

  await db.nativePosition.updateMany({
    where: { marketId: input.marketId, side: input.finalOutcome },
    data: { status: "won" }
  });
  await db.nativePosition.updateMany({
    where: { marketId: input.marketId, side: input.finalOutcome === "ride" ? "fade" : "ride" },
    data: { status: "lost" }
  });

  const winning = positions.filter((position) => position.side === input.finalOutcome);
  const grouped = new Map<string, {
    userId?: string | null;
    walletAddress: string;
    side: "ride" | "fade";
    notionalUsdc: number;
    shares: number;
    firstTradeAt: Date;
  }>();
  for (const position of winning) {
    if (position.side !== "ride" && position.side !== "fade") continue;
    const key = `${position.userId ?? position.walletAddress.toLowerCase()}:${position.side}`;
    const current = grouped.get(key);
    if (current) {
      current.notionalUsdc += position.notionalUsdc;
      current.shares += position.shares;
      if (position.createdAt < current.firstTradeAt) current.firstTradeAt = position.createdAt;
    } else {
      grouped.set(key, {
        userId: position.userId,
        walletAddress: position.walletAddress,
        side: position.side,
        notionalUsdc: position.notionalUsdc,
        shares: position.shares,
        firstTradeAt: position.createdAt
      });
    }
  }

  for (const entry of grouped.values()) {
    if (!entry.userId) continue;
    const existing = await db.marketReceipt.findFirst({
      where: {
        marketId: input.marketId,
        userId: entry.userId,
        walletAddress: entry.walletAddress,
        side: entry.side,
        proof: "Native settled call"
      }
    });
    if (existing) continue;
    const points = settlementPoints({
      notionalUsdc: entry.notionalUsdc,
      firstTradeAt: entry.firstTradeAt,
      closeTime: market?.closeTime
    });
    const receipt = await db.marketReceipt.create({
      data: {
        marketId: input.marketId,
        userId: entry.userId,
        walletAddress: entry.walletAddress,
        side: entry.side,
        title: `${entry.side === "ride" ? "Rode" : "Faded"} correctly`,
        proof: "Native settled call",
        payload: {
          origin: "native",
          txHash: input.txHash ?? null,
          finalOutcome: input.finalOutcome,
          notionalUsdc: entry.notionalUsdc,
          shares: entry.shares,
          firstTradeAt: entry.firstTradeAt.toISOString(),
          closeTime: market?.closeTime?.toISOString() ?? null,
          points,
          pointsRule: "correct_native_call_with_timing_multiplier"
        } as never
      }
    });
    await db.pointsEvent.create({
      data: {
        userId: entry.userId,
        season: activeSeason(),
        reason: "native_correct_call_settled",
        points,
        metadata: {
          marketId: input.marketId,
          receiptId: receipt.id,
          txHash: input.txHash ?? null,
          finalOutcome: input.finalOutcome,
          side: entry.side,
          notionalUsdc: entry.notionalUsdc
        } as never
      }
    });
    await db.user.update({
      where: { id: entry.userId },
      data: { pointsTotal: { increment: points } }
    });
  }
}

async function markNativePositionsInvalidRefund(db: ReturnType<typeof requireDatabase>, marketId: string) {
  await db.nativePosition.updateMany({
    where: { marketId },
    data: { status: "invalid_refund" }
  });
}

async function upsertResolution(db: ReturnType<typeof requireDatabase>, input: {
  marketId: string;
  proposedOutcome?: "ride" | "fade";
  finalOutcome?: "ride" | "fade" | "invalid";
  status: string;
  txHash?: string | null;
}) {
  const current = await db.marketResolution.findFirst({
    where: { marketId: input.marketId },
    orderBy: { updatedAt: "desc" }
  });
  const data = {
    proposedOutcome: input.proposedOutcome,
    finalOutcome: input.finalOutcome,
    status: input.status,
    txHash: input.txHash ?? undefined,
    proposedAt: input.proposedOutcome ? new Date() : undefined,
    finalizedAt: input.finalOutcome ? new Date() : undefined
  };
  if (current) {
    return db.marketResolution.update({
      where: { id: current.id },
      data
    });
  }
  return db.marketResolution.create({
    data: {
      marketId: input.marketId,
      ...data
    }
  });
}

async function applyLifecycleLog(db: ReturnType<typeof requireDatabase>, market: {
  id: string;
  creatorUserId: string | null;
  creatorWallet: string | null;
}, eventName: string, log: LifecycleLog) {
  if (eventName === "MarketOpened") {
    await db.market.update({
      where: { id: market.id },
      data: { status: "trading_live", routeDecision: blockMetadata(log) as never }
    });
    return;
  }
  if (eventName === "MarketClosed") {
    await db.market.update({
      where: { id: market.id },
      data: { status: "closed", resolutionState: "closed", routeDecision: blockMetadata(log) as never }
    });
    return;
  }
  if (eventName === "ResultProposed") {
    const proposedOutcome = sideFromIndex(log.args.winner);
    await db.market.update({
      where: { id: market.id },
      data: { status: "result_proposed", resolutionState: "result_proposed", routeDecision: blockMetadata(log) as never }
    });
    await upsertResolution(db, {
      marketId: market.id,
      proposedOutcome,
      status: "result_proposed",
      txHash: log.transactionHash
    });
    return;
  }
  if (eventName === "ResultDisputed") {
    await db.market.update({
      where: { id: market.id },
      data: { status: "disputed", resolutionState: "disputed", routeDecision: blockMetadata(log) as never }
    });
    await db.marketDispute.create({
      data: {
        marketId: market.id,
        status: "open",
        txHash: log.transactionHash
      }
    });
    return;
  }
  if (eventName === "MarketSettled") {
    const finalOutcome = sideFromIndex(log.args.winner);
    await db.market.update({
      where: { id: market.id },
      data: { status: "settled", resolutionState: "settled", routeDecision: blockMetadata(log) as never }
    });
    await upsertResolution(db, {
      marketId: market.id,
      finalOutcome,
      status: "settled",
      txHash: log.transactionHash
    });
    await db.launchStake.updateMany({
      where: { marketId: market.id, status: { not: "returned" } },
      data: { status: "returned", returnedAt: new Date(), txHash: log.transactionHash }
    });
    await recordCreatorCleanSettlementProof(db, {
      marketId: market.id,
      userId: market.creatorUserId,
      creatorWallet: market.creatorWallet,
      txHash: log.transactionHash,
      finalOutcome
    });
    await recordNativeTraderSettlementProofs(db, {
      marketId: market.id,
      txHash: log.transactionHash,
      finalOutcome
    });
    return;
  }
  if (eventName === "MarketInvalidated") {
    await db.market.update({
      where: { id: market.id },
      data: { status: "invalid_refund", resolutionState: "invalid_refund", routeDecision: blockMetadata(log) as never }
    });
    await upsertResolution(db, {
      marketId: market.id,
      finalOutcome: "invalid",
      status: "invalid_refund",
      txHash: log.transactionHash
    });
    await db.launchStake.updateMany({
      where: { marketId: market.id, status: { not: "slashed" } },
      data: { status: "slashed", slashedAt: new Date(), txHash: log.transactionHash }
    });
    await markNativePositionsInvalidRefund(db, market.id);
  }
}

async function getLogsInBatches(client: NativeLogClient, input: {
  address: `0x${string}`;
  event: (typeof lifecycleEvents)[number]["event"] | typeof marketCreatedEvent;
  fromBlock: bigint;
  toBlock: bigint;
}) {
  const maxBlockRange = BigInt(1900);
  const batches: unknown[][] = [];
  let batchStart = input.fromBlock;
  while (batchStart <= input.toBlock) {
    const batchEnd = batchStart + maxBlockRange > input.toBlock ? input.toBlock : batchStart + maxBlockRange;
    const batch = await client.getLogs({
      address: input.address,
      event: input.event,
      fromBlock: batchStart,
      toBlock: batchEnd
    } as never);
    batches.push(batch);
    batchStart = batchEnd + BigInt(1);
  }
  return batches.flat();
}

async function syncNativeMarketLifecycleEvents(input: {
  db: ReturnType<typeof requireDatabase>;
  client: NativeLogClient;
  chainId: number;
  latestBlock: bigint;
}) {
  const markets = await input.db.market.findMany({
    where: {
      origin: "native",
      chainId: input.chainId,
      contractAddress: { not: null }
    },
    orderBy: { updatedAt: "desc" },
    take: 100
  });
  const fallbackWindow = BigInt(1900);
  const fallbackStart = input.latestBlock > fallbackWindow ? input.latestBlock - fallbackWindow : BigInt(0);
  let indexed = 0;

  for (const market of markets) {
    if (!market.contractAddress) continue;
    const contractAddress = market.contractAddress.toLowerCase() as `0x${string}`;
    for (const spec of lifecycleEvents) {
      const cursor = await input.db.onchainEventCursor.findUnique({
        where: {
          chainId_contractAddress_eventName: {
            chainId: input.chainId,
            contractAddress,
            eventName: spec.name
          }
        }
      });
      const fromBlock = cursor ? BigInt(cursor.lastBlock) + BigInt(1) : fallbackStart;
      if (fromBlock > input.latestBlock) continue;
      const logs = await getLogsInBatches(input.client, {
        address: contractAddress,
        event: spec.event,
        fromBlock,
        toBlock: input.latestBlock
      }) as LifecycleLog[];
      for (const log of logs) {
        await applyLifecycleLog(input.db, market, spec.name, log);
      }
      indexed += logs.length;
      await input.db.onchainEventCursor.upsert({
        where: {
          chainId_contractAddress_eventName: {
            chainId: input.chainId,
            contractAddress,
            eventName: spec.name
          }
        },
        update: {
          lastBlock: Number(input.latestBlock),
          lastLogIndex: logs.length ? Number(logs[logs.length - 1]?.logIndex ?? 0) : cursor?.lastLogIndex ?? 0
        },
        create: {
          chainId: input.chainId,
          contractAddress,
          eventName: spec.name,
          lastBlock: Number(input.latestBlock),
          lastLogIndex: logs.length ? Number(logs[logs.length - 1]?.logIndex ?? 0) : 0
        }
      });
    }
  }

  return indexed;
}

export async function syncNativeMarketFactoryEvents(input: { chainId?: number; fromBlock?: bigint; toBlock?: bigint } = {}) {
  const chainId = input.chainId ?? Number(process.env.NATIVE_EVENTS_CHAIN_ID || process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || 84532);
  const config = networkConfig(chainId);
  if (!config.rpcUrl || !config.factoryAddress) {
    return {
      ok: false,
      skipped: true,
      reason: "NATIVE_MARKET_FACTORY_ADDRESS and chain RPC URL are required",
      indexed: 0
    };
  }

  const client = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl)
  });
  const factoryAddress = config.factoryAddress as `0x${string}`;
  const latestBlock = input.toBlock ?? await client.getBlockNumber();

  const db = requireDatabase();
  const cursor = await db.onchainEventCursor.findUnique({
    where: {
      chainId_contractAddress_eventName: {
        chainId,
        contractAddress: factoryAddress.toLowerCase(),
        eventName: "MarketCreated"
      }
    }
  });
  const fallbackWindow = BigInt(1900);
  const fallbackStart = latestBlock > fallbackWindow ? latestBlock - fallbackWindow : BigInt(0);
  const cursorStart = cursor ? BigInt(cursor.lastBlock) + BigInt(1) : fallbackStart;
  const fromBlock = input.fromBlock ?? cursorStart;
  const maxBlockRange = BigInt(1900);
  const logBatches: MarketCreatedLog[][] = [];
  let batchStart = fromBlock;
  while (batchStart <= latestBlock) {
    const batchEnd = batchStart + maxBlockRange > latestBlock ? latestBlock : batchStart + maxBlockRange;
    const batch = await client.getLogs({
      address: factoryAddress,
      event: marketCreatedEvent,
      fromBlock: batchStart,
      toBlock: batchEnd
    }) as MarketCreatedLog[];
    logBatches.push(batch);
    batchStart = batchEnd + BigInt(1);
  }
  const logs = logBatches.flat();

  for (const log of logs) {
    const args = log.args;
    const contractAddress = args.market?.toLowerCase();
    const creatorWallet = args.creator?.toLowerCase();
    const rulesHash = args.rulesHash;
    if (!contractAddress || !creatorWallet || !rulesHash) continue;
    const eventMetadata = jsonInput({
      source: "onchain_indexer",
      factory: factoryAddress,
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      stakeId: args.stakeId,
      templateId: args.templateId,
      openAt: args.openAt?.toString(),
      closeTime: args.closeTime?.toString()
    });
    const launchStatus = launchStatusFromOpenAt(args.openAt);
    const closeTime = args.closeTime ? dateFromSeconds(args.closeTime) : undefined;
    const existing = await db.market.findFirst({
      where: {
        origin: "native",
        chainId,
        rulesHash
      },
      orderBy: { updatedAt: "desc" }
    });

    if (existing) {
      await db.market.update({
        where: { id: existing.id },
        data: {
          status: launchStatus,
          creatorWallet,
          chainId,
          contractAddress,
          rulesHash,
          metadataHash: args.metadataHash,
          launchStakeStatus: "paid",
          closeTime,
          routeDecision: eventMetadata
        }
      });
      await db.nativeMarketRules.updateMany({
        where: { marketId: existing.id },
        data: {
          metadataHash: args.metadataHash,
          openTime: args.openAt ? dateFromSeconds(args.openAt) : undefined,
          closeTime
        }
      });
      await db.launchStake.updateMany({
        where: { marketId: existing.id },
        data: {
          stakeId: args.stakeId,
          status: "paid",
          txHash: log.transactionHash
        }
      });
      await recordCreatorLaunchProof(db, {
        marketId: existing.id,
        userId: existing.creatorUserId,
        creatorWallet,
        txHash: log.transactionHash,
        rulesHash,
        metadataHash: args.metadataHash
      });
      continue;
    }

    const indexed = await db.market.upsert({
      where: { id: `native:${chainId}:${contractAddress}` },
      update: {
        status: launchStatus,
        creatorWallet,
        chainId,
        contractAddress,
        rulesHash,
        metadataHash: args.metadataHash,
        launchStakeStatus: "paid",
        closeTime,
        routeDecision: eventMetadata
      },
      create: {
        id: `native:${chainId}:${contractAddress}`,
        origin: "native",
        status: launchStatus,
        title: "Indexed native market",
        question: "Native market metadata is waiting to be resolved from the launch draft.",
        arena: "crypto",
        creatorWallet,
        chainId,
        contractAddress,
        rulesHash,
        metadataHash: args.metadataHash,
        launchStakeStatus: "paid",
        closeTime,
        routeDecision: eventMetadata
      }
    });
    await recordCreatorLaunchProof(db, {
      marketId: indexed.id,
      userId: indexed.creatorUserId,
      creatorWallet,
      txHash: log.transactionHash,
      rulesHash,
      metadataHash: args.metadataHash
    });
  }

  await db.onchainEventCursor.upsert({
    where: {
      chainId_contractAddress_eventName: {
        chainId,
        contractAddress: factoryAddress.toLowerCase(),
        eventName: "MarketCreated"
      }
    },
    update: {
      lastBlock: Number(latestBlock),
      lastLogIndex: logs.length ? Number(logs[logs.length - 1]?.logIndex ?? 0) : cursor?.lastLogIndex ?? 0
    },
    create: {
      chainId,
      contractAddress: factoryAddress.toLowerCase(),
      eventName: "MarketCreated",
      lastBlock: Number(latestBlock),
      lastLogIndex: logs.length ? Number(logs[logs.length - 1]?.logIndex ?? 0) : 0
    }
  });

  const lifecycleIndexed = await syncNativeMarketLifecycleEvents({ db, client, chainId, latestBlock });

  return {
    ok: true,
    skipped: false,
    chainId,
    fromBlock: fromBlock.toString(),
    toBlock: latestBlock.toString(),
    indexed: logs.length,
    lifecycleIndexed
  };
}
