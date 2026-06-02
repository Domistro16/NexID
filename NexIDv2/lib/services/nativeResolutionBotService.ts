import { createPublicClient, createWalletClient, http, maxUint256, parseAbi, toHex, type Address, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { requireDatabase } from "@/lib/server/db";
import { syncNativeMarketFactoryEvents } from "@/lib/services/nativeMarketIndexerService";
import { verifyClosedNativeMarketResults } from "@/lib/services/nativeResultVerificationService";

const umaResolutionManagerAbi = parseAbi([
  "function closeMarket(address market)",
  "function assertMarketResult(address market,uint8 winner,bool invalid,bytes claim) returns (bytes32)",
  "function settleAssertion(bytes32 assertionId) returns (bool)",
  "function assertionLiveness() view returns (uint64)",
  "function assertionCurrency() view returns (address)",
  "function optimisticOracle() view returns (address)",
  "function activeAssertionByMarket(address market) view returns (bytes32)",
  "function assertions(bytes32 assertionId) view returns (address market,uint8 winner,address asserter,bytes32 claimHash,bool invalid,bool disputed,bool resolved,bool assertedTruthfully)"
]);

const oracleAbi = parseAbi([
  "function getMinimumBond(address currency) view returns (uint256)"
]);

const erc20BotAbi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)"
]);

type BotAction =
  | "close_market"
  | "verify_result"
  | "assert_result"
  | "settle_assertion"
  | "sync_events";

type BotResult = {
  action: BotAction;
  marketId?: string;
  assertionId?: string;
  ok: boolean;
  txHash?: string;
  outcome?: "ride" | "fade" | "invalid" | "needs_review";
  status?: string;
  confidence?: number;
  detail?: string;
};

type BotRunInput = {
  chainId?: number;
  limit?: number;
  force?: boolean;
};

function configuredAddress(value?: string | null): Address | null {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return value as Address;
}

function privateKey() {
  const raw = process.env.NATIVE_RESOLUTION_BOT_PRIVATE_KEY;
  if (!raw) throw new Error("NATIVE_RESOLUTION_BOT_PRIVATE_KEY is required for the native resolution bot.");
  return raw.startsWith("0x") ? raw as Hex : `0x${raw}` as Hex;
}

function chainConfig(chainId: number): { chain: Chain; rpcUrl?: string } {
  if (chainId === 84532) return { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL };
  if (chainId === 8453) return { chain: base, rpcUrl: process.env.BASE_RPC_URL };
  throw new Error("Unsupported native market chain.");
}

function resolutionManagerAddress() {
  const address = configuredAddress(process.env.NATIVE_RESOLUTION_MANAGER_ADDRESS);
  if (!address) throw new Error("NATIVE_RESOLUTION_MANAGER_ADDRESS is required for the native resolution bot.");
  return address;
}

function defaultChainId() {
  return Number(process.env.NATIVE_EVENTS_CHAIN_ID || process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || 84532);
}

function sideIndex(outcome: "ride" | "fade" | "invalid") {
  return outcome === "fade" ? 1 : 0;
}

function outcomeFromSide(value: unknown) {
  return Number(value) === 1 ? "fade" : "ride";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function isRateLimitError(error: unknown) {
  const message = errorMessage(error);
  return /\b429\b|rate.?limit|too many requests|quota/i.test(message);
}

function rateLimitedResult(input: { action: BotAction; marketId?: string; assertionId?: string; detail: string }): BotResult {
  return {
    action: input.action,
    marketId: input.marketId,
    assertionId: input.assertionId,
    ok: true,
    status: "rate_limited",
    detail: `Rate limited; will retry on the next bot run. ${input.detail}`
  };
}

function deadlineFromNow(seconds: bigint | number) {
  return new Date(Date.now() + Number(seconds) * 1000);
}

async function clients(chainId: number) {
  const config = chainConfig(chainId);
  if (!config.rpcUrl) throw new Error(`RPC URL is not configured for chain ${chainId}.`);
  const account = privateKeyToAccount(privateKey());
  const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl) });
  return { account, publicClient, walletClient };
}

async function recordResolutionError(marketId: string, message: string) {
  const db = requireDatabase();
  const existing = await db.marketResolution.findFirst({
    where: { marketId },
    orderBy: { updatedAt: "desc" }
  });
  if (!existing) return;
  await db.marketResolution.update({
    where: { id: existing.id },
    data: { lastError: message }
  });
}

