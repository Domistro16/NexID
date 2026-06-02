import { createPublicClient, createWalletClient, formatEther, http, maxUint256, parseAbi, toHex, type Address, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { requireDatabase } from "@/lib/server/db";
import { syncNativeMarketFactoryEvents } from "@/lib/services/nativeMarketIndexerService";
import { verifyClosedNativeMarketResults } from "@/lib/services/nativeResultVerificationService";

const umaResolutionManagerAbi = parseAbi([
  "function closeMarket(address market)",
  "function assertMarketResult(address market,uint8 winner,bool invalid,bytes claim) returns (bytes32)",
  "function settleAssertion(bytes32 assertionId) returns (bool)",
  "function RESOLVER_ROLE() view returns (bytes32)",
  "function ASSERTER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role,address account) view returns (bool)",
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

const nativeBinaryMarketAbi = parseAbi([
  "function RESOLUTION_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role,address account) view returns (bool)"
]);

type BotAction =
  | "wallet_gas_check"
  | "role_check"
  | "close_market"
  | "verify_result"
  | "assert_result"
  | "settle_assertion"
  | "sync_events";

type BotResult = {
  action: BotAction;
  marketId?: string;
  assertionId?: string;
  manager?: string;
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
  sync?: boolean;
};

type NativeResolutionMarket = {
  id: string;
  origin?: string;
  status?: string;
  chainId: number | null;
  contractAddress: string | null;
  resolutionManagerAddress: string | null;
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

function marketResolutionManager(market: Pick<NativeResolutionMarket, "resolutionManagerAddress">, fallbackManager: Address) {
  return configuredAddress(market.resolutionManagerAddress) ?? fallbackManager;
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

function rateLimitedResult(input: { action: BotAction; marketId?: string; assertionId?: string; manager?: string; detail: string }): BotResult {
  return {
    action: input.action,
    marketId: input.marketId,
    assertionId: input.assertionId,
    manager: input.manager,
    ok: true,
    status: "rate_limited",
    detail: `Rate limited; will retry on the next bot run. ${input.detail}`
  };
}

function deadlineFromNow(seconds: bigint | number) {
  return new Date(Date.now() + Number(seconds) * 1000);
}

function minimumBotGasWei() {
  const configured = process.env.NATIVE_RESOLUTION_MIN_GAS_WEI;
  if (!configured) return BigInt("100000000000000");
  try {
    return BigInt(configured);
  } catch {
    return BigInt("100000000000000");
  }
}

async function clients(chainId: number) {
  const config = chainConfig(chainId);
  if (!config.rpcUrl) throw new Error(`RPC URL is not configured for chain ${chainId}.`);
  const account = privateKeyToAccount(privateKey());
  const pollingInterval = Number(process.env.NATIVE_RESOLUTION_RPC_POLLING_MS || 12000);
  const transport = http(config.rpcUrl, {
    retryCount: 1,
    retryDelay: 2500,
    timeout: 25000
  });
  const publicClient = createPublicClient({ chain: config.chain, transport, pollingInterval });
  const walletClient = createWalletClient({ account, chain: config.chain, transport, pollingInterval });
  return { account, publicClient, walletClient };
}

async function checkBotGas(input: {
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
  accountAddress: Address;
  chainId: number;
}): Promise<BotResult> {
  const balance = await input.publicClient.getBalance({ address: input.accountAddress });
  const minimum = minimumBotGasWei();
  if (balance >= minimum) {
    return {
      action: "wallet_gas_check",
      ok: true,
      status: "ready",
      detail: `Bot wallet ${input.accountAddress} has ${formatEther(balance)} native gas on chain ${input.chainId}.`
    };
  }
  return {
    action: "wallet_gas_check",
    ok: false,
    status: "needs_gas",
    detail: `Bot wallet ${input.accountAddress} has ${formatEther(balance)} native gas on chain ${input.chainId}. Fund this wallet with Base ETH before close/assert/settle writes can run. Minimum configured threshold is ${formatEther(minimum)} ETH.`
  };
}

async function checkBotRoles(input: {
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
  manager: Address;
  accountAddress: Address;
}): Promise<BotResult> {
  const [resolverRole, asserterRole] = await Promise.all([
    input.publicClient.readContract({
      address: input.manager,
      abi: umaResolutionManagerAbi,
      functionName: "RESOLVER_ROLE"
    }),
    input.publicClient.readContract({
      address: input.manager,
      abi: umaResolutionManagerAbi,
      functionName: "ASSERTER_ROLE"
    })
  ]);
  const [hasResolverRole, hasAsserterRole] = await Promise.all([
    input.publicClient.readContract({
      address: input.manager,
      abi: umaResolutionManagerAbi,
      functionName: "hasRole",
      args: [resolverRole, input.accountAddress]
    }),
    input.publicClient.readContract({
      address: input.manager,
      abi: umaResolutionManagerAbi,
      functionName: "hasRole",
      args: [asserterRole, input.accountAddress]
    })
  ]);
  if (!hasResolverRole) {
    return {
      action: "role_check",
      ok: false,
      status: "missing_resolver_role",
      detail: `Bot wallet ${input.accountAddress} is missing RESOLVER_ROLE on ${input.manager}. Grant RESOLVER_ROLE before closeMarket can run. ASSERTER_ROLE=${hasAsserterRole ? "yes" : "no"}.`
    };
  }
  if (!hasAsserterRole) {
    return {
      action: "role_check",
      ok: true,
      status: "missing_asserter_role",
      detail: `Bot wallet ${input.accountAddress} can close markets but is missing ASSERTER_ROLE on ${input.manager}. Grant ASSERTER_ROLE before result assertions can run.`
    };
  }
  return {
    action: "role_check",
    ok: true,
    status: "ready",
    detail: `Bot wallet ${input.accountAddress} has RESOLVER_ROLE and ASSERTER_ROLE on ${input.manager}.`
  };
}

async function checkResolutionWriteAccess(input: {
  action: BotAction;
  marketId: string;
  marketAddress: Address;
  manager: Address;
  accountAddress: Address;
  needsResolver?: boolean;
  needsAsserter?: boolean;
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
}): Promise<BotResult | null> {
  const resolutionRole = await input.publicClient.readContract({
    address: input.marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "RESOLUTION_ROLE"
  });
  const managerCanResolveMarket = await input.publicClient.readContract({
    address: input.marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "hasRole",
    args: [resolutionRole, input.manager]
  });

  if (!managerCanResolveMarket) {
    return {
      action: input.action,
      marketId: input.marketId,
      manager: input.manager,
      ok: false,
      status: "manager_missing_market_resolution_role",
      detail: `Manager ${input.manager} does not have RESOLUTION_ROLE on market ${input.marketAddress}. This market was created with a different resolution manager or factory, so the bot refused to send a reverting write.`
    };
  }

  if (input.needsResolver) {
    const resolverRole = await input.publicClient.readContract({
      address: input.manager,
      abi: umaResolutionManagerAbi,
      functionName: "RESOLVER_ROLE"
    });
    const hasResolverRole = await input.publicClient.readContract({
      address: input.manager,
      abi: umaResolutionManagerAbi,
      functionName: "hasRole",
      args: [resolverRole, input.accountAddress]
    });
    if (!hasResolverRole) {
      return {
        action: input.action,
        marketId: input.marketId,
        manager: input.manager,
        ok: false,
        status: "missing_resolver_role",
        detail: `Bot wallet ${input.accountAddress} is missing RESOLVER_ROLE on manager ${input.manager}. Grant RESOLVER_ROLE before this market can be closed.`
      };
    }
  }

  if (input.needsAsserter) {
    const asserterRole = await input.publicClient.readContract({
      address: input.manager,
      abi: umaResolutionManagerAbi,
      functionName: "ASSERTER_ROLE"
    });
    const hasAsserterRole = await input.publicClient.readContract({
      address: input.manager,
      abi: umaResolutionManagerAbi,
      functionName: "hasRole",
      args: [asserterRole, input.accountAddress]
    });
    if (!hasAsserterRole) {
      return {
        action: input.action,
        marketId: input.marketId,
        manager: input.manager,
        ok: false,
        status: "missing_asserter_role",
        detail: `Bot wallet ${input.accountAddress} is missing ASSERTER_ROLE on manager ${input.manager}. Grant ASSERTER_ROLE before this result can be asserted.`
      };
    }
  }

  return null;
}

async function recordResolutionError(marketId: string, message: string) {
  const db = requireDatabase();
  const existing = await db.marketResolution.findFirst({
    where: { marketId },
    orderBy: { updatedAt: "desc" }
  });
  if (!existing) {
    await db.marketResolution.create({
      data: { marketId, status: "bot_error", resolutionMode: "uma_oov3", lastError: message }
    });
    return;
  }
  await db.marketResolution.update({
    where: { id: existing.id },
    data: { lastError: message }
  });
}

async function recordResolutionPreflightFailure(result: BotResult) {
  if (!result.marketId || result.ok) return;
  const db = requireDatabase();
  const marketState = result.status === "manager_missing_market_resolution_role" || result.status === "assertion_manager_mismatch"
    ? "resolution_misconfigured"
    : "resolution_blocked";
  const resolutionStatus = marketState;
  const existing = await db.marketResolution.findFirst({
    where: { marketId: result.marketId },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) {
    await db.marketResolution.update({
      where: { id: existing.id },
      data: { status: resolutionStatus, resolutionMode: "uma_oov3", lastError: result.detail ?? result.status ?? "Resolution preflight failed." }
    });
  } else {
    await db.marketResolution.create({
      data: {
        marketId: result.marketId,
        status: resolutionStatus,
        resolutionMode: "uma_oov3",
        lastError: result.detail ?? result.status ?? "Resolution preflight failed."
      }
    });
  }
  await db.market.update({
    where: { id: result.marketId },
    data: { resolutionState: marketState }
  });
}

async function closeExpiredMarkets(input: {
  chainId: number;
  limit: number;
  fallbackManager: Address;
  accountAddress: Address;
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
    let manager = input.fallbackManager;
    try {
      const marketAddress = configuredAddress(market.contractAddress);
      if (!marketAddress) throw new Error("Market contract address is invalid.");
      manager = marketResolutionManager(market, input.fallbackManager);
      const preflight = await checkResolutionWriteAccess({
        action: "close_market",
        marketId: market.id,
        marketAddress,
        manager,
        accountAddress: input.accountAddress,
        needsResolver: true,
        publicClient: input.publicClient
      });
      if (preflight) {
        await recordResolutionPreflightFailure(preflight).catch(() => undefined);
        results.push(preflight);
        continue;
      }

      const hash = await input.walletClient.writeContract({
        address: manager,
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
        data: { action: "native_resolution_bot_close", target: market.id, metadata: { txHash: hash, chainId: input.chainId, manager } as never }
      });
      results.push({ action: "close_market", marketId: market.id, manager, ok: true, txHash: hash });
    } catch (error) {
      const detail = errorMessage(error);
      if (isRateLimitError(error)) {
        results.push(rateLimitedResult({ action: "close_market", marketId: market.id, manager, detail }));
      } else {
        await recordResolutionError(market.id, detail).catch(() => undefined);
        results.push({ action: "close_market", marketId: market.id, manager, ok: false, detail });
      }
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
  fallbackManager: Address;
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
    let manager = input.fallbackManager;
    try {
      if (market.status !== "closed") throw new Error("Market must be closed before UMA assertion.");
      const outcome = resolution.proposedOutcome;
      if (!outcome || !["ride", "fade", "invalid"].includes(outcome)) throw new Error("Queued resolution needs a ride, fade, or invalid outcome.");
      const claim = resolution.assertionClaim?.trim();
      if (!claim || claim.length < 32) throw new Error("Queued resolution needs a clear UMA assertion claim.");
      const marketAddress = configuredAddress(market.contractAddress);
      if (!marketAddress) throw new Error("Market contract address is invalid.");
      manager = marketResolutionManager(market, input.fallbackManager);
      const preflight = await checkResolutionWriteAccess({
        action: "assert_result",
        marketId: market.id,
        marketAddress,
        manager,
        accountAddress: input.accountAddress,
        needsAsserter: true,
        publicClient: input.publicClient
      });
      if (preflight) {
        await recordResolutionPreflightFailure(preflight).catch(() => undefined);
        results.push(preflight);
        continue;
      }

      await approveAssertionBond({
        manager,
        publicClient: input.publicClient,
        walletClient: input.walletClient,
        accountAddress: input.accountAddress
      });
      const liveness = await input.publicClient.readContract({
        address: manager,
        abi: umaResolutionManagerAbi,
        functionName: "assertionLiveness"
      });
      const { result: assertionId, request } = await input.publicClient.simulateContract({
        account: input.accountAddress,
        address: manager,
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
        data: { action: "native_resolution_bot_assert", target: market.id, metadata: { assertionId, txHash: hash, outcome, manager } as never }
      });
      results.push({ action: "assert_result", marketId: market.id, assertionId, manager, ok: true, txHash: hash });
    } catch (error) {
      const detail = errorMessage(error);
      if (isRateLimitError(error)) {
        results.push(rateLimitedResult({ action: "assert_result", marketId: resolution.marketId, manager, detail }));
      } else {
        await db.marketResolution.update({ where: { id: resolution.id }, data: { lastError: detail } }).catch(() => undefined);
        results.push({ action: "assert_result", marketId: resolution.marketId, manager, ok: false, detail });
      }
    }
  }

  return results;
}

async function settleReadyAssertions(input: {
  chainId: number;
  limit: number;
  fallbackManager: Address;
  accountAddress: Address;
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
    let manager = input.fallbackManager;
    try {
      const assertionId = resolution.assertionId as Hex;
      const marketAddress = configuredAddress(market.contractAddress);
      if (!marketAddress) throw new Error("Market contract address is invalid.");
      manager = marketResolutionManager(market, input.fallbackManager);
      const preflight = await checkResolutionWriteAccess({
        action: "settle_assertion",
        marketId: market.id,
        marketAddress,
        manager,
        accountAddress: input.accountAddress,
        publicClient: input.publicClient
      });
      if (preflight) {
        await recordResolutionPreflightFailure(preflight).catch(() => undefined);
        results.push({ ...preflight, assertionId });
        continue;
      }

      const assertionState = await input.publicClient.readContract({
        address: manager,
        abi: umaResolutionManagerAbi,
        functionName: "assertions",
        args: [assertionId]
      }) as readonly unknown[];
      const assertionMarket = configuredAddress(String(assertionState[0]));
      if (!assertionMarket || assertionMarket.toLowerCase() !== marketAddress.toLowerCase()) {
        const failure: BotResult = {
          action: "settle_assertion",
          marketId: market.id,
          assertionId,
          manager,
          ok: false,
          status: "assertion_manager_mismatch",
          detail: `Assertion ${assertionId} is not registered on manager ${manager} for market ${marketAddress}. The stored market manager is wrong or the assertion was created through another manager.`
        };
        await recordResolutionPreflightFailure(failure).catch(() => undefined);
        results.push(failure);
        continue;
      }
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
          address: manager,
          abi: umaResolutionManagerAbi,
          functionName: "settleAssertion",
          args: [assertionId]
        });
        const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("UMA settlement transaction failed.");
      }

      const settledState = await input.publicClient.readContract({
        address: manager,
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
        data: { action: "native_resolution_bot_settle", target: market.id, metadata: { assertionId, txHash: hash, status: nextStatus, manager } as never }
      });
      results.push({ action: "settle_assertion", marketId: market.id, assertionId, manager, ok: true, txHash: hash });
    } catch (error) {
      const detail = errorMessage(error);
      if (isRateLimitError(error)) {
        results.push(rateLimitedResult({ action: "settle_assertion", marketId: resolution.marketId, assertionId: resolution.assertionId ?? undefined, manager, detail }));
      } else {
        await db.marketResolution.update({ where: { id: resolution.id }, data: { lastError: detail } }).catch(() => undefined);
        results.push({ action: "settle_assertion", marketId: resolution.marketId, assertionId: resolution.assertionId ?? undefined, manager, ok: false, detail });
      }
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
  const shouldSyncEvents = input.sync ?? process.env.NATIVE_RESOLUTION_BOT_SYNC_EVENTS === "true";
  const defaultManager = resolutionManagerAddress();
  const { account, publicClient, walletClient } = await clients(chainId);
  const results: BotResult[] = [];

  try {
    const gasCheck = await checkBotGas({ publicClient, accountAddress: account.address, chainId });
    results.push(gasCheck);
    if (!gasCheck.ok) {
      results.push({ action: "sync_events", ok: true, status: "skipped", detail: "Event sync skipped because the bot wallet cannot pay gas for resolution writes." });
      return {
        ok: false,
        skipped: false,
        chainId,
        manager: defaultManager,
        signer: account.address,
        results
      };
    }
  } catch (error) {
    const detail = errorMessage(error);
    results.push(isRateLimitError(error) ? rateLimitedResult({ action: "wallet_gas_check", detail }) : { action: "wallet_gas_check", ok: false, status: "failed", detail });
    if (!isRateLimitError(error)) {
      return {
        ok: false,
        skipped: false,
        chainId,
        manager: defaultManager,
        signer: account.address,
        results
      };
    }
  }

  results.push(...await closeExpiredMarkets({ chainId, limit, fallbackManager: defaultManager, accountAddress: account.address, publicClient, walletClient }));
  results.push(...await verifyClosedNativeMarketResults({ limit, autoQueue: process.env.NEXMARKETS_AUTO_QUEUE_VERIFIED_ASSERTIONS === "true" }));
  results.push(...await assertQueuedResults({ chainId, limit, fallbackManager: defaultManager, accountAddress: account.address, publicClient, walletClient }));
  results.push(...await settleReadyAssertions({ chainId, limit, fallbackManager: defaultManager, accountAddress: account.address, publicClient, walletClient }));

  if (shouldSyncEvents) {
    try {
      const sync = await syncNativeMarketFactoryEvents({ chainId });
      results.push({ action: "sync_events", ok: true, detail: JSON.stringify(sync) });
    } catch (error) {
      const detail = errorMessage(error);
      results.push(isRateLimitError(error) ? rateLimitedResult({ action: "sync_events", detail }) : { action: "sync_events", ok: false, detail });
    }
  } else {
    results.push({ action: "sync_events", ok: true, status: "skipped", detail: "Event sync skipped for this run. Pass sync=true or set NATIVE_RESOLUTION_BOT_SYNC_EVENTS=true to enable it." });
  }

  return {
    ok: results.every((result) => result.ok),
    skipped: false,
    chainId,
    manager: defaultManager,
    signer: account.address,
    results
  };
}