async function closeExpiredMarkets(input: {
  chainId: number;
  limit: number;
  manager: Address;
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
  walletClient: Awaited<ReturnType<typeof clients>>["walletClient"];
}) {
  const db = requireDatabase();
  const markets = await db.market.findMany({
    where: {
      origin: "native",
      chainId: input.chainId,
      contractAddress: { not: null },
      closeTime: { lte: new Date() },
      status: { in: ["trading_live", "live_pending_open"] }
    },
    orderBy: { closeTime: "asc" },
    take: input.limit
  });
  const results: BotResult[] = [];

  for (const market of markets) {
    try {
      const marketAddress = configuredAddress(market.contractAddress);
      if (!marketAddress) throw new Error("Market contract address is invalid.");
      const hash = await input.walletClient.writeContract({
        address: input.manager,
        abi: umaResolutionManagerAbi,
        functionName: "closeMarket",
        args: [marketAddress]
      });
      const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Close transaction failed.");
      await db.market.update({
        where: { id: market.id },
        data: { status: "closed", resolutionState: "closed" }
      });
      const existingResolution = await db.marketResolution.findFirst({
        where: { marketId: market.id },
        orderBy: { updatedAt: "desc" }
      });
      if (existingResolution) {
        await db.marketResolution.update({
          where: { id: existingResolution.id },
          data: { status: existingResolution.status === "pending" ? "pending_review" : existingResolution.status, lastError: null }
        });
      } else {
        await db.marketResolution.create({
          data: { marketId: market.id, status: "pending_review", resolutionMode: "uma_oov3" }
        });
      }
      await db.adminAuditLog.create({
        data: { action: "native_resolution_bot_close", target: market.id, metadata: { txHash: hash, chainId: input.chainId } as never }
      });
      results.push({ action: "close_market", marketId: market.id, ok: true, txHash: hash });
    } catch (error) {
      const detail = errorMessage(error);
      await recordResolutionError(market.id, detail).catch(() => undefined);
      results.push(isRateLimitError(error) ? rateLimitedResult({ action: "close_market", marketId: market.id, detail }) : { action: "close_market", marketId: market.id, ok: false, detail });
    }
  }

  return results;
}

async function approveAssertionBond(input: {
  manager: Address;
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
  walletClient: Awaited<ReturnType<typeof clients>>["walletClient"];
  accountAddress: Address;
}) {
  const assertionCurrency = await input.publicClient.readContract({
    address: input.manager,
    abi: umaResolutionManagerAbi,
    functionName: "assertionCurrency"
  });
  const optimisticOracle = await input.publicClient.readContract({
    address: input.manager,
    abi: umaResolutionManagerAbi,
    functionName: "optimisticOracle"
  });
  const minimumBond = await input.publicClient.readContract({
    address: optimisticOracle,
    abi: oracleAbi,
    functionName: "getMinimumBond",
    args: [assertionCurrency]
  });
  if (minimumBond === BigInt(0)) return { assertionCurrency, minimumBond };

  const allowance = await input.publicClient.readContract({
    address: assertionCurrency,
    abi: erc20BotAbi,
    functionName: "allowance",
    args: [input.accountAddress, input.manager]
  });
  if (allowance >= minimumBond) return { assertionCurrency, minimumBond };

  const hash = await input.walletClient.writeContract({
    address: assertionCurrency,
    abi: erc20BotAbi,
    functionName: "approve",
    args: [input.manager, maxUint256]
  });
  const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("UMA assertion bond approval failed.");
  return { assertionCurrency, minimumBond };
}

async function assertQueuedResults(input: {
  chainId: number;
  limit: number;
  manager: Address;
  accountAddress: Address;
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
  walletClient: Awaited<ReturnType<typeof clients>>["walletClient"];
}) {
  const db = requireDatabase();
  const resolutions = await db.marketResolution.findMany({
    where: {
      status: "ready_to_assert",
      assertionId: null
    },
    orderBy: { updatedAt: "asc" },
    take: input.limit
  });
  const results: BotResult[] = [];

  for (const resolution of resolutions) {
    const market = await db.market.findUnique({ where: { id: resolution.marketId } });
    if (!market || market.origin !== "native" || market.chainId !== input.chainId || !market.contractAddress) continue;
    try {
      if (market.status !== "closed") throw new Error("Market must be closed before UMA assertion.");
      const outcome = resolution.proposedOutcome;
      if (!outcome || !["ride", "fade", "invalid"].includes(outcome)) throw new Error("Queued resolution needs a ride, fade, or invalid outcome.");
      const claim = resolution.assertionClaim?.trim();
      if (!claim || claim.length < 32) throw new Error("Queued resolution needs a clear UMA assertion claim.");
      const marketAddress = configuredAddress(market.contractAddress);
      if (!marketAddress) throw new Error("Market contract address is invalid.");

      await approveAssertionBond({
        manager: input.manager,
        publicClient: input.publicClient,
        walletClient: input.walletClient,
        accountAddress: input.accountAddress
      });
      const liveness = await input.publicClient.readContract({
        address: input.manager,
        abi: umaResolutionManagerAbi,
        functionName: "assertionLiveness"
      });
      const { result: assertionId, request } = await input.publicClient.simulateContract({
        account: input.accountAddress,
        address: input.manager,
        abi: umaResolutionManagerAbi,
        functionName: "assertMarketResult",
        args: [marketAddress, sideIndex(outcome), outcome === "invalid", toHex(claim)]
      });
      const hash = await input.walletClient.writeContract(request);
      const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("UMA assertion transaction failed.");
      await db.marketResolution.update({
        where: { id: resolution.id },
        data: {
          status: "asserted",
          resolutionMode: "uma_oov3",
          assertionId,
          assertionTxHash: hash,
          txHash: hash,
          proposedAt: new Date(),
          assertionDeadline: deadlineFromNow(liveness),
          proposerWallet: resolution.proposerWallet ?? input.accountAddress,
          lastError: null
        }
      });
      await db.market.update({
        where: { id: market.id },
        data: { status: "result_proposed", resolutionState: "uma_asserted" }
      });
      await db.adminAuditLog.create({
        data: { action: "native_resolution_bot_assert", target: market.id, metadata: { assertionId, txHash: hash, outcome } as never }
      });
      results.push({ action: "assert_result", marketId: market.id, assertionId, ok: true, txHash: hash });
    } catch (error) {
      const detail = errorMessage(error);
      await db.marketResolution.update({ where: { id: resolution.id }, data: { lastError: detail } }).catch(() => undefined);
      results.push(isRateLimitError(error) ? rateLimitedResult({ action: "assert_result", marketId: resolution.marketId, detail }) : { action: "assert_result", marketId: resolution.marketId, ok: false, detail });
    }
  }

  return results;
}

async function settleReadyAssertions(input: {
  chainId: number;
  limit: number;
  manager: Address;
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
  walletClient: Awaited<ReturnType<typeof clients>>["walletClient"];
}) {
  const db = requireDatabase();
  const resolutions = await db.marketResolution.findMany({
    where: {
      status: { in: ["asserted", "disputed"] },
      assertionId: { not: null },
      assertionDeadline: { lte: new Date() }
    },
    orderBy: { assertionDeadline: "asc" },
    take: input.limit
  });
  const results: BotResult[] = [];

  for (const resolution of resolutions) {
    const market = await db.market.findUnique({ where: { id: resolution.marketId } });
    if (!market || market.chainId !== input.chainId || !resolution.assertionId) continue;
    try {
      const assertionId = resolution.assertionId as Hex;
      const assertionState = await input.publicClient.readContract({
        address: input.manager,
        abi: umaResolutionManagerAbi,
        functionName: "assertions",
        args: [assertionId]
      }) as readonly unknown[];
      const disputed = Boolean(assertionState[5]);
      const alreadyResolved = Boolean(assertionState[6]);
      const assertedTruthfully = Boolean(assertionState[7]);
      if (disputed && resolution.status !== "disputed") {
        await db.marketResolution.update({
          where: { id: resolution.id },
          data: { status: "disputed" }
        });
        await db.market.update({
          where: { id: market.id },
          data: { status: "disputed", resolutionState: "uma_disputed" }
        });
      }

      let hash: Hex | undefined;
      if (!alreadyResolved) {
        hash = await input.walletClient.writeContract({
          address: input.manager,
          abi: umaResolutionManagerAbi,
          functionName: "settleAssertion",
          args: [assertionId]
        });
        const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("UMA settlement transaction failed.");
      }

      const settledState = await input.publicClient.readContract({
        address: input.manager,
        abi: umaResolutionManagerAbi,
        functionName: "assertions",
        args: [assertionId]
      }) as readonly unknown[];
      const resolved = Boolean(settledState[6]);
      const truthful = Boolean(settledState[7]);
      const invalid = Boolean(settledState[4]);
      const winner = outcomeFromSide(settledState[1]);
      const nextStatus = !resolved ? "asserted" : truthful ? invalid ? "invalid_refund" : "settled" : "assertion_rejected";

      await db.marketResolution.update({
        where: { id: resolution.id },
        data: {
          status: nextStatus,
          finalOutcome: resolved && truthful ? invalid ? "invalid" : winner : undefined,
          finalizedAt: resolved && truthful ? new Date() : undefined,
          settlementTxHash: hash ?? resolution.settlementTxHash,
          txHash: hash ?? resolution.txHash,
          lastError: null
        }
      });
      if (resolved && !truthful) {
        await db.market.update({
          where: { id: market.id },
          data: { status: "closed", resolutionState: "uma_rejected" }
        });
      }
      await db.adminAuditLog.create({
        data: { action: "native_resolution_bot_settle", target: market.id, metadata: { assertionId, txHash: hash, status: nextStatus } as never }
      });
      results.push({ action: "settle_assertion", marketId: market.id, assertionId, ok: true, txHash: hash });
    } catch (error) {
      const detail = errorMessage(error);
      await db.marketResolution.update({ where: { id: resolution.id }, data: { lastError: detail } }).catch(() => undefined);
      results.push(isRateLimitError(error) ? rateLimitedResult({ action: "settle_assertion", marketId: resolution.marketId, assertionId: resolution.assertionId ?? undefined, detail }) : { action: "settle_assertion", marketId: resolution.marketId, assertionId: resolution.assertionId ?? undefined, ok: false, detail });
    }
  }

  return results;
}

export function nativeResolutionBotReadiness() {
  const enabled = process.env.NATIVE_RESOLUTION_BOT_ENABLED === "true";
  const chainId = defaultChainId();
  const config = chainConfig(chainId);
  const manager = configuredAddress(process.env.NATIVE_RESOLUTION_MANAGER_ADDRESS);
  const hasKey = Boolean(process.env.NATIVE_RESOLUTION_BOT_PRIVATE_KEY);
  return {
    enabled,
    configured: Boolean(manager && config.rpcUrl && hasKey),
    chainId,
    manager,
    rpcConfigured: Boolean(config.rpcUrl),
    signerConfigured: hasKey
  };
}

export async function queueNativeMarketUmaAssertion(input: {
  marketId: string;
  outcome: "ride" | "fade" | "invalid";
  claim: string;
  proposerWallet?: string;
}) {
  const db = requireDatabase();
  const market = await db.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error("Market not found.");
  if (market.origin !== "native") throw new Error("Only native NexMarkets can use UMA resolution.");
  if (!market.contractAddress) throw new Error("Native market contract is not indexed yet.");
  if (market.status !== "closed" && market.status !== "result_proposed" && market.status !== "disputed") {
    throw new Error("Close the market before queueing a UMA assertion.");
  }

  const current = await db.marketResolution.findFirst({
    where: { marketId: market.id },
    orderBy: { updatedAt: "desc" }
  });
  const data = {
    proposedOutcome: input.outcome,
    status: "ready_to_assert",
    resolutionMode: "uma_oov3",
    assertionClaim: input.claim,
    proposerWallet: input.proposerWallet,
    lastError: null
  };
  const resolution = current
    ? await db.marketResolution.update({ where: { id: current.id }, data })
    : await db.marketResolution.create({ data: { marketId: market.id, ...data } });
  await db.market.update({
    where: { id: market.id },
    data: { resolutionState: "uma_ready_to_assert" }
  });
  await db.adminAuditLog.create({
    data: { action: "queue_uma_resolution_assertion", target: market.id, metadata: { outcome: input.outcome } as never }
  });
  return resolution;
}

export async function runNativeResolutionBot(input: BotRunInput = {}) {
  const readiness = nativeResolutionBotReadiness();
  if (!input.force && !readiness.enabled) {
    return { ok: true, skipped: true, reason: "NATIVE_RESOLUTION_BOT_ENABLED is not true", readiness, results: [] as BotResult[] };
  }
  if (!readiness.configured) {
    throw new Error("Native resolution bot is not fully configured.");
  }

  const chainId = input.chainId ?? readiness.chainId;
  const limit = input.limit ?? Number(process.env.NATIVE_RESOLUTION_BOT_MAX_MARKETS || 10);
  const manager = resolutionManagerAddress();
  const { account, publicClient, walletClient } = await clients(chainId);
  const results: BotResult[] = [];

  try {
    const sync = await syncNativeMarketFactoryEvents({ chainId });
    results.push({ action: "sync_events", ok: true, detail: JSON.stringify(sync) });
  } catch (error) {
    const detail = errorMessage(error);
    results.push(isRateLimitError(error) ? rateLimitedResult({ action: "sync_events", detail }) : { action: "sync_events", ok: false, detail });
  }

  results.push(...await closeExpiredMarkets({ chainId, limit, manager, publicClient, walletClient }));
  results.push(...await verifyClosedNativeMarketResults({ limit, autoQueue: process.env.NEXMARKETS_AUTO_QUEUE_VERIFIED_ASSERTIONS === "true" }));
  results.push(...await assertQueuedResults({ chainId, limit, manager, accountAddress: account.address, publicClient, walletClient }));
  results.push(...await settleReadyAssertions({ chainId, limit, manager, publicClient, walletClient }));

  try {
    const sync = await syncNativeMarketFactoryEvents({ chainId });
    results.push({ action: "sync_events", ok: true, detail: JSON.stringify(sync) });
  } catch (error) {
    const detail = errorMessage(error);
    results.push(isRateLimitError(error) ? rateLimitedResult({ action: "sync_events", detail }) : { action: "sync_events", ok: false, detail });
  }

  return {
    ok: results.every((result) => result.ok),
    skipped: false,
    chainId,
    manager,
    signer: account.address,
    results
  };
}
